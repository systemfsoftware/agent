---
"@systemfsoftware/agent": patch
---

Move the repository onto the current Effect toolchain (effect 4.1.5,
`@effect/tsgo` 0.73.4). The runtime behavior is unchanged; the engine's
runtime test adapts to the compiler's new `Toolkit.handle` parameter
type.
