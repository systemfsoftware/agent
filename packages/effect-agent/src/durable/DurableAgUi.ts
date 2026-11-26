// @effect-diagnostics experimentalApiUsage:off
import * as AgUiSchema from 'effect/ai/AgUiSchema'
import type * as Prompt from 'effect/ai/Prompt'
import type * as Response from 'effect/ai/Response'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'

import type { RunId, ThreadId } from '../core/Identifiers'
import type * as ProvisionalText from '../core/ProvisionalText'
import type { CanonicalRecordEnvelope, SettlementFailureDiagnostic, SettlementOutcome } from './Records'

export interface DurableAgUiEvent {
  readonly sequence: number
  readonly event: AgUiSchema.Event
}

export interface DurableAgUiOutput<Output> {
  readonly schema: Schema.Codec<Output, Schema.Json>
  readonly project: (output: Output) => ReadonlyArray<AgUiSchema.Event>
}

export interface DurableAgUiOptions<Output = never> {
  readonly includeSubagents?: boolean | undefined
  readonly output?: DurableAgUiOutput<Output> | undefined
}

export interface DurableAgUiStreamOptions {
  readonly includeSubagents?: boolean | undefined
}

export interface DurableAgUiInput {
  readonly records: ReadonlyArray<CanonicalRecordEnvelope>
  readonly text?: ReadonlyArray<ProvisionalText.Event> | undefined
  /** Emit only events derived from records after this sequence; the log below it is still folded for state. */
  readonly afterSequence?: number | undefined
}

type ProjectionOutput = Schema.Json | SettlementFailureDiagnostic | undefined

interface RunState {
  started: boolean
  terminated: boolean
  stepName: string | undefined
  textMessageId: string | undefined
  reasoningMessageId: string | undefined
  pendingApprovals: Array<string>
  openSubagents: Array<string>
  steeringPending: Array<string>
}

interface DraftState {
  textId: string | undefined
  reasoningId: string | undefined
}

interface DraftIdentity {
  readonly runId: string
  readonly turnId: string
  readonly attemptId: string
  readonly generation: number
}

interface Projector {
  readonly includeSubagents: boolean
  readonly projectOutput: (output: ProjectionOutput) => ReadonlyArray<AgUiSchema.Event>
  readonly items: Array<DurableAgUiEvent>
  readonly runs: Map<string, RunState>
  readonly committedTurnIds: Set<string>
  readonly terminatedRuns: Set<string>
  readonly subagentNames: Map<string, string>
  readonly subagentChildRun: Map<string, string>
  tail: number
}

const idleRun = (): RunState => ({
  started: false,
  terminated: false,
  stepName: undefined,
  textMessageId: undefined,
  reasoningMessageId: undefined,
  pendingApprovals: [],
  openSubagents: [],
  steeringPending: [],
})

const encodeJson = (value: Schema.Json): string =>
  Option.getOrElse(Schema.encodeOption(Schema.fromJsonString(Schema.Json))(value), () => 'null')

const jsonOf = (value: ProjectionOutput): Schema.Json =>
  Option.getOrElse(Schema.decodeUnknownOption(Schema.Json)(value), () => null)

const isObjectLike = (value: Schema.Json): boolean => typeof value === 'object' && value !== null

const isJsonObject = (value: Schema.Json): value is { readonly [key: string]: Schema.Json } =>
  isObjectLike(value) && !Array.isArray(value)

const stringOrUndefined = (value: Schema.Json): string | undefined => typeof value === 'string' ? value : undefined

const asString = (value: Schema.Json | undefined): string | undefined =>
  value === undefined ? undefined : stringOrUndefined(value)

const failureMessage = (json: { readonly [key: string]: Schema.Json }): string =>
  asString(json['message']) ?? 'The run failed.'

const failureFields = (value: ProjectionOutput): { readonly code: string | undefined; readonly message: string } => {
  const json = jsonOf(value)
  return isJsonObject(json)
    ? { code: asString(json['errorTag']), message: failureMessage(json) }
    : { code: undefined, message: 'The run failed.' }
}

const steeringEvent = (
  phase: 'queued' | 'applied' | 'not-joined',
  inputId: string,
  runId: RunId | undefined,
): AgUiSchema.Event => ({
  type: 'CUSTOM',
  name: 'agent.steering',
  value: { phase, inputId, ...(runId === undefined ? {} : { runId }) },
})

const toolResultEvent = (sequence: number, event: AgUiSchema.Event): DurableAgUiEvent => ({ sequence, event })

