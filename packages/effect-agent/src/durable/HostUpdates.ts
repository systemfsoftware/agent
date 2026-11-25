import type * as Schema from 'effect/Schema'

import type { RunId, ThreadId } from '../core/Identifiers'

export { HostUpdateAppended, HostUpdateError } from './HostUpdates.schema'

/** One host update for `DurableAgentRuntime.appendHostUpdate`. */
export interface HostUpdateRequest {
  readonly threadId: ThreadId
  /** Caller-chosen key; repeating it with the same update returns the first commit. */
  readonly updateId: string
  /** Bounded JSON the host decodes with its own Schema. */
  readonly update: Schema.Json
  /** Set only when the update concerns a specific Run. */
  readonly relatedRunId?: RunId | undefined
}
