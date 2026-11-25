import * as Clock from 'effect/Clock'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import type { ThreadId } from '../../core/Identifiers'
import { IdempotencyKey } from '../../core/Receipt'
import type { HostUpdateRequest } from '../HostUpdates'
import { HostUpdateAppended, HostUpdateError } from '../HostUpdates.schema'
import {
  BatchId,
  CanonicalBatch,
  type CanonicalRecordEnvelope,
  type DeploymentId,
  PersistedJson,
  type ProducerId,
  RecordEnvelope,
  RecordId,
  ThreadHostUpdateAppended,
} from '../Records'
import {
  type AppendConflict,
  AppendRequest,
  getRecord,
  ThreadReader,
  ThreadStore,
  type ThreadStoreFailure,
  ThreadTailRequest,
} from '../ThreadStore'
import { WakeScheduler } from '../WakeScheduler'

const MAX_TAIL_RETRIES = 8

const invalid = () => HostUpdateError.make({ reason: 'validation', message: 'The host update is not bounded JSON' })

const conflicting = () =>
  HostUpdateError.make({ reason: 'conflict', message: 'The update ID was already used with a different update' })

const contended = () =>
  HostUpdateError.make({ reason: 'contention', message: 'The Thread tail kept moving; the update did not commit' })

const decodeRecord = Schema.decodeUnknownEffect(
  Schema.Struct({
    updateId: IdempotencyKey,
    update: PersistedJson,
    relatedRunId: Schema.optionalKey(ThreadHostUpdateAppended.fields.relatedRunId),
  }),
)

const isHostUpdate = Schema.is(ThreadHostUpdateAppended)

const recordIdOf = (updateId: IdempotencyKey) => RecordId.make(`host-update:${updateId}`)
const batchIdOf = (updateId: IdempotencyKey) => BatchId.make(`host-update:${updateId}`)

const matches = (existing: CanonicalRecordEnvelope, payload: ThreadHostUpdateAppended) =>
  isHostUpdate(existing.record.payload) &&
  Schema.toEquivalence(ThreadHostUpdateAppended)(existing.record.payload, payload)

const actualTailOf = (conflict: AppendConflict) =>
  Option.fromUndefinedOr(conflict.actualTailSequence).pipe(Option.filter(() => conflict.reason === 'tail'))

/** @internal Appends host-authored Thread updates under the same progress gate as Run writes. */
export const makeHostUpdateRuntime = Effect.fnUntraced(function*(options: {
  readonly deploymentId: DeploymentId
  readonly producerId: ProducerId
}) {
  const store = yield* ThreadStore
  const wake = yield* WakeScheduler
  const reader = ThreadReader.fromStore(store)

  const existing = (threadId: ThreadId, payload: ThreadHostUpdateAppended) =>
    getRecord({ threadId, recordId: recordIdOf(payload.updateId) }).pipe(
      Effect.provideService(ThreadReader, reader),
      Effect.flatMap(Option.match({
        onNone: () => Effect.fail(conflicting()),
        onSome: (found) =>
          matches(found, payload)
            ? Effect.succeed(HostUpdateAppended.make({ sequence: found.sequence, deduplicated: true }))
            : Effect.fail(conflicting()),
      })),
    )

  const commit = (threadId: ThreadId, batch: CanonicalBatch, payload: ThreadHostUpdateAppended) => {
    const attempt = (expectedTailSequence: CanonicalRecordEnvelope['sequence'], retries: number): Effect.Effect<
      HostUpdateAppended,
      HostUpdateError | ThreadStoreFailure
    > =>
      store.append(AppendRequest.make({ threadId, batch, expectedTailSequence })).pipe(
        Effect.map((result) =>
          HostUpdateAppended.make({ sequence: result.firstSequence, deduplicated: result.replayed })
        ),
        Effect.catchTag('AppendConflict', (conflict) =>
          Option.match(actualTailOf(conflict), {
            onNone: () => existing(threadId, payload),
            onSome: (tail) => retryAfter(tail, retries),
          })),
      )

    const retryAfter = (tail: CanonicalRecordEnvelope['sequence'], retries: number) =>
      retries >= MAX_TAIL_RETRIES ? Effect.fail(contended()) : attempt(tail, retries + 1)

    return store.inspectTail(ThreadTailRequest.make({ threadId })).pipe(
      Effect.flatMap((tail) => attempt(tail.tailSequence, 0)),
    )
  }

  const append = Effect.fnUntraced(function*(request: HostUpdateRequest) {
    const fields = yield* decodeRecord({
      updateId: request.updateId,
      update: request.update,
      ...(request.relatedRunId === undefined ? {} : { relatedRunId: request.relatedRunId }),
    }).pipe(Effect.mapError(invalid))
    const payload = ThreadHostUpdateAppended.make(fields)
    const createdAt = DateTime.makeUnsafe(yield* Clock.currentTimeMillis)
    const batch = CanonicalBatch.make({
      batchId: batchIdOf(payload.updateId),
      producerId: options.producerId,
      records: [
        RecordEnvelope.make({
          recordId: recordIdOf(payload.updateId),
          family: 'thread',
          schemaVersion: 1,
          createdAt,
          deploymentId: options.deploymentId,
          payload,
        }),
      ],
    })
    const appended = yield* commit(request.threadId, batch, payload)

    yield* wake.notify(request.threadId, 'progress')

    return appended
  })

  return { append }
})
