// @effect-diagnostics experimentalApiUsage:off
import * as AgUi from 'effect/ai/AgUi'
import * as AgUiSchema from 'effect/ai/AgUiSchema'
import * as AgUiServer from 'effect/ai/AgUiServer'
import type * as Prompt from 'effect/ai/Prompt'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import type {
  AgentUpdateEmitted,
  ApprovalRequested,
  BudgetWarning,
  CompactionPerformed,
  ModelRestarted,
  ModelStarted,
  ReasoningDelta,
  RunCompleted,
  RunEvent,
  RunFailed,
  RunInterrupted,
  RunStarted,
  RunSuspended,
  SteeringApplied,
  SubagentCompleted,
  SubagentFailed,
  SubagentInterrupted,
  SubagentJoined,
  SubagentProgress,
  SubagentRequested,
  SubagentStarted,
  TextDelta,
  ToolCallDeclared,
  ToolCallFailed,
  ToolCallStarted,
  ToolCallSucceeded,
  ToolProgress,
  TurnCompleted,
  TurnStarted,
} from '../core/RunEvent'
import type { RunTotals } from '../core/Usage'

interface AgUiEventOptions {
  readonly includeSubagents?: boolean | undefined
}

interface MapperState {
  readonly textMessageId: string | undefined
  readonly reasoningMessageId: string | undefined
  readonly stepName: string | undefined
  readonly pendingApprovals: ReadonlyArray<string>
}

type Mapped = readonly [MapperState, ReadonlyArray<AgUiSchema.Event>]

const initialState: MapperState = {
  textMessageId: undefined,
  reasoningMessageId: undefined,
  stepName: undefined,
  pendingApprovals: [],
}

const encodeJsonEvent = Schema.encodeEffect(Schema.fromJsonString(Schema.Json))

const encodeJson = (value: Schema.Json): Effect.Effect<string> => encodeJsonEvent(value).pipe(Effect.orDie)

const mapped = (value: Mapped): Effect.Effect<Mapped> => Effect.succeed(value)

const subagentUsage = (usage: RunTotals | undefined): ReadonlyArray<AgUiSchema.TokenUsage> => tokenUsage(usage) ?? []

const pendingWith = (pending: ReadonlyArray<string>, toolCallId: string): ReadonlyArray<string> =>
  pending.includes(toolCallId) ? pending : [...pending, toolCallId]

const pendingWithout = (pending: ReadonlyArray<string>, toolCallId: string): ReadonlyArray<string> =>
  pending.includes(toolCallId) ? pending.filter((value) => value !== toolCallId) : pending

const suspensionId = (runId: string, sequence: number, toolCallId: string | undefined): string =>
  toolCallId === undefined
    ? `${runId}:${sequence}:suspended`
    : `${runId}:${sequence}:${toolCallId}:suspended`

const suspendInterrupt = (
  runId: string,
  sequence: number,
  reason: string,
  toolCallId: string | undefined,
): AgUiSchema.Interrupt => ({
  id: suspensionId(runId, sequence, toolCallId),
  reason,
  ...(toolCallId === undefined ? {} : { toolCallId }),
})

const suspensionInterrupts = (
  runId: string,
  sequence: number,
  reason: string,
  pending: ReadonlyArray<string>,
): readonly [AgUiSchema.Interrupt, ...Array<AgUiSchema.Interrupt>] => {
  const [head, ...rest] = pending
  return [
    suspendInterrupt(runId, sequence, reason, head),
    ...rest.map((toolCallId) => suspendInterrupt(runId, sequence, reason, toolCallId)),
  ]
}

const tokenUsage = (usage: RunTotals | undefined): ReadonlyArray<AgUiSchema.TokenUsage> | undefined =>
  usage === undefined
    ? undefined
    : [
      {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.inputTokens + usage.outputTokens,
      },
    ]

const closeText = (state: MapperState): Mapped =>
  state.textMessageId === undefined
    ? [state, []]
    : [
      { ...state, textMessageId: undefined },
      [{ type: 'TEXT_MESSAGE_END', messageId: state.textMessageId }],
    ]

const closeReasoning = (state: MapperState): Mapped =>
  state.reasoningMessageId === undefined
    ? [state, []]
    : [
      { ...state, reasoningMessageId: undefined },
      [
        { type: 'REASONING_MESSAGE_END', messageId: state.reasoningMessageId },
        { type: 'REASONING_END', messageId: state.reasoningMessageId },
      ],
    ]

