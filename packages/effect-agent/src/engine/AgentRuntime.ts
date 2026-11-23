import type * as Effect from 'effect/Effect'
import type * as Scope from 'effect/Scope'
import type * as Stream from 'effect/Stream'

import type * as Agent from '../core/Agent.ts'
import type { RunEvent } from '../core/RunEvent.ts'
import * as Internal from './internal/agent-runtime.ts'
import type { RunOptions } from './RunOptions.ts'

/** Public AgentRuntime API. Implementation helpers remain private. */
export {
  AgentChildPending,
  type AgentCompletionProjectionRequirements,
  type AgentResult,
  AgentResultSchema,
  type AgentRuntimeFailure,
  type AgentRuntimeRequirements,
  AgentSpawner,
  type AgentSpawnerParent,
  type AgentSpawnerService,
  type DetachedRun,
  type EngineProvidedToolServices,
  renderInputPrompt,
  type RuntimeBinding,
  type SpawnDelegation,
  type SpawnedChildRun,
  type SpawnRunOptions,
  SubagentDurability,
  type SubagentDurabilityDurable,
  type SubagentDurabilityEphemeral,
  SubagentDurabilityError,
  type SubagentDurabilityService,
  ToolCallWaiting,
} from './internal/agent-runtime.ts'

/** Accept schema-encoded input, retaining runtime validation. */
export const run: <A extends Internal.ExecutableAgent, H = never, R = never>(
  agent: A,
  input: NoInfer<Agent.EncodedInput<A>>,
  options?: RunOptions<H, R>,
) => Effect.Effect<
  Internal.AgentResult<Agent.Output<A>>,
  Internal.AgentRuntimeFailure<A, H>,
  Internal.AgentRuntimeRequirements<A, R>
> = Internal.run

/** Decode external input before execution. */
export const runUnknown: <A extends Internal.ExecutableAgent, H = never, R = never>(
  agent: A,
  input: unknown,
  options?: RunOptions<H, R>,
) => Effect.Effect<
  Internal.AgentResult<Agent.Output<A>>,
  Internal.AgentRuntimeFailure<A, H>,
  Internal.AgentRuntimeRequirements<A, R>
> = Internal.runUnknown

/** Accept schema-encoded input, retaining runtime validation. */
export const start: <A extends Internal.ExecutableAgent, H = never, R = never>(
  agent: A,
  input: NoInfer<Agent.EncodedInput<A>>,
  options?: RunOptions<H, R>,
) => Effect.Effect<
  Internal.DetachedRun<Agent.Output<A>, Internal.AgentRuntimeFailure<A, H>>,
  never,
  Internal.AgentRuntimeRequirements<A, R> | Scope.Scope
> = Internal.start

/** Decode external input before execution. */
export const startUnknown: <A extends Internal.ExecutableAgent, H = never, R = never>(
  agent: A,
  input: unknown,
  options?: RunOptions<H, R>,
) => Effect.Effect<
  Internal.DetachedRun<Agent.Output<A>, Internal.AgentRuntimeFailure<A, H>>,
  never,
  Internal.AgentRuntimeRequirements<A, R> | Scope.Scope
> = Internal.startUnknown

/** Accept schema-encoded input, retaining runtime validation. */
export const stream: <A extends Internal.ExecutableAgent, H = never, R = never>(
  agent: A,
  input: NoInfer<Agent.EncodedInput<A>>,
  options?: RunOptions<H, R>,
) => Stream.Stream<
  RunEvent,
  Internal.AgentRuntimeFailure<A, H>,
  Internal.AgentRuntimeRequirements<A, R>
> = Internal.stream

/** Decode external input before execution. */
export const streamUnknown: <A extends Internal.ExecutableAgent, H = never, R = never>(
  agent: A,
  input: unknown,
  options?: RunOptions<H, R>,
) => Stream.Stream<
  RunEvent,
  Internal.AgentRuntimeFailure<A, H>,
  Internal.AgentRuntimeRequirements<A, R>
> = Internal.streamUnknown
