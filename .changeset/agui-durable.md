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

Adds `projectDurableAgUi` and `toDurableAgUiEvents` to `@systemfsoftware/agent/agui`, projecting a durable Thread's canonical record log plus in-flight provisional text into cursor-indexed AG-UI events, so a reload that replays from any sequence renders the same view a live viewer saw. Each event says whether it is canonical or provisional: in-flight draft text is re-sent in full on every projection, so a consumer replaces its provisional events with the latest set and drops them when the turn's canonical events arrive. Settled Runs end in `RUN_FINISHED` or `RUN_ERROR`, aborted and host-halted Runs end as a stopped `RUN_FINISHED` with the `cancelled` outcome, steering transitions are emitted as `agent.steering` custom events, and a consumer's own structured run output travels in `RUN_FINISHED.result` and can be decoded and re-emitted through the typed `output` extension.
