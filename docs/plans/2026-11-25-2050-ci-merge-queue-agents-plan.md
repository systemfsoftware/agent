---
title: CI Lanes, the Merge Queue, and Agent Authors - Plan
type: ci
date: 2026-11-25
artifact_contract: ce-unified-plan/v1
execution: code
status: draft (review round 1 of the design is recorded below; round 2 pending)
---

# CI Lanes, the Merge Queue, and Agent Authors - Plan

## Goal Capsule

- **Objective:** most pull requests here are written by coding agents. They should get the failing lane in under two
  minutes on their own head. They should enter the Mergify queue instead of being admin-merged. And no change reaches
  `main` without the full suite having run, on the merged tree through the queue or on the head before an admin merge
  (D4).
- **Means:** split the two monolithic jobs into parallel lanes under the unchanged `checks / check` verdict. Run the
  heavy suites only where they can be affected on a pull request head, and always on queue drafts, `main` and a nightly
  schedule. Make the queue the normal merge path.
- **Authority:** this plan, `AGENTS.md`, the org Mergify policy inherited through `extends: .github`, and the `main`
  ruleset.
- **Stop conditions:** the required check name `checks / check` changes; `checks / check` can pass on a queue draft or
  `main` while any lane did not run; a heavy suite flakes under the split.

## Measured starting point

All figures come from `main` run 45688588430 and the last 40 CI runs.

- `static checks` takes 216s (format, type-aware oxlint, `tsc -b`, build, export, record-format, purity and pack
  checks). `test` takes 249s on one runner. `gritlint` takes 91s.
- Inside `test`, three heavy suites run beside `pnpm -r --workspace-concurrency=4`: storage-postgres takes 190s
  (Postgres and IntegreSQL in KVM microVMs), platform-cloudflare 161s (workerd) and agent-testing 161s. Every other
  suite takes 39s or less.
- CI has no `merge_group` trigger. Mergify's draft runs as a `pull_request` on `mergify/merge-queue/*`, with
  cancellation disabled.
- The `main` ruleset requires `checks / check` and lets organization admins and the admin role bypass it. Mergify's
  integration is exempt.
- Mergify merged none of the last 18 merged pull requests. Each one was merged directly.
- A platform-cloudflare durable progress-wait test timed out at 20s once on a pull request head. It passed on the next
  head and locally.

## Decisions

### D1. Lanes

These lanes replace the current `static checks` and `test` jobs. `checks / check` keeps its name and aggregates every
lane.

| Lane              | Runs                                                                 | Pull request head | Queue draft | `main` push | Nightly |
| ----------------- | -------------------------------------------------------------------- | ----------------- | ----------- | ----------- | ------- |
| `lint`            | format, type-aware oxlint, actionlint                                | always            | always      | always      | always  |
| `build and pack`  | `tsc -b`, build, `check:exports`, record-format, purity, pack checks | always            | always      | always      | always  |
| `gritlint`        | conventions linter from the flake                                    | always            | always      | always      | always  |
| `test`            | every suite except the three below                                   | always            | always      | always      | always  |
| `test postgres`   | storage-postgres                                                     | affected only     | always      | always      | always  |
| `test cloudflare` | platform-cloudflare                                                  | affected only     | always      | always      | always  |
| `test agent`      | agent-testing                                                        | affected only     | always      | always      | always  |
| `change intent`   | changeset presence                                                   | always            | skipped     | skipped     | skipped |

"Affected only" means the lane runs when the pull request changes the package or any workspace package it depends on,
computed from the pnpm graph against the merge base. A change to any root or toolchain input runs all three regardless:
`pnpm-lock.yaml`, `pnpm-workspace.yaml`, the root `package.json`, any `tsconfig*.json`, `flake.nix`, `flake.lock`,
`.github/workflows/` or `.github/actions/`. `test postgres` carries the `/dev/kvm` permission step that the single
`test` job has today, through a shared composite action.

Each run has ten jobs: the eight lanes above, `checks / check`, and `squash message` from its own workflow. That is
about one job per package group rather than one per package, so three speculative queue drafts plus a few agent pull
requests stay inside the account's concurrent-job limit.

### D2. The verdict fails closed where it matters

On a queue draft, on `main` and on the schedule, `checks / check` fails when any of the seven build, lint and test lanes
concluded anything but `success`, `skipped` included. `change intent` runs only on pull request heads, so it must succeed
there and may be skipped everywhere else. On a pull request head the three affected-only lanes may also be skipped.

### D3. Queue configuration

- Keep the org's `branch_protection_injection_mode: queue`. Pull request heads run CI here, so the injected
  `checks / check` can be satisfied before queueing. This is the difference from a repository whose CI runs only on
  drafts.
- On `default`: `batch_size` max 3 and `batch_max_wait_time` 30 seconds. A failed batch of 3 needs at most one split.
- Keep `subtree` at batch size 1 with merge commits.
- Priority rules: a `ci-fix` label goes first, dependency updates go last.
- `max_checks_retries: 1` stays only as a safety net. Flakes are fixed in the test.

### D4. Agents merge through the queue

The queue is the routine merge path. Once the review gate approves, `merge_protections_settings.auto_merge_conditions`
enqueues the pull request, and no agent runs `gh pr merge` on it. When a pull request cannot enter the queue, the agent
reports the exact blocking condition: missing approval, the hold label, the title rule, or owner approval on protected
paths.

The maintainer bot keeps its admin merge for a pull request the queue cannot take. Before that merge it dispatches
`ci.yml` on the head, which runs every lane because only pull request events skip the affected-only lanes. It merges
only once that run's `checks / check` succeeds.

### D5. Flaky suites

- Each heavy suite gets its own runner, which removes the CPU contention suspected in the workerd timeout. That cause is
  unproved.
- The progress-wait test is rewritten to wait on a readiness signal or the test clock, not wall time.
- A test that times out is fixed or deleted. Its time budget is never raised.

### D6. What an agent sees first

`squash message` and `change intent` report in about 10 seconds, `lint` in about 45, and `test` and `gritlint` in
about 90. The affected heavy lanes and `build and pack` finish in about 190. Each lane writes one line to the job summary, so an agent can find the failing lane without reading logs.

## Review record

Two review rounds came from an outside reviewer.

- **Round 1, refuted: remove the bot identity from the ruleset bypass.** In this organization, the maintainer bot may
  admin-merge once it has read the checks itself. Round 2 accepted the refutation. It also found that an admin merge of
  a pull request that skipped the heavy lanes reaches `main` without the full suite. D4 now requires a full run on the
  head first.
- **Round 2, settled: heavy suites run on pull request heads when affected, not only in the queue.** A regression found
  first in a queue batch of up to 3 fails the batch and forces a bisection run that boots the microVMs again. Runner
  minutes are free, and an unaffected pull request skips those lanes anyway.
- **Round 2, fixed:** `change intent` is exempt from the queue-draft, `main` and nightly verdict (D2). Root and
  toolchain changes run every heavy lane (D1). The job count is reconciled at ten (D1). The KVM step moves with
  `test postgres` (D1).

## Measured answers to round 1's questions

- Auto-enqueue exists: the org policy sets `merge_protections_settings.auto_merge_conditions`, which needs the review
  gate's approval. It has not been exercised here, since Mergify merged none of the last 18 pull requests.
- No suite runs outside `ci.yml` today.
- The organization's concurrent-job limit is not measured.