const withApproval = (pending: ReadonlyArray<string>, toolCallId: string): ReadonlyArray<string> =>
  pending.includes(toolCallId) ? pending : [...pending, toolCallId]

const withoutApproval = (pending: ReadonlyArray<string>, toolCallId: string): ReadonlyArray<string> =>
  pending.includes(toolCallId) ? pending.filter((value) => value !== toolCallId) : pending

const emit = (
  projector: Projector,
  sequence: number,
  ...events: ReadonlyArray<AgUiSchema.Event>
): void => {
  for (const event of events) projector.items.push(toolResultEvent(sequence, event))
}

const runOf = (projector: Projector, runId: RunId): RunState => {
  const existing = projector.runs.get(runId)

  if (existing !== undefined) return existing
  const created = idleRun()
  projector.runs.set(runId, created)
  return created
}

const markStarted = (
  projector: Projector,
  threadId: ThreadId,
  sequence: number,
  runId: RunId,
  run: RunState,
): void => {
  if (run.started) return
  run.started = true
  emit(projector, sequence, {
    type: 'RUN_STARTED',
    threadId,
    runId,
    protocolVersion: AgUiSchema.protocolVersion,
  })
}

const closeText = (projector: Projector, run: RunState, sequence: number): void => {
  if (run.textMessageId === undefined) return
  emit(projector, sequence, { type: 'TEXT_MESSAGE_END', messageId: run.textMessageId })
  run.textMessageId = undefined
}

const closeReasoning = (projector: Projector, run: RunState, sequence: number): void => {
  if (run.reasoningMessageId === undefined) return
  emit(
    projector,
    sequence,
    { type: 'REASONING_MESSAGE_END', messageId: run.reasoningMessageId },
    { type: 'REASONING_END', messageId: run.reasoningMessageId },
  )
  run.reasoningMessageId = undefined
}

const closeContent = (projector: Projector, run: RunState, sequence: number): void => {
  closeText(projector, run, sequence)
  closeReasoning(projector, run, sequence)
}

const closeStep = (projector: Projector, run: RunState, sequence: number): void => {
  if (run.stepName === undefined) return
  emit(projector, sequence, { type: 'STEP_FINISHED', stepName: run.stepName })
  run.stepName = undefined
}

const closeOpen = (projector: Projector, run: RunState, sequence: number): void => {
  closeContent(projector, run, sequence)
  closeStep(projector, run, sequence)
}

