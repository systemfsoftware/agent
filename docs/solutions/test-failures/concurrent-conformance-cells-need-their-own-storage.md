---
title: Concurrent conformance cells need their own storage, failpoint control and runtime
date: 2026-11-25
category: test-failures
module: agent-testing coordinator conformance
problem_type: slow_test
component: testing
severity: medium
applies_when:
  - A sequential fault-injection sweep is slow but mostly waits on I/O
  - Sweep cells share a database, a failpoint handler or a runtime
  - Tuning test concurrency on a CI runner with few vCPUs
tags: [concurrency, integresql, failpoints, conformance, ci]
---

# Concurrent conformance cells need their own storage, failpoint control and runtime

## Context

The PostgreSQL coordinator certification ran as one sequential sweep: 90.8s on CI, 84.8s locally
on 20.4s of CPU. That makes it I/O- and wait-bound, which is the case concurrency helps.

## What it took

- **Isolate every cell.** Recovery passes scan every Thread in storage, and the failpoint control
  holds a single handler, so concurrent cells on one database or one control fire and recover each
  other's work. Each cell builds its own runtime, failpoint control and config, and checks out its
  own IntegreSQL database through the caller's `withStorage`.
- **Keep the sweep's closure.** Recovery in one cell can reach a failpoint that clean discovery
  never did (four of six scenarios swept more cells than discovery reached). A fixed list from
  discovery drops those cells. Run waves until no scenario has a reached but undriven location.
- **Keep IntegreSQL's pool above the concurrency.** IntegreSQL v1.1.0 recreates the oldest
  checked-out database, even one still in use, once its pool reaches the maximum size with fewer
  than the initial size ready or recreating (`pkg/pool/pool.go`, `autoCleanDirty`). With 16 cells
  on a pool of 16, a cell's database was dropped under it (`database "integresql_test_empty_009"
  does not exist`). The pool maximum is derived from the most databases a test holds plus room for
  the initial size, so the two cannot drift apart.
- **Size the pools together.** At 16 cells, Postgres refused connections until each cell's client
  was capped at four connections, keeping 64 connections under `max_connections` 200.

## Measure where it runs

On a 4-vCPU runner shared with every other suite, 16 cells made the test slower (153.2s). In its
own CI lane it took 53.2s at 16 and 57.9s at 4. Concurrency that wins alone can lose under
contention, so measure it in the layout it will run in, and land it after the lane split.
