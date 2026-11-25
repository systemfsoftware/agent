---
"@systemfsoftware/agent": minor
"@systemfsoftware/agent-storage-sql": minor
"@systemfsoftware/agent-storage-postgres": minor
"@systemfsoftware/agent-storage-cloudflare": none
"@systemfsoftware/agent-storage-memory": none
"@systemfsoftware/agent-storage-sqlite": none
"@systemfsoftware/agent-platform-cloudflare": none
"@systemfsoftware/agent-testing": none
"@systemfsoftware/agent-ai-decision": none
"@systemfsoftware/agent-platform-node": none
"@systemfsoftware/agent-pr-review": none
---

Add `DurableAgentRuntime.appendHostUpdate`, which commits a Thread-scoped `ThreadHostUpdateAppended` record that a host can append while a Run is active or the Thread is idle. It is idempotent by `updateId`, carries bounded JSON, and is skipped by the model's prompt history.

BEHAVIOR CHANGE (breaking): the record format is now `effect-agent/thread@7`. Exports written at `@6` are not imported, and a Postgres store created at `@6` is refused at startup; start from a fresh store.
