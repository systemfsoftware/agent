---
"@systemfsoftware/agent": patch
"@systemfsoftware/agent-ai-decision": none
"@systemfsoftware/agent-platform-cloudflare": patch
"@systemfsoftware/agent-platform-node": none
"@systemfsoftware/agent-pr-review": none
"@systemfsoftware/agent-storage-cloudflare": none
"@systemfsoftware/agent-storage-memory": none
"@systemfsoftware/agent-storage-postgres": none
"@systemfsoftware/agent-storage-sql": none
"@systemfsoftware/agent-storage-sqlite": none
"@systemfsoftware/agent-testing": none
---

`ThreadObject.layer` accepts the entries `registration()` returns, so a Durable Object can register an Agent whose `attemptLayer` reads the typed Attempt input. `registration()` no longer types an omitted `continuity` as `undefined`, which `exactOptionalPropertyTypes` rejected.
