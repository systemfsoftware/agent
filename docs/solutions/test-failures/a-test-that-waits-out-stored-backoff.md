---
title: A test that waits out a stored retry backoff measures the clock, not the code
date: 2026-11-25
category: test-failures
module: platform-cloudflare scheduling tests
problem_type: slow_test
component: testing
severity: medium
applies_when:
  - A test injects repeated failures into a Durable Object alarm and waits for retries
  - A retry delay is stored in Durable Object SQLite and has a schema-enforced floor
  - A test is slow but uses almost no CPU
tags: [durable-objects, alarms, retry-backoff, testclock, vitest-pool-workers]
---

# A test that waits out a stored retry backoff measures the clock, not the code

## Context

`keeps recovery wakes through repeated processing failures` took 63.6s; its six siblings took 3.3s
together. effect-cf's `DurableObjectAlarm` reschedules a failed alarm itself, storing
`attempts` and `retry_at` in SQLite, with a delay of `minimumRetryDelay * 2 ** (attempts - 1)` and
a 1000ms floor its configuration schema enforces. Six failures meant waiting 1, 2, 4, 8 and 16s,
then about 32s more for recovery.

## What does not work

- **`TestClock` with hand-run passes** (`RunSymbol(scheduleAlarmHandler)`): this bypasses the real
  `alarm()` entry point and its idle signal. With the test object's short limits, the in-pass
  admission retry sleeps on a `TestClock` that nothing advances, so the pass hangs. With default
  limits, the run ends with the schedule still due and no wake left.
- **Lowering the delay floor**: weakens a production backoff guarantee to make a test fast.
- **Virtual-time runners and in-process simulation kernels**: they control Effect fibers, not
  workerd's native alarm scheduler.

## What works

Keep every turn on the real `alarm()`. Book the schedule a day out so workerd never fires it on its
own clock. Before each turn, make the stored rows due (`run_at`, `wake_at`, and a non-null
`retry_at`, all to 0), leave `attempts` alone, and fire the turn with `runDurableObjectAlarm(stub)`.
Assert that the call returns `true`: a turn that finds no native alarm means the failure dropped its
recovery wake. Retry accounting still runs (a probe showed `attempts` 1 to 6 and stored delays
doubling from 0.9s to 15.9s), and the test takes under a second.

## Rule of thumb

When a slow test's wall time far exceeds its CPU time and the wait is a delay the code stored,
drive the stored deadline to due and run the real entry point. Do not fake the layer that owns the
delay.
