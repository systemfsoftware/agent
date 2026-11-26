---
title: A Durable Object test that leaves work behind fails when the shared environment closes
date: 2026-11-26
category: test-failures
module: platform-cloudflare workerd suites
problem_type: flaky_test
component: testing
severity: high
applies_when:
  - A workerd suite runs under @cloudflare/vitest-plugin with several test files sharing a pool worker
  - A test aborts an Object or arms an alarm and returns before its work finishes
  - A test caps a deterministic wait with its own wall-clock timeout
tags: [durable-objects, workerd, vitest-pool-workers, eviction, alarms, quiescence]
---

# A Durable Object test that leaves work behind fails when the shared environment closes

## Context

Three failures appeared in one CI lane that runs `@systemfsoftware/agent-platform-cloudflare` under
`@cloudflare/vitest-plugin`. A pool worker reuses one miniflare/workerd instance for every test file
it runs, and the budget is the suite's configured `testTimeout`, not the machine's spare CPU.

- `background-workers.test.ts` passed all nine tests and then reported
  `EnvironmentTeardownError: [vitest-worker]: Closing rpc while "resolve" was pending`, 38 ms after
  the last test returned. `resolve` is vitest's module-resolution RPC, i.e. an import still running
  inside the environment.
- `progress-wait.test.ts` "reconnects after eviction..." hit its own 20 s cap at 20005 ms on a loaded
  runner; the log showed the eviction landing 0.4 s in, then silence.
- `join-restart.test.ts` hit its own 10 s cap twice on a busy host; each scenario performs about
  135 sequential SQLite operations plus a cold reconstruction, so 10 s was below what the work
  needs when the CPUs are shared.

Measured with a probe: `state.abort()` rejects an in-flight `awaitProgress` RPC with an error
carrying `remote` and `durableObjectReset` (200/200 on a plain RPC, 160/160 through the client), and
workerd does not replay the request on the fresh incarnation. The client therefore has to re-issue
it, and a test that waits for the fresh incarnation to report a subscription stalls for its whole cap
whenever that re-issue does not happen.

## What does not work

- **Raising the per-test cap**: the cap is not the cause; the wait it guards is deterministic, and
  raising it only moves the failure to the suite budget.
- **Retrying or skipping the test**: the test still asserts what it did before, so nothing is fixed.
- **A waiter-count gauge as the reconstruction latch**: a point-in-time count misses a replayed
  request that registers and leaves between two observer calls.
- **Polling the Object with a fixed sleep**: it measures the clock under load and buys nothing the
  Object can signal directly.

## What works

- Re-issue the wait from the client after a reset-shaped transport failure (a bare remote rejection
  or an answer that cannot be decoded), and keep an overload-flagged rejection and a typed host
  failure terminal.
- Count subscriptions monotonically per incarnation, so a re-issued request is observed whether or
  not it is still parked, and latch on the count rather than on a gauge.
- Fork client work through a harness that tracks every fiber, and interrupt and await them after
  each test instead of at the end of the file.
- After each test, disarm the eviction failpoints it armed and delete the persisted alarm of every
  Object it touched, so no alarm pass starts while the environment is closing.
- Keep a generous per-test cap on a test whose own work is sub-second uncontended: a real hang then
  fails in seconds instead of burning the suite budget. Remove the cap only where the test's
  legitimate work sits within a small factor of it under CPU contention, as with the five-scenario
  join test doing about 135 sequential SQLite operations per scenario against 10 s.
- Remove inner `Effect.timeout` guards on Deferred waits. They race CPU scheduling; a real deadlock
  then fails at the suite level rather than as a scheduling accident.
