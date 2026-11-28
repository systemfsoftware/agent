---
"@systemfsoftware/agent-platform-cloudflare": minor
---

BEHAVIOR CHANGE (breaking): the Durable Object substrate is `@systemfsoftware/effect-cf`. Declare and import it where you declared and imported `effect-cf`; declare it as a peer so a host shares one module instance. Each domain now offers a `mount` beside its `make` — `ThreadObject.mount`, `CloudflareScheduling.mountScheduleOwnerObjectClass`, `CloudflareSubscriptions.mountSubscriptionPartitionObjectClass` and `CloudflareMemory.MemoryObject.mount` — which returns the object as a host-dispatched record for a host that already gated the instance and owns, or delegates, the alarm slot. Add consumer services and methods through an `extend: { layer, rpc }` option on both `make` and `mount`; an extension layer may require the domain's runtime services. `ThreadObject.layerInHost` and `layerHostConfig` are removed; move their callers to `extend`.
