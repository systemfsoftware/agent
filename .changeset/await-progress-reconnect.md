---
"@systemfsoftware/agent-platform-cloudflare": patch
---

`CloudflareThreadClient.awaitProgress` now re-issues its wait when a reset reaches it as a bare remote rejection or as an answer that cannot be decoded, so a wait for durable progress survives a Durable Object reset instead of ending with the reset's error.
