---
"@systemfsoftware/agent": minor
"@systemfsoftware/agent-platform-cloudflare": minor
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

Add JPEG screenshots with a quality setting to `PageScreenshot`, and export `BrowserSessionPage`, the page type `BrowserSession.run` hands its action.

BEHAVIOR CHANGE (breaking): `PageScreenshotRequest` now requires `format`, so a request without one fails to typecheck and to decode; pass `PageScreenshotPng.make({})` to keep PNG output, or `PageScreenshotJpeg.make({ quality })`.
