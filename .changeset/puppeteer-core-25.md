---
"@systemfsoftware/agent-platform-cloudflare": patch
---

Support `puppeteer-core` 25: import the browser build from its new `lib/puppeteer` entry and read the connection state from the `connected` property that replaces the removed `isConnected()` method.
