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

Add the `PageInspection` port (`@systemfsoftware/agent/page-inspection`) and its Browser Sessions adapter `browserSessionInspectionLayer` (`@systemfsoftware/agent-platform-cloudflare/browser-inspection`). One pass reports document status, a response header, the landed URL, console and page errors, failed requests, a JSON script value, named-viewport screenshots and timings, or `PageInspectionNotRun` with its cause. `BrowserSessions` now reports an acquisition rate limit as `rate-limited`.

BEHAVIOR CHANGE (breaking): `SandboxImplementation`, `PageViewport`, `PageScreenshotPng` and `PageScreenshotJpeg` are now plain Schema structs rather than classes; build them with `.make(...)` or object literals, and do not use `instanceof`.
