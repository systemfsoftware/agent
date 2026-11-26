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

Add `textCompletion` to `Agent.make` so one Definition can complete a `completion: "text"` Run from its final assistant text while other Runs keep the completion Tool. On such a Run the text is projected through `textCompletion`, rejected when empty, and encoded as the output.
