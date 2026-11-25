import * as NodeCrypto from '@effect/platform-node/NodeCrypto'
import * as PgClient from '@effect/sql-pg/PgClient'
import { it } from '@effect/vitest'
import * as PostgresStorage from '@systemfsoftware/agent-storage-postgres/postgres-storage'
import {
  durableCoordinatorConformance,
  type DurableCoordinatorStorage,
} from '@systemfsoftware/agent-testing/durable-coordinator-conformance'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'

import { withIntegresqlDatabase } from './postgres-server.js'

/**
 * Keep coordinator checks outside the adapter package to avoid a storage-postgres -> testing cycle.
 * Unset, the suite boots Postgres in the house microVM and checks a database out of IntegreSQL.
 */
const configuredUrl = process.env.EFFECT_AGENT_TEST_POSTGRES_URL

let databaseCounter = 0

const admin = (url: string, statement: string) =>
  Effect.flatMap(PgClient.PgClient, (sql) => sql.unsafe(statement)).pipe(
    Effect.provide(PgClient.layer({ url: Redacted.make(url), maxConnections: 1 })),
    Effect.orDie,
  )

/** A database per run from IntegreSQL, or one this suite owns when a server is configured. */
const withTemporaryDatabase = <A, E>(
  use: (url: string) => Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  configuredUrl === undefined
    ? withIntegresqlDatabase(use).pipe(Effect.orDie)
    : withOwnedDatabase(configuredUrl, use)

const withOwnedDatabase = <A, E>(
  adminUrl: string,
  use: (url: string) => Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      databaseCounter = databaseCounter + 1

      return `effect_agent_certification_${process.pid}_${databaseCounter}`
    }).pipe(Effect.tap((database) => admin(adminUrl, `CREATE DATABASE ${database}`))),
    (database) => {
      const url = new URL(adminUrl)

      url.pathname = `/${database}`

      return use(url.toString())
    },
    (database) => admin(adminUrl, `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`).pipe(Effect.ignore),
  )

const combinedAdapters = (url: string) =>
  PostgresStorage.layerWith({ observationPollInterval: 1 }).pipe(
    Layer.provideMerge(NodeCrypto.layer),
    Layer.provideMerge(PgClient.layer({ url: Redacted.make(url), maxConnections: 4 })),
  )

// Each cell checks out its own database; adapter connection failures are defects of the fixture.
const withStorage = <A, E>(cell: Effect.Effect<A, E, DurableCoordinatorStorage>): Effect.Effect<A, E> =>
  withTemporaryDatabase((url) => cell.pipe(Effect.provide(Layer.orDie(combinedAdapters(url)))))

it.effect(
  'converges PostgreSQL coordinator recovery after injected faults',
  // IntegreSQL hands out at most sixteen databases at once (postgres-server.ts); at four
  // connections each they stay under its max_connections of 200.
  () => durableCoordinatorConformance({ withStorage, concurrency: 16 }),
  300_000,
)
