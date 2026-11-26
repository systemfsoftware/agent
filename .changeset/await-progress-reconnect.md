---
"@systemfsoftware/agent-platform-cloudflare": patch
---

`CloudflareThreadClient.awaitProgress` now re-issues its wait after any transient transport failure, so a wait for durable progress survives a Durable Object reset instead of ending with the reset's error.
