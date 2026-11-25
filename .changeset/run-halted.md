---
"@systemfsoftware/agent": minor
"@systemfsoftware/agent-storage-sql": none
"@systemfsoftware/agent-storage-postgres": none
"@systemfsoftware/agent-storage-cloudflare": none
"@systemfsoftware/agent-storage-memory": none
"@systemfsoftware/agent-storage-sqlite": none
"@systemfsoftware/agent-platform-cloudflare": none
"@systemfsoftware/agent-testing": none
"@systemfsoftware/agent-ai-decision": none
"@systemfsoftware/agent-platform-node": none
"@systemfsoftware/agent-pr-review": none
---

Add `AgentRunHalted`, a host stop that is an answer rather than an error. Raised from `beforeTurn`, `beforeModelCall`, `resolveModel` or context preparation, it settles a durable root Run with the new outcome `stopped`, and the `SubmissionSettled` record carries the host's value as `hostStop`. `AgentRunStopped` still settles `failed`. In child and worker Runs, `AgentRunHalted` settles `failed`.

BEHAVIOR CHANGE (breaking): `SettlementOutcome` and `RunSettlementNotice.outcome` gain `stopped`, so exhaustive matches on settlement outcomes need a new case.
