---
title: Per-Run host control
description: Choose the model, completion contract, context limit and stop conditions for one Run, and keep them across durable Attempts.
---

One Agent Definition can serve Runs that need different models, context limits or completion
rules. These settings belong to the Run, not the Definition, so the host supplies them when it
submits work. Durable runtimes persist them with the Submission and apply them again on every
Attempt, including recovery after an eviction.

## Run options

`AgentRuntime.run`, `stream` and `start` accept these per-Run options:

| Option                | Effect                                                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `completion`          | `"text"` drops the Definition's completion Tool for this Run. The final text is decoded through the Definition's output Schema, as for a Definition without a completion Tool. `"definition"` keeps the default. |
| `contextTokenLimit`   | Replaces the policy's `contextTokenLimit` for this Run. The compaction pressure check then also counts the largest tool result of the most recent Tool batch, so the next Turn has room for a result that size.  |
| `toolResultExemption` | `exempt(request)` returns `true` to keep one oversized result inline instead of truncating and offloading it. An exempted result is still bounded by `maxBytes` and, for durable Runs, by the record limit.      |

The exemption request carries `toolName`, `toolCallId`, `turn`, `isFailure` and the encoded byte
length. It is called only for results larger than `toolResultBounds.maxBytes`.

## Stop a Run with a typed failure

Fail a Run hook with `AgentRunStopped` to end the Run before its next model call. The hook can be
`beforeTurn`, context preparation, or a durable model resolver. `value` is your own encoded JSON
failure:

```ts
import { AgentRunStopped } from '@systemfsoftware/agent/agent-error'

const stop = AgentRunStopped.make({ value: { code: 'quota' }, message: 'Quota spent' })
```

A durable Run settles `failed`. The Settlement's `failure` keeps the bounded diagnostic, and its
`hostFailure` keeps `value`. The canonical `SubmissionSettled` record keeps it too.

## Durable submissions

`DurableSubmitOptions.runSettings` is stored on the Submission ledger row. It holds only
non-secret values:

| Field                                | Applied on every Attempt as                                      |
| ------------------------------------ | ---------------------------------------------------------------- |
| `model`                              | `{ provider, model, credentialSource? }`, passed to the resolver |
| `completion`                         | the Run's completion mode                                        |
| `contextTokenLimit`                  | the Run's context limit                                          |
| `toolSelection`                      | the initial tool selection until a discovery receipt replaces it |
| `turnAllowance`, `toolCallAllowance` | tightening-only allowances below the Definition's policy         |

The first admission of an idempotency key wins; a replay returns the original Receipt and keeps the
original settings.

## RunHostControl

Provide `RunHostControl` to the durable runtime. The runtime captures it when its Layer is built:

```ts
import { RunHostControl } from '@systemfsoftware/agent/durable-agent-runtime'

const hostControl = Layer.succeed(RunHostControl, {
  resolveModel: (request) => models.resolve(request.submissionId, request.model),
  beforeTurn: (request) => quota.check(request.submissionId),
  encodeFailure: (error) => encodeToolFailure(error),
  finalize: (notice) => models.release(notice.submissionId),
})
```

- `resolveModel` runs before every model call of a Run whose settings name a `model`, compaction
  calls included. It returns a `ResolvedModelCall` built from host memory; the model and its
  credentials never reach storage. When it fails with `AgentRunStopped`, the Run stops. A Run with
  `model` settings and no resolver stops with `{ reason: "model-resolver-missing" }`.
- `beforeTurn` runs before each new model call.
- `encodeFailure` maps any other terminal failure, such as a Tool with `failureMode: "error"`, to
  the `hostFailure` value. Return `Option.none()` to keep only the diagnostic.
- `finalize` runs after every settlement (`completed`, `failed`, `aborted`) and with `released`
  when an Attempt is interrupted, for example when its Durable Object event scope closes. A
  released Run is not settled; its next Attempt calls `resolveModel` again. Failures and defects in
  `finalize` are ignored.

On Cloudflare, pass the same value as `runHostControl` in the `ThreadObject.make` options, and send
`runSettings` with `CloudflareThreadClient` submits. `ThreadObject.submit` forwards them to the
ledger.

## Storage layout

Persisted settings use layout 32 on SQLite, Durable Object SQLite and PostgreSQL. It adds a nullable
`run_settings_json` column to `effect_agent_submissions`; layouts 25 to 31 upgrade in place.