const closeContent = (state: MapperState): Mapped => {
  const [afterText, textEvents] = closeText(state)
  const [afterReasoning, reasoningEvents] = closeReasoning(afterText)
  return [afterReasoning, [...textEvents, ...reasoningEvents]]
}

const closeStep = (state: MapperState): Mapped =>
  state.stepName === undefined
    ? [state, []]
    : [{ ...state, stepName: undefined }, [{ type: 'STEP_FINISHED', stepName: state.stepName }]]

const closeOpen = (state: MapperState): Mapped => {
  const [afterContent, contentEvents] = closeContent(state)
  const [afterStep, stepEvents] = closeStep(afterContent)
  return [afterStep, [...contentEvents, ...stepEvents]]
}

const appendText = (state: MapperState, event: TextDelta): Mapped => {
  const [closed, closing] = closeReasoning(state)

  if (closed.textMessageId !== undefined) {
    return [
      closed,
      [...closing, { type: 'TEXT_MESSAGE_CONTENT', messageId: closed.textMessageId, delta: event.text }],
    ]
  }

  const messageId = `${event.runId}:${event.sequence}:text`

  return [
    { ...closed, textMessageId: messageId },
    [
      ...closing,
      { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: event.text },
    ],
  ]
}

const appendReasoning = (state: MapperState, event: ReasoningDelta): Mapped => {
  const [closed, closing] = closeText(state)

  if (closed.reasoningMessageId !== undefined) {
    return [
      closed,
      [...closing, { type: 'REASONING_MESSAGE_CONTENT', messageId: closed.reasoningMessageId, delta: event.text }],
    ]
  }

  const messageId = `${event.runId}:${event.sequence}:reasoning`

  return [
    { ...closed, reasoningMessageId: messageId },
    [
      ...closing,
      { type: 'REASONING_START', messageId },
      { type: 'REASONING_MESSAGE_START', messageId, role: 'reasoning' },
      { type: 'REASONING_MESSAGE_CONTENT', messageId, delta: event.text },
    ],
  ]
}

