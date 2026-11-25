---
"@systemfsoftware/agent": patch
---

Move the repository onto the current Effect toolchain (effect 4.1.5,
`@effect/tsgo` 0.73.4). The engine now requests Effect AI's native deferred
Tool Call validation and validates parameters itself, so invalid arguments to a
`failureMode: "return"` Tool still return to the model as a parameter rejection
under effect 4.1.5. Invalid arguments to any other application Tool fail the
Run with `ModelProtocolError` rather than Effect AI's `InvalidOutputError`.
