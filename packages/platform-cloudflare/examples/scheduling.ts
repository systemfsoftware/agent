import {
  ThreadObjectNamespace,
  type ThreadObjectRpc,
} from '@systemfsoftware/agent-platform-cloudflare/cloudflare-bindings'
import {
  CloudflareSchedulingClient,
  makeScheduleOwnerObjectClass,
  ScheduleOwnerNamespace,
  type ScheduleOwnerObjectRpc,
} from '@systemfsoftware/agent-platform-cloudflare/cloudflare-scheduling'
import { type DurableSubmitAgent } from '@systemfsoftware/agent/durable-agent-runtime'
import { type ScheduleAuthorizer } from '@systemfsoftware/agent/schedule'
import { type ScheduleCreateOptions, Scheduling } from '@systemfsoftware/agent/scheduling'
import { WorkerEnvironment } from '@systemfsoftware/effect-cf'

// This example is typechecked in its own project, so it names the bindings it reads instead of
// relying on a test file elsewhere in the program to merge them into the worker `Env`.
type ExampleEnv = Cloudflare.Env & {
  readonly THREADS: DurableObjectNamespace<ThreadObjectRpc>
  readonly SCHEDULES: DurableObjectNamespace<ScheduleOwnerObjectRpc>
}
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as Schema from 'effect/Schema'

/**
 * Export the returned class. The cached policy Layer must not acquire resources that need
 * cleanup on eviction. Acquire temporary resources within Effect.scoped in manage / prepare.
 */
export const makeSchedulingOwner = <E>(
  authorizer: Layer.Layer<ScheduleAuthorizer, E, WorkerEnvironment>,
) =>
  makeScheduleOwnerObjectClass(
    Layer.merge(
      authorizer,
      Layer.effect(
        ThreadObjectNamespace,
        Effect.map(WorkerEnvironment, (env) => {
          const bindings = env as ExampleEnv

          return ThreadObjectNamespace.of({
            get: (threadId) => bindings.THREADS.get(bindings.THREADS.idFromName(threadId)),
          })
        }),
      ),
    ),
  )

/** The native Worker entry point provides WorkerEnvironment once. */
export const schedulingClientLayer = CloudflareSchedulingClient.layer.pipe(
  Layer.provide(
    Layer.effect(
      ScheduleOwnerNamespace,
      Effect.map(WorkerEnvironment, (env) => ({ namespace: (env as ExampleEnv).SCHEDULES })),
    ),
  ),
)

export const scheduleDailyReport = Effect.fn('Example.scheduleDailyReport')(function*<
  InputSchema extends Schema.Top,
>(
  agent: DurableSubmitAgent<InputSchema>,
  input: InputSchema['Type'],
  options: Omit<ScheduleCreateOptions, 'timing'>,
) {
  const scheduling = yield* Scheduling

  return yield* scheduling.create(agent, input, {
    ...options,
    timing: { _tag: 'Cron', expression: '0 8 * * *', timeZone: 'UTC' },
  })
})