const mapEvent = (
  state: MapperState,
  event: RunEvent,
  includeSubagents: boolean,
): Effect.Effect<Mapped> =>
  Match.value(event).pipe(
    Match.tagsExhaustive({
      RunStarted: (event: RunStarted) =>
        mapped([
          initialState,
          [
            {
              type: 'RUN_STARTED',
              threadId: event.threadId,
              runId: event.runId,
              protocolVersion: AgUiSchema.protocolVersion,
            },
          ],
        ]),
      TurnStarted: (event: TurnStarted) => {
        const [closed, closing] = closeOpen(state)
        const stepName = `turn-${event.turn}`
        return mapped([{ ...closed, stepName }, [...closing, { type: 'STEP_STARTED', stepName }]])
      },
      ModelStarted: (_event: ModelStarted) => mapped([state, []]),
      ModelRestarted: (event: ModelRestarted) =>
        mapped([
          state,
          [
            {
              type: 'CUSTOM',
              name: 'effect_agent.model_restarted',
              value: { turn: event.turn, reason: event.reason },
            },
          ],
        ]),
      SteeringApplied: (event: SteeringApplied) =>
        mapped([
          state,
          [
            {
              type: 'CUSTOM',
              name: 'effect_agent.steering_applied',
              value: { inputIds: [...event.inputIds] },
            },
          ],
        ]),
      TextDelta: (event: TextDelta) => mapped(appendText(state, event)),
      ReasoningDelta: (event: ReasoningDelta) => mapped(appendReasoning(state, event)),
      ToolCallDeclared: (event: ToolCallDeclared) => {
        const parentMessageId = state.textMessageId
        const [closed, closing] = closeContent(state)
        return Effect.map(encodeJson(event.parameters), (delta): Mapped => [
          closed,
          [
            ...closing,
            {
              type: 'TOOL_CALL_START',
              toolCallId: event.toolCallId,
              toolCallName: event.toolName,
              ...(parentMessageId === undefined ? {} : { parentMessageId }),
            },
            { type: 'TOOL_CALL_ARGS', toolCallId: event.toolCallId, delta },
            { type: 'TOOL_CALL_END', toolCallId: event.toolCallId },
          ],
        ])
      },
      ToolCallStarted: (event: ToolCallStarted) =>
        mapped([{ ...state, pendingApprovals: pendingWithout(state.pendingApprovals, event.toolCallId) }, []]),
      ToolProgress: (_event: ToolProgress) => mapped([state, []]),
      ToolCallSucceeded: (event: ToolCallSucceeded) =>
        Effect.map(encodeJson(event.result), (content): Mapped => [
          { ...state, pendingApprovals: pendingWithout(state.pendingApprovals, event.toolCallId) },
          [
            {
              type: 'TOOL_CALL_RESULT',
              messageId: `${event.runId}:${event.toolCallId}:result`,
              toolCallId: event.toolCallId,
              content,
              role: 'tool',
            },
          ],
        ]),
      ToolCallFailed: (event: ToolCallFailed) =>
        Effect.map(
          encodeJson({ error: event.message, code: event.errorTag }),
          (content): Mapped => [
            { ...state, pendingApprovals: pendingWithout(state.pendingApprovals, event.toolCallId) },
            [
              {
                type: 'TOOL_CALL_RESULT',
                messageId: `${event.runId}:${event.toolCallId}:error`,
                toolCallId: event.toolCallId,
                content,
                role: 'tool',
              },
            ],
          ],
        ),
      ApprovalRequested: (event: ApprovalRequested) =>
        mapped([
          { ...state, pendingApprovals: pendingWith(state.pendingApprovals, event.toolCallId) },
          [
            {
              type: 'CUSTOM',
              name: 'effect_agent.approval_requested',
              value: { toolCallId: event.toolCallId, toolName: event.toolName },
            },
          ],
        ]),
      TurnCompleted: (_event: TurnCompleted) => mapped(closeOpen(state)),
      BudgetWarning: (event: BudgetWarning) =>
        mapped([
          state,
          [
            {
              type: 'CUSTOM',
              name: 'effect_agent.budget_warning',
              value: { limit: event.limit, consumed: event.consumed, limitValue: event.limitValue },
            },
          ],
        ]),
      CompactionPerformed: (event: CompactionPerformed) =>
        mapped([
          state,
          [
            {
              type: 'CUSTOM',
              name: 'effect_agent.compaction_performed',
              value: {
                turn: event.turn,
                kind: event.kind,
                tokensBefore: event.tokensBeforeEstimate,
                tokensAfter: event.tokensAfterEstimate,
              },
            },
          ],
        ]),
      AgentUpdateEmitted: (_event: AgentUpdateEmitted) => mapped([state, []]),
      RunCompleted: (event: RunCompleted) => {
        const [closed, closing] = closeOpen(state)
        const usage = tokenUsage(event.usage)
        return mapped([
          closed,
          [
            ...closing,
            {
              type: 'RUN_FINISHED',
              threadId: event.threadId,
              runId: event.runId,
              result: event.output,
              outcome: { type: 'success' },
              ...(usage === undefined ? {} : { usage }),
            },
          ],
        ])
      },
      RunFailed: (event: RunFailed) => {
        const [closed, closing] = closeOpen(state)
        const usage = tokenUsage(event.usage)
        return mapped([
          closed,
          [
            ...closing,
            {
              type: 'RUN_ERROR',
              message: event.message,
              code: event.errorTag,
              ...(usage === undefined ? {} : { usage }),
            },
          ],
        ])
      },
      RunInterrupted: (event: RunInterrupted) => {
        const [closed, closing] = closeOpen(state)
        return mapped([
          closed,
          [
            ...closing,
            { type: 'CUSTOM', name: 'effect_agent.run_interrupted', value: { message: event.message } },
            {
              type: 'RUN_FINISHED',
              threadId: event.threadId,
              runId: event.runId,
              outcome: { type: 'cancelled' },
            },
          ],
        ])
      },
      RunSuspended: (event: RunSuspended) => {
        const [closed, closing] = closeOpen(state)
        const usage = tokenUsage(event.usage)
        return mapped([
          closed,
          [
            ...closing,
            { type: 'CUSTOM', name: 'effect_agent.run_suspended', value: { reason: event.reason } },
            {
              type: 'RUN_FINISHED',
              threadId: event.threadId,
              runId: event.runId,
              outcome: {
                type: 'interrupt',
                interrupts: suspensionInterrupts(
                  event.runId,
                  event.sequence,
                  event.reason,
                  state.pendingApprovals,
                ),
              },
              ...(usage === undefined ? {} : { usage }),
            },
          ],
        ])
      },
      SubagentRequested: (_event: SubagentRequested) => mapped([state, []]),
      SubagentStarted: (event: SubagentStarted) =>
        mapped(
          includeSubagents
            ? [
              state,
              [
                {
                  type: 'SUBAGENT_STARTED',
                  subagentRunId: event.childRunId,
                  name: event.targetAgentId,
                  parentToolCallId: event.toolCallId,
                },
              ],
            ]
            : [state, []],
        ),
      SubagentProgress: (event: SubagentProgress) =>
        mapped(
          includeSubagents
            ? [
              state,
              [
                {
                  type: 'CUSTOM',
                  name: 'effect_agent.subagent_progress',
                  value: { summary: event.summary },
                  subagentRunId: event.childRunId,
                },
              ],
            ]
            : [state, []],
        ),
      SubagentCompleted: (event: SubagentCompleted) =>
        mapped(
          includeSubagents
            ? [
              state,
              [
                {
                  type: 'SUBAGENT_FINISHED',
                  subagentRunId: event.childRunId,
                  outcome: { type: 'success' },
                },
              ],
            ]
            : [state, []],
        ),
      SubagentFailed: (event: SubagentFailed) =>
        mapped(
          includeSubagents
            ? [
              state,
              [
                {
                  type: 'SUBAGENT_ERROR',
                  subagentRunId: event.childRunId,
                  message: event.message,
                  code: event.errorTag,
                },
              ],
            ]
            : [state, []],
        ),
      SubagentInterrupted: (event: SubagentInterrupted) =>
        mapped(
          includeSubagents
            ? [
              state,
              [
                {
                  type: 'CUSTOM',
                  name: 'effect_agent.subagent_interrupted',
                  value: { reason: event.reason },
                  subagentRunId: event.childRunId,
                },
                {
                  type: 'SUBAGENT_FINISHED',
                  subagentRunId: event.childRunId,
                  outcome: { type: 'suspended' },
                },
              ],
            ]
            : [state, []],
        ),
      SubagentJoined: (event: SubagentJoined) =>
        mapped(
          includeSubagents
            ? [
              state,
              [
                {
                  type: 'CUSTOM',
                  name: 'effect_agent.subagent_joined',
                  value: { usage: subagentUsage(event.usage) },
                  subagentRunId: event.childRunId,
                },
              ],
            ]
            : [state, []],
        ),
    }),
  )

