import { ThreadId } from '@systemfsoftware/agent/identifiers'
import { Principal } from '@systemfsoftware/agent/submission-ledger'
import { WorkerError } from '@systemfsoftware/agent/worker'
import { WorkerHostAuthorizer } from '@systemfsoftware/agent/worker-host'
import { Effect, Layer, Schema } from 'effect'

// This local example permits one user to manage workers from one conversation.
export const principal = Schema.decodeSync(Principal)('travel-user')
export const threadId = Schema.decodeSync(ThreadId)('travel-chat')

export const WorkerAccessLive = Layer.succeed(WorkerHostAuthorizer)({
  authorize: (request) =>
    request.principal === principal && request.sourceThreadId === threadId
      ? Effect.succeed(principal)
      : WorkerError.make({ operation: request.operation, reason: 'denied' }),
})
