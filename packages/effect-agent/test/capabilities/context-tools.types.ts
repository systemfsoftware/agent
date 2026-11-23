import * as Agent from '@systemfsoftware/agent/agent'
import { AgentPolicy } from '@systemfsoftware/agent/agent-policy'
import * as AgentRuntime from '@systemfsoftware/agent/agent-runtime'
import type { ContextHistory, ContextHistoryError } from '@systemfsoftware/agent/context-history'
import type { ContextWindow } from '@systemfsoftware/agent/context-window'
import type { DurableStep, DurableStepError } from '@systemfsoftware/agent/durable-step'
import * as MemoryNamespace from '@systemfsoftware/agent/memory-namespace'
import type {
  MemoryConflict,
  MemoryReader,
  MemoryStorageError,
  MemoryWriter,
} from '@systemfsoftware/agent/memory-store'
import { MemoryKey, MemoryScope } from '@systemfsoftware/agent/memory-store'
import type { ThreadHistory } from '@systemfsoftware/agent/thread-history'
import type * as EffectAiIdGenerator from 'effect/ai/IdGenerator'
import type * as LanguageModel from 'effect/ai/LanguageModel'
import type * as Model from 'effect/ai/Model'
import type * as Tool from 'effect/ai/Tool'
import * as Effect from 'effect/Effect'
import type * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import type { expectTypeOf as ExpectTypeOf } from 'vitest'

import * as ContextTools from '../../src/capabilities/ContextTools.ts'
import * as MemoryNotes from '../../src/capabilities/MemoryNotes.ts'

const policy = AgentPolicy.make({
  maxTurns: 4,
  maxToolCalls: 4,
  maxDuration: '1 minute',
  toolConcurrency: 1,
})

const contextAgent = Agent.make('context-tools-types', {
  input: Schema.String,
  output: Schema.String,
  instructions: 'Use historical evidence when needed.',
  toolkit: ContextTools.toolkit,
  policy,
})

const notesAgent = Agent.make('notes-tools-types', {
  input: Schema.String,
  output: Schema.String,
  instructions: 'Preserve working notes.',
  toolkit: MemoryNotes.toolkit,
  policy,
})

const NotesNamespace = MemoryNamespace.define({
  name: 'types/notes',
  version: 1,
  identity: Schema.String,
})

const notesLayer = MemoryNotes.layer({
  key: MemoryKey.make({ namespace: NotesNamespace.make('host'), id: 'notes' }),
  locator: 'notes://host/notes',
  attributions: [
    {
      originId: 'notes',
      speaker: 'agent',
      observers: [],
      locator: 'notes://host/notes',
      activityAt: null,
      interpretation: 'working notes',
    },
  ],
  scopes: [MemoryScope.make('host')],
})

type NativeRuntimeServices =
  | LanguageModel.LanguageModel
  | Model.ProviderName
  | Model.ModelName
  | ThreadHistory

export const verifyKeepsHistoryAndStorageDependenciesVisibleWhileTheEngineOwnsItsLocalServices = () => {
  expectTypeOf<Tool.HandlerServices<typeof ContextTools.SearchContextWindows>>().toEqualTypeOf<
    ContextWindow | ContextHistory
  >()
  expectTypeOf<
    Tool.Failure<typeof ContextTools.SearchContextWindows>
  >().toEqualTypeOf<ContextHistoryError>()
  expectTypeOf<
    Tool.HandlerError<typeof ContextTools.SearchContextWindows>
  >().toEqualTypeOf<never>()
  expectTypeOf<
    Tool.HandlerServices<typeof MemoryNotes.WriteNotes>
  >().toEqualTypeOf<DurableStep>()
  expectTypeOf<Layer.Services<typeof notesLayer>>().toEqualTypeOf<
    MemoryReader | MemoryWriter | EffectAiIdGenerator.IdGenerator
  >()

  const contextRun = AgentRuntime.run(contextAgent, 'continue').pipe(
    Effect.provide(ContextTools.layer),
  )

  expectTypeOf<Effect.Services<typeof contextRun>>().toEqualTypeOf<
    NativeRuntimeServices | ContextHistory
  >()
  expectTypeOf<
    Extract<Effect.Error<typeof contextRun>, ContextHistoryError>
  >().toEqualTypeOf<never>()

  const notesRun = AgentRuntime.run(notesAgent, 'continue').pipe(Effect.provide(notesLayer))

  expectTypeOf<Effect.Services<typeof notesRun>>().toEqualTypeOf<
    NativeRuntimeServices | MemoryReader | MemoryWriter | EffectAiIdGenerator.IdGenerator
  >()
  expectTypeOf<
    Extract<Effect.Error<typeof notesRun>, MemoryConflict | MemoryStorageError | DurableStepError>
  >().toEqualTypeOf<never>()
}

declare const expectTypeOf: typeof ExpectTypeOf
