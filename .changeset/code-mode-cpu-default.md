---
"@systemfsoftware/agent-platform-cloudflare": minor
"@systemfsoftware/agent": none
"@systemfsoftware/agent-storage-sql": none
"@systemfsoftware/agent-storage-postgres": none
"@systemfsoftware/agent-storage-cloudflare": none
"@systemfsoftware/agent-storage-memory": none
"@systemfsoftware/agent-storage-sqlite": none
"@systemfsoftware/agent-testing": none
"@systemfsoftware/agent-ai-decision": none
"@systemfsoftware/agent-platform-node": none
"@systemfsoftware/agent-pr-review": none
---

The Cloudflare Code Mode executor now always sets the Worker Loader CPU limit. Without `limits.cpuMillis`, it defaults to the pass's `maxWallTime`, capped at five minutes, so a program still computing after an abort or timeout is stopped by the platform rather than left running in its isolate.

BEHAVIOR CHANGE: passes without `cpuMillis` now run with a CPU limit and the Worker Loader subrequest limit (`maxHostCalls + 8`).
