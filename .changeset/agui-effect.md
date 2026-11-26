---
"@systemfsoftware/agent": minor
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
Adds `@systemfsoftware/agent/agui`: `toAgUiEvents` maps a Run's semantic event stream to AG-UI events, `makeAgUiHandler` serves them through `AgUiServer.handler`, which applies the AG-UI run lifecycle, and `fromAgUiInput` adapts an AG-UI run input into a Prompt. Suspended and interrupted Runs end with AG-UI `RunFinished` outcomes instead of `RunError`, state snapshots are not emitted, and subagent events are omitted unless `includeSubagents` is set. Tool results and failures are JSON-encoded in `TOOL_CALL_RESULT`, and a suspended Run reports one interrupt per pending approval.
