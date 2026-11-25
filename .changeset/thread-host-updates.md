---
"@systemfsoftware/agent": minor
"@systemfsoftware/agent-storage-sql": minor
---

Add `DurableAgentRuntime.appendHostUpdate`, which commits a Thread-scoped `ThreadHostUpdateAppended` record that a host can append while a Run is active or the Thread is idle. It is idempotent by `updateId`, carries bounded JSON, and is skipped by the model's prompt history.

BEHAVIOR CHANGE (breaking): the record format is now `effect-agent/thread@7`. Stores and exports written at `@6` are not read by this version; start from a fresh store.
