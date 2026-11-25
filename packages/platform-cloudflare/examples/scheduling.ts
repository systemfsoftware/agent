import { ThreadObjectNamespace } from '@systemfsoftware/agent-platform-cloudflare/cloudflare-bindings'
import {
  CloudflareSchedulingClient,
  makeScheduleOwnerObjectClass,
  ScheduleOwnerNamespace,
} from '@systemfsoftware/agent-platform-cloudflare/cloudflare-scheduling'
import { type DurableSubmitAgent } from '@systemfsoftware/agent/durable-agent-runtime'
import { type ScheduleAuthorizer } from '@systemfsoftware/agent/schedule'
import { type ScheduleCreateOptions, Scheduling } from '@systemfsoftware/agent/scheduling'
import { WorkerEnvironment } from 'effect-cf'
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
        Effect.map(WorkerEnvironment, (env) =>
          ThreadObjectNamespace.of({
            get: (threadId) => env.THREADS.get(env.THREADS.idFromName(threadId)),
          })),
      ),
    ),
  )

/** The native Worker entry point provides WorkerEnvironment once. */
export const schedulingClientLayer = CloudflareSchedulingClient.layer.pipe(
  Layer.provide(
    Layer.effect(
      ScheduleOwnerNamespace,
      Effect.map(WorkerEnvironment, (env) => ({ namespace: env.SCHEDULES })),
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
