import * as NodeCrypto from '@effect/platform-node/NodeCrypto'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Readiness } from '@systemfsoftware/effect-readiness'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import * as Layer from 'effect/Layer'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'
import * as Scope from 'effect/Scope'
import { integresqlBinary } from './integresql-binary.js'

/**
 * The house integration-database pattern: Postgres and IntegreSQL boot inside a hardware-isolated
 * microVM on the runner's KVM device, so the suite needs no Docker daemon, no service container and
 * no shared server. Each case checks out its own database from IntegreSQL and returns it afterwards.
 */
const POSTGRES = {
  image:
    'mirror.gcr.io/library/postgres:17-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536',
  binaries: '/usr/lib/postgresql/17/bin',
}

const POSTGRES_PORT = 5432
const INTEGRESQL_PORT = 5000
const TEMPLATE = 'empty'
const GUEST = '/opt/database-server'
const RAM = '/dev/shm/database-server'
const READY = 'database server ready'
const FAILED = 'database server failed'
const STATUS = `${RAM}/boot-status`

const bootScript = (binaries: string) =>
  `#!/bin/bash
set -eu
trap 'code=$?; [ "$code" -eq 0 ] || { [ -e ${STATUS} ] || printf "boot.sh exited with status %s" "$code" > ${STATUS} || true; echo "${FAILED}"; }' EXIT
mkdir -p ${RAM}
if [ "$(id -u)" -eq 0 ]; then chown postgres ${RAM}; as() { gosu postgres "$@"; }; else as() { "$@"; }; fi
as ${binaries}/initdb --no-sync --encoding=UTF8 --locale=C.UTF-8 --username=postgres --auth=trust -D ${RAM}/data > ${RAM}/initdb.log 2>&1
echo 'host all all 0.0.0.0/0 trust' >> ${RAM}/data/pg_hba.conf
as ${binaries}/pg_ctl -D ${RAM}/data -l ${RAM}/postgres.log -w -t 60 -o "-c listen_addresses=* -c port=${POSTGRES_PORT} -c max_connections=200 -c fsync=off -c synchronous_commit=off -c full_page_writes=off" start
cp ${GUEST}/integresql /tmp/integresql
chmod +x /tmp/integresql
INTEGRESQL_PORT=${INTEGRESQL_PORT} INTEGRESQL_PGHOST=127.0.0.1 INTEGRESQL_PGPORT=${POSTGRES_PORT} INTEGRESQL_PGUSER=postgres \\
  INTEGRESQL_TEST_INITIAL_POOL_SIZE=2 INTEGRESQL_TEST_MAX_POOL_SIZE=8 /tmp/integresql > ${RAM}/integresql.log 2>&1 &
server=$!
until ( exec 3<>/dev/tcp/127.0.0.1/${INTEGRESQL_PORT} ) 2>/dev/null; do
  kill -0 "$server" || { printf 'integresql exited' > ${STATUS}; exit 1; }
  sleep 0.2
done
printf 'ready' > ${STATUS}
echo '${READY}'
wait "$server"
`

export class DatabaseServerFailed
  extends Data.TaggedError('DatabaseServerFailed')<{ readonly step: string; readonly cause: unknown }>
{
  override get message(): string {
    return `${this.step}: ${this.cause instanceof Error ? this.cause.message : String(this.cause)}`
  }
}

interface ServerHandle {
  readonly integresqlPort: number
  readonly postgresPort: number
  readonly vm: MicroVM.RunningVM
}

const guestFile = (vm: MicroVM.RunningVM, file: string) =>
  MicroVM.exec(vm, 'cat', [file]).pipe(Effect.map(({ stdout, stderr }) => `${stdout}${stderr}`))

const assertBooted = Effect.fnUntraced(function*(vm: MicroVM.RunningVM) {
  const status = yield* guestFile(vm, STATUS)
  if (status === 'ready') return
  const logs = yield* Effect.all([
    guestFile(vm, `${RAM}/initdb.log`),
    guestFile(vm, `${RAM}/postgres.log`),
    guestFile(vm, `${RAM}/integresql.log`),
  ])
  return yield* new DatabaseServerFailed({
    step: 'boot the database server',
    cause: `${status}\n${logs.join('\n')}`,
  })
})

const templates = (port: number) => `http://127.0.0.1:${port}/api/v1/templates`

const boot = Effect.gen(function*() {
  const binary = yield* integresqlBinary
  const vm = yield* MicroVM.spec(POSTGRES.image)
    .withFiles({
      [`${GUEST}/boot.sh`]: bootScript(POSTGRES.binaries),
      [`${GUEST}/integresql`]: binary,
    })
    .withCommand(['bash', `${GUEST}/boot.sh`])
    .withMemoryLimit(2048)
    .withExposedPorts([INTEGRESQL_PORT, POSTGRES_PORT])
    .withWaitStrategy(MicroVM.Wait.forLog(`${READY}|${FAILED}`))
    .scoped
  yield* assertBooted(vm)
  const integresqlPort = yield* MicroVM.port(vm, INTEGRESQL_PORT)
  const postgresPort = yield* MicroVM.port(vm, POSTGRES_PORT)
  const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
  yield* client.execute(
    HttpClientRequest.post(templates(integresqlPort)).pipe(
      HttpClientRequest.bodyJsonUnsafe({ hash: TEMPLATE }),
    ),
  )
  yield* client.execute(HttpClientRequest.put(`${templates(integresqlPort)}/${TEMPLATE}`))
  return { integresqlPort, postgresPort, vm } satisfies ServerHandle
})

// The server outlives every case in the process, so its scope is created once and never closed; the
// guest is torn down when the test process exits.
let serverPromise: Promise<ServerHandle> | undefined

const server = () =>
  serverPromise ??= Effect.runPromise(
    boot.pipe(
      Effect.provideService(Scope.Scope, Scope.makeUnsafe()),
      Effect.provide(Layer.mergeAll(
        nodeServicesLayer,
        NodeCrypto.layerSecureRandom,
        Readiness.NodeHostProber.layer,
        FetchHttpClient.layer,
      )),
    ),
  )

const TestDatabase = Schema.Struct({
  id: Schema.Int,
  database: Schema.Struct({ config: Schema.Struct({ database: Schema.String }) }),
})

/** Check out one database for the duration of `use`, then hand it back to IntegreSQL. */
export const withIntegresqlDatabase = <A, E, R>(
  use: (url: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | DatabaseServerFailed, R> =>
  Effect.scoped(Effect.gen(function*() {
    const { integresqlPort, postgresPort } = yield* Effect.tryPromise({
      try: server,
      catch: (cause) => new DatabaseServerFailed({ step: 'start the database server', cause }),
    })
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
    const tests = `${templates(integresqlPort)}/${TEMPLATE}/tests`
    const checkedOut = yield* Effect.acquireRelease(
      client.get(tests).pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(TestDatabase)),
        Effect.mapError((cause) => new DatabaseServerFailed({ step: 'check out a database', cause })),
      ),
      // A case may finish with pooled connections still open; IntegreSQL can only recreate a
      // database nothing is connected to, so the hand-back retries until the pool drains.
      ({ id }) =>
        client.execute(HttpClientRequest.post(`${tests}/${id}/recreate`)).pipe(
          Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 50 }),
          Effect.orDie,
        ),
    )
    return yield* use(
      `postgres://postgres@127.0.0.1:${postgresPort}/${checkedOut.database.config.database}`,
    )
  })).pipe(Effect.provide(FetchHttpClient.layer))