const toAgUiEventsOf = <E, R>(
  events: Stream.Stream<RunEvent, E, R>,
  options: AgUiEventOptions | undefined,
): Stream.Stream<AgUiSchema.Event, E, R> =>
  events.pipe(
    Stream.mapAccumEffect(
      () => initialState,
      (state, event) => mapEvent(state, event, options?.includeSubagents === true),
    ),
  )

const isRunEventStream = <E, R>(
  value: Stream.Stream<RunEvent, E, R> | AgUiEventOptions | undefined,
): value is Stream.Stream<RunEvent, E, R> => Stream.isStream(value)

export function toAgUiEvents<E, R>(
  events: Stream.Stream<RunEvent, E, R>,
  options?: AgUiEventOptions,
): Stream.Stream<AgUiSchema.Event, E, R>
export function toAgUiEvents(
  options?: AgUiEventOptions,
): <E, R>(events: Stream.Stream<RunEvent, E, R>) => Stream.Stream<AgUiSchema.Event, E, R>
export function toAgUiEvents<E, R>(
  first?: Stream.Stream<RunEvent, E, R> | AgUiEventOptions,
  options?: AgUiEventOptions,
):
  | Stream.Stream<AgUiSchema.Event, E, R>
  | (<E, R>(events: Stream.Stream<RunEvent, E, R>) => Stream.Stream<AgUiSchema.Event, E, R>)
{
  return isRunEventStream<E, R>(first)
    ? toAgUiEventsOf(first, options)
    : (events) => toAgUiEventsOf(events, first)
}

export const fromAgUiInput = (input: AgUiSchema.RunAgentInput): Prompt.Prompt => AgUi.toPrompt(input)

interface AgUiHandlerConfig<E, R> {
  readonly run: (input: AgUiSchema.RunAgentInput) => Stream.Stream<RunEvent, E, R>
  readonly includeSubagents?: boolean | undefined
}

export const makeAgUiHandler = <E, R>(config: AgUiHandlerConfig<E, R>) =>
  AgUiServer.handler<E, R>((input: AgUiSchema.RunAgentInput) =>
    toAgUiEventsOf(config.run(input), { includeSubagents: config.includeSubagents })
  )
