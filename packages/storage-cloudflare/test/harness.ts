import { digestJson } from '@systemfsoftware/agent/digest'
import {
  CanonicalBatch,
  CanonicalSequence,
  DefinitionDigests,
  DeploymentId,
  Digest,
  type PersistedJson,
  ProducerId,
  RecordEnvelope,
  type SettlementOutcome,
  SubmissionSettled,
  SubmissionSettledRecord,
} from '@systemfsoftware/agent/records'
import { runIdForSubmission } from '@systemfsoftware/agent/run-journal'
import { SettlementPublication } from '@systemfsoftware/agent/settlement-publisher'
import {
  AdmissionRequest,
  type AdmissionResult,
  ApprovalDecisionCommand,
  IdempotencyKey,
  type ParentLinkage,
  Principal,
  RecoverySnapshotRequest,
  SubmissionLedger,
  submissionSettlementBatchId,
  submissionSettlementId,
  submissionSettlementRecordId,
} from '@systemfsoftware/agent/submission-ledger'
import {
  AppendRequest,
  ThreadMaterialization,
  ThreadStore,
  ThreadTailRequest,
} from '@systemfsoftware/agent/thread-store'
import { env, runInDurableObject } from 'cloudflare:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as TestClock from 'effect/testing/TestClock'

import type { ScheduleStorageObject, ThreadStorageObject } from './worker'

declare global {
  namespace Cloudflare {
    interface Env {
      THREADS: DurableObjectNamespace<ThreadStorageObject>
      SCHEDULES: DurableObjectNamespace<ScheduleStorageObject>
    }
  }
}

export const threadStub = (name: string) => env.THREADS.get(env.THREADS.idFromName(name))

export const scheduleStub = (name: string) => env.SCHEDULES.get(env.SCHEDULES.idFromName(name))

/**
 * Run one Effect program against a named Thread Durable Object's real SQLite storage
 * inside workerd. The 0.21.x pool shares Durable Object storage across tests within a run,
 * so callers mint a UNIQUE object name per test/case (mirroring how the SQLite suites mint a
 * temporary database file per case). A manual `TestClock.layer()` is provided at the root
 * so the shared conformance cases can advance time while holding a local owner
 * exactly as they do under `@effect/vitest`'s `it.effect` on Node.
 */
export const withThreadStorage = <A, E>(
  name: string,
  build: (storage: DurableObjectStorage, state: DurableObjectState) => Effect.Effect<A, E>,
): Promise<A> =>
  runInDurableObject(
    threadStub(name),
    (_instance, state) => Effect.runPromise(build(state.storage, state).pipe(Effect.provide(TestClock.layer()))),
  )

/** Run one Effect against a fresh Schedule Owner object's real SQLite storage. */
export const withScheduleStorage = <A, E>(
  name: string,
  build: (storage: DurableObjectStorage) => Effect.Effect<A, E>,
): Promise<A> => runInDurableObject(scheduleStub(name), (_instance, state) => Effect.runPromise(build(state.storage)))

export const id = <A>(schema: Schema.Codec<A, string>, value: string): A => Schema.decodeSync(schema)(value)

export const thread = (value: string) => id(AdmissionRequest.fields.threadId, value)
export const sequence = (value: number) => Schema.decodeSync(CanonicalSequence)(value)
export const at = (millis: number) => DateTime.toUtc(DateTime.makeUnsafe(millis))
export const toolCall = (value: string) => id(ApprovalDecisionCommand.fields.toolCallId, value)

export const TEST_PRINCIPAL = id(Principal, 'principal-do-ledger')
export const TEST_PRODUCER = id(ProducerId, 'producer-do-ledger')
export const OTHER_PRODUCER = id(ProducerId, 'producer-do-ledger-other')
export const TEST_AGENT = id(AdmissionRequest.fields.agentId, 'agent-do-ledger')
export const TEST_DEPLOYMENT = id(DeploymentId, 'deployment-do-ledger')
export const TEST_DEFINITION_DIGEST = Schema.decodeSync(Digest)('a'.repeat(64))

export const TEST_DIGESTS = DefinitionDigests.make({
  agent: TEST_DEFINITION_DIGEST,
  model: TEST_DEFINITION_DIGEST,
  tools: TEST_DEFINITION_DIGEST,
})

export const admission = Effect.fn('DoLedgerTest.admission')(function*(
  threadId: string,
  idempotencyKey: string,
  input: PersistedJson,
  parentLinkage?: ParentLinkage,
) {
  const inputDigest = yield* digestJson(input)

  return AdmissionRequest.make({
    threadId: thread(threadId),
    principal: TEST_PRINCIPAL,
    idempotencyKey: id(IdempotencyKey, idempotencyKey),
    agentId: TEST_AGENT,
    agentDigests: TEST_DIGESTS,
    deploymentId: TEST_DEPLOYMENT,
    inputPayload: input,
    inputDigest,
    ...(parentLinkage === undefined ? {} : { parentLinkage }),
  })
})

export const settlementPublication = Effect.fn('DoLedgerTest.settlementPublication')(function*(
  admitted: AdmissionResult,
  outcome: SettlementOutcome,
) {
  const settlementId = submissionSettlementId(admitted.submissionId)

  const payload = yield* Schema.decodeEffect(SubmissionSettledRecord)(
    SubmissionSettled.make({
      submissionId: admitted.submissionId,
      settlementId,
      receiptId: admitted.receiptId,
      outcome,
      runId: runIdForSubmission(admitted.submissionId),
      ...(outcome === 'failed'
        ? {
          result: {
            errorTag: 'DoLedgerTestFailure',
            message: 'The Durable Object ledger test Submission failed',
          },
        }
        : {}),
    }),
  ).pipe(Effect.orDie)

  const record = RecordEnvelope.make({
    recordId: submissionSettlementRecordId(admitted.submissionId),
    family: 'thread',
    schemaVersion: 1,
    createdAt: at(1),
    deploymentId: TEST_DEPLOYMENT,
    payload,
  })

  const store = yield* ThreadStore

  const snapshot = yield* (yield* SubmissionLedger).loadRecoverySnapshot(
    RecoverySnapshotRequest.make({ submissionId: admitted.submissionId }),
  )

  const threadId = snapshot.submission.threadId

  yield* store.materialize(ThreadMaterialization.make({ threadId }))
  const tail = yield* store.inspectTail(ThreadTailRequest.make({ threadId }))

  return {
    settlementId,
    request: SettlementPublication.make({
      submissionId: admitted.submissionId,
      authority: { _tag: 'Owned' },
      append: AppendRequest.make({
        threadId,
        expectedTailSequence: tail.tailSequence,

        batch: CanonicalBatch.make({
          producerId: TEST_PRODUCER,
          batchId: submissionSettlementBatchId(admitted.submissionId),
          records: [record],
        }),
      }),
    }),
  }
})
