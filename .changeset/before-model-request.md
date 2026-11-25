---
"@systemfsoftware/agent": minor
"@systemfsoftware/agent-platform-cloudflare": none
"@systemfsoftware/agent-storage-cloudflare": none
"@systemfsoftware/agent-storage-memory": none
"@systemfsoftware/agent-storage-postgres": none
"@systemfsoftware/agent-storage-sql": none
"@systemfsoftware/agent-storage-sqlite": none
"@systemfsoftware/agent-testing": none
"@systemfsoftware/agent-ai-decision": none
"@systemfsoftware/agent-platform-node": none
"@systemfsoftware/agent-pr-review": none
---

Add `RunOptions.beforeModelRequest` and its durable form `RunHostControl.beforeModelCall`, a check that runs after context preparation and before every provider request, including compaction summaries and overflow retries, so `AgentRunStopped` ends a Run without another model call.
