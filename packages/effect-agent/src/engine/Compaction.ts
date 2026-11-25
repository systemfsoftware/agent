/** Public Compaction API. Implementation helpers remain private. */
export {
  CLEARED_TOOL_RESULT,
  COMPACTION_SUMMARY_PREFIX,
  CONTEXT_ROLLOVER_PREFIX,
  type ContextCompactionState,
  contextWindowId,
  contextWindowMessage,
  estimateMessageTokens,
  estimatePromptTokens,
} from './internal/compaction'
