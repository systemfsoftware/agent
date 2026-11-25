---
"@systemfsoftware/agent": minor
---

`RunHostControl` requests (`beforeTurn`, `beforeModelCall`, `exemptToolResult`) and the `RunContextRequest` given to `context.prepare` and `transientContext.load` now carry `runStartedAtMillis`, read from the Run's canonical `RunStarted` record, so it is stable across Attempts and host restarts.
