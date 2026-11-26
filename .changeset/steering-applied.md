---
"@systemfsoftware/agent": minor
"@systemfsoftware/agent-platform-cloudflare": none
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

Runs now emit the live event `SteeringApplied` with the drained `inputIds`, in drain order, once joined steering input enters the model's history at a Turn seam. Durable hosts read the canonical `UserInputRecorded` steering record, which the durable drain appends as it hands the input to the engine.

BEHAVIOR CHANGE (breaking): `RunInputCommand` is a union, and a `steering` command requires `inputId`. A custom `RunInputHook` must return an identity for each steering command; the durable runtime uses the input's `SubmissionId`. Follow-up commands are unchanged.
