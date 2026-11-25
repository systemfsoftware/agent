---
"@systemfsoftware/agent-platform-cloudflare": minor
"@systemfsoftware/agent": none
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

Run `BrowserSessions` on the Browser Run binding alone: REST credentials move to an optional `lifecycle` option, and `close` returns `"confirmed"` or `"unconfirmed"`.

BEHAVIOR CHANGE (breaking): pass `lifecycle: { accountId, apiToken }` instead of top-level `accountId` and `apiToken`. Without it, `getReadOnlyLiveView` fails with `live-view-requires-rest-credentials`.
