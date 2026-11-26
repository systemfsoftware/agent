---
"@systemfsoftware/agent": patch
"@systemfsoftware/agent-ai-decision": none
"@systemfsoftware/agent-platform-cloudflare": none
"@systemfsoftware/agent-platform-node": none
"@systemfsoftware/agent-pr-review": none
"@systemfsoftware/agent-storage-cloudflare": none
"@systemfsoftware/agent-storage-memory": none
"@systemfsoftware/agent-storage-postgres": none
"@systemfsoftware/agent-storage-sql": none
"@systemfsoftware/agent-storage-sqlite": none
"@systemfsoftware/agent-testing": none
---
BEHAVIOR CHANGE: Model spans keep Effect AI's `LanguageModel.streamText` name instead of `chat <model>`, and every span and terminal Tool log writes identity through the pinned `effect/ai/Telemetry` helpers. Read the `gen_ai.*` and `effect_agent.*` attributes instead of the removed unprefixed `agentId`, `threadId`, `runId`, `turnId`, `toolCallId`, `toolName`, `parentToolCallId`, `sequenceIndex`, `toolExecutionClass`, and `toolOutcome` keys.