const appendText = (
  projector: Projector,
  run: RunState,
  runId: RunId,
  turnId: string,
  sequence: number,
  text: string,
): void => {
  closeReasoning(projector, run, sequence)

  if (run.textMessageId === undefined) {
    const messageId = `${runId}:${turnId}:text`
    run.textMessageId = messageId
    emit(projector, sequence, { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' })
  }
  emit(projector, sequence, { type: 'TEXT_MESSAGE_CONTENT', messageId: run.textMessageId, delta: text })
}

const appendReasoning = (
  projector: Projector,
  run: RunState,
  runId: RunId,
  turnId: string,
  sequence: number,
  text: string,
): void => {
  closeText(projector, run, sequence)

  if (run.reasoningMessageId === undefined) {
    const messageId = `${runId}:${turnId}:reasoning`
    run.reasoningMessageId = messageId
    emit(
      projector,
      sequence,
      { type: 'REASONING_START', messageId },
      { type: 'REASONING_MESSAGE_START', messageId, role: 'reasoning' },
    )
  }
  emit(projector, sequence, {
    type: 'REASONING_MESSAGE_CONTENT',
    messageId: run.reasoningMessageId,
    delta: text,
  })
}

const declareToolCall = (
  projector: Projector,
  run: RunState,
  sequence: number,
  toolCallId: string,
  toolName: string,
  parameters: Schema.Json,
): void => {
  const parentMessageId = run.textMessageId
  closeContent(projector, run, sequence)
  emit(
    projector,
    sequence,
    {
      type: 'TOOL_CALL_START',
      toolCallId,
      toolCallName: toolName,
      ...(parentMessageId === undefined ? {} : { parentMessageId }),
    },
    { type: 'TOOL_CALL_ARGS', toolCallId, delta: encodeJson(parameters) },
    { type: 'TOOL_CALL_END', toolCallId },
  )
}

const emitToolResult = (
  projector: Projector,
  sequence: number,
  runId: RunId,
  toolCallId: string,
  isFailure: boolean,
  result: Schema.Json,
): void => {
  emit(projector, sequence, {
    type: 'TOOL_CALL_RESULT',
    messageId: `${runId}:${toolCallId}:${isFailure ? 'error' : 'result'}`,
    toolCallId,
    content: encodeJson(result),
    role: 'tool',
  })
}

const isTextPart = (part: Prompt.AssistantMessagePartEncoded): part is Response.TextPartEncoded => part.type === 'text'

const isReasoningPart = (part: Prompt.AssistantMessagePartEncoded): part is Response.ReasoningPartEncoded =>
  part.type === 'reasoning'

const isToolCallPart = (part: Prompt.AssistantMessagePartEncoded): part is Response.ToolCallPartEncoded =>
  part.type === 'tool-call'

const isToolResultPart = (part: Prompt.AssistantMessagePartEncoded): part is Response.ToolResultPartEncoded =>
  part.type === 'tool-result'

const appendPart = (
  projector: Projector,
  run: RunState,
  runId: RunId,
  turnId: string,
  sequence: number,
  part: Prompt.AssistantMessagePartEncoded,
): void => {
  Match.value(part).pipe(
    Match.when(isTextPart, (value) => appendText(projector, run, runId, turnId, sequence, value.text)),
    Match.when(isReasoningPart, (value) => appendReasoning(projector, run, runId, turnId, sequence, value.text)),
    Match.when(isToolCallPart, (value) =>
      declareToolCall(
        projector,
        run,
        sequence,
        value.id,
        value.name,
        Option.getOrElse(Schema.decodeUnknownOption(Schema.Json)(value.params), () => null),
      )),
    Match.when(isToolResultPart, (value) =>
      emitToolResult(
        projector,
        sequence,
        runId,
        value.id,
        value.isFailure,
        Option.getOrElse(Schema.decodeUnknownOption(Schema.Json)(value.result), () => null),
      )),
    Match.orElse(() => undefined),
  )
}

const appendTextIfPresent = (
  projector: Projector,
  run: RunState,
  runId: RunId,
  turnId: string,
  sequence: number,
  text: string,
): void => {
  if (text.length > 0) appendText(projector, run, runId, turnId, sequence, text)
}

const appendAssistantContent = (
  projector: Projector,
  run: RunState,
  runId: RunId,
  turnId: string,
  sequence: number,
  content: string | ReadonlyArray<Prompt.AssistantMessagePartEncoded>,
): void => {
  if (typeof content === 'string') {
    appendTextIfPresent(projector, run, runId, turnId, sequence, content)
  } else {
    content.forEach((part) => appendPart(projector, run, runId, turnId, sequence, part))
  }
}

const appendMessage = (
  projector: Projector,
  run: RunState,
  runId: RunId,
  turnId: string,
  sequence: number,
  message: Prompt.MessageEncoded,
): void => {
  if (message.role === 'assistant') {
    appendAssistantContent(projector, run, runId, turnId, sequence, message.content)
  }
}

const appendResponse = (
  projector: Projector,
  run: RunState,
  runId: RunId,
  turnId: string,
  sequence: number,
  messages: Prompt.PromptEncoded,
): void => {
  messages.content.forEach((message) => appendMessage(projector, run, runId, turnId, sequence, message))
}

const applySteering = (projector: Projector, sequence: number, run: RunState, runId: RunId): void => {
  for (const inputId of run.steeringPending) emit(projector, sequence, steeringEvent('applied', inputId, runId))
  run.steeringPending = []
}

const closeEachSubagent = (projector: Projector, run: RunState, sequence: number): void => {
  for (const subagentRunId of run.openSubagents) {
    emit(projector, sequence, { type: 'SUBAGENT_ERROR', subagentRunId, message: 'The subagent did not finish.' })
  }
  run.openSubagents = []
}

const closeSubagents = (projector: Projector, run: RunState, sequence: number): void => {
  if (projector.includeSubagents) closeEachSubagent(projector, run, sequence)
}

const closeTerminal = (projector: Projector, run: RunState, sequence: number): void => {
  closeOpen(projector, run, sequence)
  closeSubagents(projector, run, sequence)
  run.pendingApprovals = []
}

const drainUnappliedSteering = (projector: Projector, run: RunState, sequence: number, runId: RunId): void => {
  for (const inputId of run.steeringPending) emit(projector, sequence, steeringEvent('not-joined', inputId, runId))
  run.steeringPending = []
}

const decodeOutput = <Output>(
  extension: DurableAgUiOutput<Output>,
  output: ProjectionOutput,
): ReadonlyArray<AgUiSchema.Event> => {
  const decoded = Schema.decodeUnknownOption(extension.schema)(output)
  return Option.isSome(decoded) ? extension.project(decoded.value) : []
}

const extensionOf = <Output>(
  options: DurableAgUiOptions<Output> | undefined,
): DurableAgUiOutput<Output> | undefined => options === undefined ? undefined : options.output

const runOutputEvents = <Output>(
  options: DurableAgUiOptions<Output> | undefined,
  output: ProjectionOutput,
): ReadonlyArray<AgUiSchema.Event> => {
  const extension = extensionOf(options)
  return extension === undefined ? [] : decodeOutput(extension, output)
}

const makeProjector = <Output>(options: DurableAgUiOptions<Output> | undefined): Projector => ({
  includeSubagents: options?.includeSubagents === true,
  projectOutput: (output) => runOutputEvents(options, output),
  items: [],
  runs: new Map(),
  committedTurnIds: new Set(),
  terminatedRuns: new Set(),
  subagentNames: new Map(),
  subagentChildRun: new Map(),
  tail: 0,
})

const subagentKey = (runId: RunId, toolCallId: string): string => `${runId}|${toolCallId}`

const subagentEvent = (childRunId: string, outcome: SettlementOutcome): AgUiSchema.Event =>
  outcome === 'completed' ? subagentFinished(childRunId) : subagentNotCompleted(childRunId, outcome)

const subagentFinished = (childRunId: string): AgUiSchema.Event => ({
  type: 'SUBAGENT_FINISHED',
  subagentRunId: childRunId,
  outcome: { type: 'success' },
})

const subagentNotCompleted = (childRunId: string, outcome: SettlementOutcome): AgUiSchema.Event =>
  outcome === 'failed'
    ? { type: 'SUBAGENT_ERROR', subagentRunId: childRunId, message: 'The subagent failed.' }
    : { type: 'SUBAGENT_FINISHED', subagentRunId: childRunId, outcome: { type: 'suspended' } }

const onRunStarted = (
  projector: Projector,
  threadId: ThreadId,
  sequence: number,
  runId: RunId,
): void => {
  markStarted(projector, threadId, sequence, runId, runOf(projector, runId))
}

const queueForRun = (
  projector: Projector,
  sequence: number,
  inputId: string,
  runId: RunId,
): void => {
  const run = runOf(projector, runId)
  if (run.terminated) {
    emit(projector, sequence, steeringEvent('not-joined', inputId, runId))
    return
  }
  run.steeringPending.push(inputId)
  emit(projector, sequence, steeringEvent('queued', inputId, runId))
}

const steerWithRun = (
  projector: Projector,
  sequence: number,
  inputId: string,
  runId: RunId | undefined,
): void => {
  if (runId !== undefined) queueForRun(projector, sequence, inputId, runId)
}

const onSteering = (
  projector: Projector,
  sequence: number,
  submissionId: string | undefined,
  runId: RunId | undefined,
): void => {
  if (submissionId !== undefined) steerWithRun(projector, sequence, submissionId, runId)
}

const onUserInput = (
  projector: Projector,
  sequence: number,
  kind: 'user' | 'steering' | 'follow-up',
  submissionId: string | undefined,
  runId: RunId | undefined,
): void => {
  if (kind === 'steering') onSteering(projector, sequence, submissionId, runId)
}

const onModelResponse = (
  projector: Projector,
  sequence: number,
  runId: RunId,
  turnId: string,
  turn: number,
  messages: Prompt.PromptEncoded,
): void => {
  const run = runOf(projector, runId)
  if (run.terminated) return
  projector.committedTurnIds.add(turnId)
  applySteering(projector, sequence, run, runId)
  closeOpen(projector, run, sequence)
  const stepName = `turn-${turn}`
  run.stepName = stepName
  emit(projector, sequence, { type: 'STEP_STARTED', stepName })
  appendResponse(projector, run, runId, turnId, sequence, messages)
  closeOpen(projector, run, sequence)
}

const onToolCallSettled = (
  projector: Projector,
  sequence: number,
  runId: RunId,
  toolCallId: string,
  result: Schema.Json,
  isFailure: boolean,
): void => {
  const run = runOf(projector, runId)
  if (run.terminated) return
  run.pendingApprovals = [...withoutApproval(run.pendingApprovals, toolCallId)]
  emitToolResult(projector, sequence, runId, toolCallId, isFailure, result)
}

const onApprovalRequested = (
  projector: Projector,
  sequence: number,
  runId: RunId,
  toolCallId: string,
  toolName: string,
): void => {
  const run = runOf(projector, runId)
  if (run.terminated) return
  run.pendingApprovals = [...withApproval(run.pendingApprovals, toolCallId)]
  emit(projector, sequence, {
    type: 'CUSTOM',
    name: 'effect_agent.approval_requested',
    value: { toolCallId, toolName },
  })
}

const onApprovalDecided = (
  projector: Projector,
  sequence: number,
  runId: RunId,
  toolCallId: string,
  decision: string,
): void => {
  const run = runOf(projector, runId)
  run.pendingApprovals = [...withoutApproval(run.pendingApprovals, toolCallId)]
  emit(projector, sequence, {
    type: 'CUSTOM',
    name: 'effect_agent.approval_decided',
    value: { toolCallId, decision },
  })
}

const onSubagentRequested = (
  projector: Projector,
  runId: RunId,
  toolCallId: string,
  targetAgentId: string,
): void => {
  projector.subagentNames.set(subagentKey(runId, toolCallId), targetAgentId)
}

const nameOrChild = (name: string | undefined, childRunId: string): string => name ?? childRunId

const onSubagentStarted = (
  projector: Projector,
  sequence: number,
  runId: RunId,
  toolCallId: string,
  childRunId: string,
): void => {
  projector.subagentChildRun.set(subagentKey(runId, toolCallId), childRunId)
  if (!projector.includeSubagents) return
  const run = runOf(projector, runId)
  run.openSubagents.push(childRunId)
  emit(projector, sequence, {
    type: 'SUBAGENT_STARTED',
    subagentRunId: childRunId,
    name: nameOrChild(projector.subagentNames.get(subagentKey(runId, toolCallId)), childRunId),
    parentToolCallId: toolCallId,
  })
}

const joinSubagent = (
  projector: Projector,
  sequence: number,
  runId: RunId,
  toolCallId: string,
  childOutcome: SettlementOutcome,
): void => {
  const childRunId = projector.subagentChildRun.get(subagentKey(runId, toolCallId))
  if (childRunId === undefined) return
  const run = runOf(projector, runId)
  run.openSubagents = run.openSubagents.filter((value) => value !== childRunId)
  emit(projector, sequence, subagentEvent(childRunId, childOutcome))
}

const onSubagentJoined = (
  projector: Projector,
  sequence: number,
  runId: RunId,
  toolCallId: string,
  childOutcome: SettlementOutcome,
): void => {
  if (projector.includeSubagents) joinSubagent(projector, sequence, runId, toolCallId, childOutcome)
}

const resultField = (
  result: ProjectionOutput,
): { readonly result?: Schema.Json | SettlementFailureDiagnostic } => result === undefined ? {} : { result }

const codeField = (code: string | undefined): { readonly code?: string } => code === undefined ? {} : { code }

const settleCompleted = (
  projector: Projector,
  threadId: ThreadId,
  sequence: number,
  runId: RunId,
  result: ProjectionOutput,
): void => {
  if (result !== undefined) emit(projector, sequence, ...projector.projectOutput(result))
  emit(projector, sequence, {
    type: 'RUN_FINISHED',
    threadId,
    runId,
    ...resultField(result),
    outcome: { type: 'success' },
  })
}

const settleFailed = (projector: Projector, sequence: number, result: ProjectionOutput): void => {
  const failure = failureFields(result)
  emit(projector, sequence, {
    type: 'RUN_ERROR',
    message: failure.message,
    ...codeField(failure.code),
  })
}

const settleStopped = (
  projector: Projector,
  threadId: ThreadId,
  sequence: number,
  runId: RunId,
): void => {
  emit(projector, sequence, { type: 'RUN_FINISHED', threadId, runId, outcome: { type: 'cancelled' } })
}

const settleRun = (
  projector: Projector,
  threadId: ThreadId,
  sequence: number,
  runId: RunId,
  outcome: SettlementOutcome,
  result: ProjectionOutput,
): void => {
  const run = runOf(projector, runId)
  markStarted(projector, threadId, sequence, runId, run)
  closeTerminal(projector, run, sequence)
  drainUnappliedSteering(projector, run, sequence, runId)
  Match.value(outcome).pipe(
    Match.when('completed', () => settleCompleted(projector, threadId, sequence, runId, result)),
    Match.when('failed', () => settleFailed(projector, sequence, result)),
    Match.orElse(() => settleStopped(projector, threadId, sequence, runId)),
  )
  projector.terminatedRuns.add(runId)
  run.terminated = true
}

const settleIfLive = (
  projector: Projector,
  threadId: ThreadId,
  sequence: number,
  runId: RunId,
  outcome: SettlementOutcome,
  result: ProjectionOutput,
): void => {
  if (projector.terminatedRuns.has(runId)) return
  settleRun(projector, threadId, sequence, runId, outcome, result)
}

const onSubmissionSettled = (
  projector: Projector,
  threadId: ThreadId,
  sequence: number,
  outcome: SettlementOutcome,
  runId: RunId | undefined,
  result: ProjectionOutput,
): void => {
  if (runId !== undefined) settleIfLive(projector, threadId, sequence, runId, outcome, result)
}

const onRunCompleted = (
  projector: Projector,
  threadId: ThreadId,
  sequence: number,
  runId: RunId,
  output: Schema.Json,
): void => {
  if (projector.terminatedRuns.has(runId)) return
  const run = runOf(projector, runId)
  markStarted(projector, threadId, sequence, runId, run)
  closeTerminal(projector, run, sequence)
  drainUnappliedSteering(projector, run, sequence, runId)
  emit(projector, sequence, ...projector.projectOutput(output))
  emit(projector, sequence, {
    type: 'RUN_FINISHED',
    threadId,
    runId,
    result: output,
    outcome: { type: 'success' },
  })
  projector.terminatedRuns.add(runId)
  run.terminated = true
}

const onRunFailed = (
  projector: Projector,
  threadId: ThreadId,
  sequence: number,
  runId: RunId,
  failure: Schema.Json,
): void => {
  if (projector.terminatedRuns.has(runId)) return
  const run = runOf(projector, runId)
  markStarted(projector, threadId, sequence, runId, run)
  closeTerminal(projector, run, sequence)
  drainUnappliedSteering(projector, run, sequence, runId)
  const fields = failureFields(failure)
  emit(projector, sequence, {
    type: 'RUN_ERROR',
    message: fields.message,
    ...codeField(fields.code),
  })
  projector.terminatedRuns.add(runId)
  run.terminated = true
}

const processRecord = (projector: Projector, envelope: CanonicalRecordEnvelope): void => {
  if (envelope.sequence <= projector.tail) return
  const payload = envelope.record.payload
  projector.tail = envelope.sequence
  const sequence = envelope.sequence
  const threadId = envelope.threadId

  Match.value(payload).pipe(
    Match.tags({
      RunStarted: (value) => onRunStarted(projector, threadId, sequence, value.runId),
      UserInputRecorded: (value) => onUserInput(projector, sequence, value.kind, value.submissionId, value.runId),
      ModelResponseRecorded: (value) =>
        onModelResponse(projector, sequence, value.runId, value.turnId, value.turn, value.messages),
      ToolCallSettled: (value) =>
        onToolCallSettled(projector, sequence, value.runId, value.toolCallId, value.result, value.isFailure),
      ToolApprovalRequested: (value) =>
        onApprovalRequested(projector, sequence, value.runId, value.toolCallId, value.toolName),
      ToolApprovalDecided: (value) =>
        onApprovalDecided(projector, sequence, value.runId, value.toolCallId, value.decision),
      ModelCallAborted: (value) =>
        emit(projector, sequence, {
          type: 'CUSTOM',
          name: 'effect_agent.model_restarted',
          value: { turn: value.turn, reason: value.reason },
        }),
      CompactionCreated: (value) =>
        emit(projector, sequence, {
          type: 'CUSTOM',
          name: 'effect_agent.compaction_performed',
          value: { turn: value.turn, kind: value.kind },
        }),
      SubagentRequested: (value) => onSubagentRequested(projector, value.runId, value.toolCallId, value.targetAgentId),
      SubagentStarted: (value) =>
        onSubagentStarted(projector, sequence, value.runId, value.toolCallId, value.childRunId),
      SubagentJoined: (value) =>
        onSubagentJoined(projector, sequence, value.runId, value.toolCallId, value.childOutcome),
      RunCompleted: (value) => onRunCompleted(projector, threadId, sequence, value.runId, value.output),
      RunFailed: (value) => onRunFailed(projector, threadId, sequence, value.runId, value.failure),
      SubmissionSettled: (value) =>
        onSubmissionSettled(projector, threadId, sequence, value.outcome, value.runId, value.result),
    }),
    Match.orElse(() => undefined),
  )
}

type DraftPart = ProvisionalText.TextEvent['part']

const isTextStart = (part: DraftPart): part is Response.TextStartPart => part.type === 'text-start'
const isTextDelta = (part: DraftPart): part is Response.TextDeltaPart => part.type === 'text-delta'
const isTextEnd = (part: DraftPart): part is Response.TextEndPart => part.type === 'text-end'
const isReasoningStart = (part: DraftPart): part is Response.ReasoningStartPart => part.type === 'reasoning-start'
const isReasoningDelta = (part: DraftPart): part is Response.ReasoningDeltaPart => part.type === 'reasoning-delta'
const isReasoningEnd = (part: DraftPart): part is Response.ReasoningEndPart => part.type === 'reasoning-end'

const draftKey = (value: DraftIdentity): string =>
  `${value.runId}|${value.turnId}|${value.attemptId}|${value.generation}`

const draftFor = (drafts: Map<string, DraftState>, key: string): DraftState => {
  const existing = drafts.get(key)

  if (existing !== undefined) return existing
  const created: DraftState = { textId: undefined, reasoningId: undefined }
  drafts.set(key, created)
  return created
}

const closeDraftText = (projector: Projector, draft: DraftState): void => {
  if (draft.textId === undefined) return
  emit(projector, projector.tail, { type: 'TEXT_MESSAGE_END', messageId: draft.textId })
  draft.textId = undefined
}

const closeDraftReasoning = (projector: Projector, draft: DraftState): void => {
  if (draft.reasoningId === undefined) return
  emit(
    projector,
    projector.tail,
    { type: 'REASONING_MESSAGE_END', messageId: draft.reasoningId },
    { type: 'REASONING_END', messageId: draft.reasoningId },
  )
  draft.reasoningId = undefined
}

const closeDraft = (projector: Projector, draft: DraftState): void => {
  closeDraftText(projector, draft)
  closeDraftReasoning(projector, draft)
}

const closeWhere = (
  projector: Projector,
  drafts: Map<string, DraftState>,
  predicate: (key: string) => boolean,
): void => {
  drafts.forEach((draft, key) => {
    if (predicate(key)) closeDraft(projector, draft)
  })
}

const isSuperseded = (projector: Projector, event: ProvisionalText.TextEvent): boolean =>
  projector.committedTurnIds.has(event.turnId) || projector.terminatedRuns.has(event.runId)

const ensureDraftText = (projector: Projector, draft: DraftState, messageId: string): void => {
  if (draft.textId !== undefined) return
  draft.textId = messageId
  emit(projector, projector.tail, { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' })
}

const ensureDraftReasoning = (projector: Projector, draft: DraftState, messageId: string): void => {
  if (draft.reasoningId !== undefined) return
  draft.reasoningId = messageId
  emit(
    projector,
    projector.tail,
    { type: 'REASONING_START', messageId },
    { type: 'REASONING_MESSAGE_START', messageId, role: 'reasoning' },
  )
}

const appendDraftPart = (projector: Projector, event: ProvisionalText.TextEvent, draft: DraftState): void => {
  const textId = `${event.runId}:${event.turnId}:text`
  const reasoningId = `${event.runId}:${event.turnId}:reasoning`
  Match.value(event.part).pipe(
    Match.when(isTextStart, () => {
      closeDraft(projector, draft)
      ensureDraftText(projector, draft, textId)
    }),
    Match.when(isTextDelta, (value) => {
      ensureDraftText(projector, draft, textId)
      emit(projector, projector.tail, { type: 'TEXT_MESSAGE_CONTENT', messageId: textId, delta: value.delta })
    }),
    Match.when(isTextEnd, () => closeDraftText(projector, draft)),
    Match.when(isReasoningStart, () => {
      closeDraft(projector, draft)
      ensureDraftReasoning(projector, draft, reasoningId)
    }),
    Match.when(isReasoningDelta, (value) => {
      ensureDraftReasoning(projector, draft, reasoningId)
      emit(projector, projector.tail, { type: 'REASONING_MESSAGE_CONTENT', messageId: reasoningId, delta: value.delta })
    }),
    Match.when(isReasoningEnd, () => closeDraftReasoning(projector, draft)),
    Match.orElse(() => undefined),
  )
}

const onDraftText = (
  projector: Projector,
  event: ProvisionalText.TextEvent,
  drafts: Map<string, DraftState>,
): void => {
  if (isSuperseded(projector, event)) return
  appendDraftPart(projector, event, draftFor(drafts, draftKey(event)))
}

const onDraftEvent = (
  projector: Projector,
  event: ProvisionalText.Event,
  drafts: Map<string, DraftState>,
): void => {
  Match.value(event).pipe(
    Match.tags({
      Text: (value) => onDraftText(projector, value, drafts),
      Discard: (value) => closeWhere(projector, drafts, (key) => key === draftKey(value)),
      AttemptEnded: (value) => closeWhere(projector, drafts, (key) => key.includes(`|${value.attemptId}|`)),
    }),
    Match.orElse(() => undefined),
  )
}

const processText = (projector: Projector, text: ReadonlyArray<ProvisionalText.Event>): void => {
  const drafts = new Map<string, DraftState>()
  text.forEach((event) => onDraftEvent(projector, event, drafts))
}

const sortRecords = (
  records: ReadonlyArray<CanonicalRecordEnvelope>,
): ReadonlyArray<CanonicalRecordEnvelope> => [...records].sort((left, right) => left.sequence - right.sequence)

const restrictFrom = (
  items: ReadonlyArray<DurableAgUiEvent>,
  from: number | undefined,
): ReadonlyArray<DurableAgUiEvent> => from === undefined ? items : items.filter((item) => item.sequence > from)

const projectOf = <Output>(
  input: DurableAgUiInput,
  options: DurableAgUiOptions<Output> | undefined,
): ReadonlyArray<DurableAgUiEvent> => {
  const projector = makeProjector(options)
  sortRecords(input.records).forEach((envelope) => processRecord(projector, envelope))
  if (input.text !== undefined) processText(projector, input.text)
  return restrictFrom(projector.items, input.afterSequence)
}

const isInput = <Output>(
  value: DurableAgUiInput | DurableAgUiOptions<Output> | undefined,
): value is DurableAgUiInput => value !== undefined && 'records' in value

const streamOf = <E, R>(
  records: Stream.Stream<CanonicalRecordEnvelope, E, R>,
  options: DurableAgUiStreamOptions | undefined,
): Stream.Stream<DurableAgUiEvent, E, R> =>
  records.pipe(
    Stream.mapAccumEffect(
      () => makeProjector(options),
      (projector, envelope) =>
        Effect.sync((): readonly [Projector, ReadonlyArray<DurableAgUiEvent>] => {
          const start = projector.items.length
          processRecord(projector, envelope)
          return [projector, projector.items.slice(start)]
        }),
    ),
  )

export function projectDurableAgUi<Output = never>(
  input: DurableAgUiInput,
  options?: DurableAgUiOptions<Output>,
): ReadonlyArray<DurableAgUiEvent>
export function projectDurableAgUi<Output = never>(
  options?: DurableAgUiOptions<Output>,
): (input: DurableAgUiInput) => ReadonlyArray<DurableAgUiEvent>
export function projectDurableAgUi<Output = never>(
  first?: DurableAgUiInput | DurableAgUiOptions<Output>,
  options?: DurableAgUiOptions<Output>,
):
  | ReadonlyArray<DurableAgUiEvent>
  | ((input: DurableAgUiInput) => ReadonlyArray<DurableAgUiEvent>)
{
  return isInput(first) ? projectOf(first, options) : (input: DurableAgUiInput) => projectOf(input, first)
}

export function toDurableAgUiEvents<E, R>(
  records: Stream.Stream<CanonicalRecordEnvelope, E, R>,
  options?: DurableAgUiStreamOptions,
): Stream.Stream<DurableAgUiEvent, E, R>
export function toDurableAgUiEvents(
  options?: DurableAgUiStreamOptions,
): <E, R>(records: Stream.Stream<CanonicalRecordEnvelope, E, R>) => Stream.Stream<DurableAgUiEvent, E, R>
export function toDurableAgUiEvents<E, R>(
  first?: Stream.Stream<CanonicalRecordEnvelope, E, R> | DurableAgUiStreamOptions,
  options?: DurableAgUiStreamOptions,
):
  | Stream.Stream<DurableAgUiEvent, E, R>
  | ((records: Stream.Stream<CanonicalRecordEnvelope, E, R>) => Stream.Stream<DurableAgUiEvent, E, R>)
{
  return Stream.isStream(first) ? streamOf(first, options) : (records) => streamOf(records, first)
}
