---
"@systemfsoftware/agent-testing": minor
---

`durableCoordinatorConformance` is now a function of `{ withStorage, concurrency }` and runs its sweep cells concurrently, each over storage that `withStorage` supplies for that cell alone. Pass a `withStorage` that checks out a separate database per cell.
