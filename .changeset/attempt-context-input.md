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

Pass the Attempt's decoded input to `AgentRegistration.attemptLayer` as `AgentAttemptContext.input`, typed from the Definition's input Schema. The value is the Submission's persisted input decoded for the Attempt, identical on every Attempt including recovery, so a per-Attempt service can read it without re-reading the input record.
