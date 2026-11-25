---
"@systemfsoftware/agent": minor
"@systemfsoftware/agent-platform-cloudflare": minor
"@systemfsoftware/agent-storage-cloudflare": minor
"@systemfsoftware/agent-storage-memory": minor
"@systemfsoftware/agent-storage-postgres": minor
"@systemfsoftware/agent-storage-sql": minor
"@systemfsoftware/agent-storage-sqlite": minor
"@systemfsoftware/agent-testing": none
"@systemfsoftware/agent-ai-decision": none
"@systemfsoftware/agent-platform-node": none
"@systemfsoftware/agent-pr-review": none
---

Add per-Run host control: `RunOptions.completion`, `contextTokenLimit` and `toolResultExemption`, durable `runSettings` that every Attempt reapplies, and a `RunHostControl` service that resolves the Run's model, stops it with `AgentRunStopped`, exempts chosen tool results from offloading, and is notified on settlement. A replay with different `runSettings` fails with `AdmissionConflict`.

BEHAVIOR CHANGE: SQL, Durable Object and PostgreSQL storage move to layout 32 (a nullable `run_settings_json` Submission column); layouts 25–31 upgrade in place when the store opens.
