<h1 align="center">@systemfsoftware/agent</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@systemfsoftware/agent"><img alt="npm" src="https://img.shields.io/npm/v/@systemfsoftware/agent/beta?label=npm&labelColor=121310&color=b9a4ff" /></a>
  <a href="https://github.com/systemfsoftware/agent/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/systemfsoftware/agent/ci.yml?branch=main&label=ci&labelColor=121310" /></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-f3f1e8?labelColor=121310" /></a>
</p>

<p align="center">
  <a href="https://github.com/systemfsoftware/agent/tree/main/docs"><b>Documentation</b></a>
  ·
  <a href="https://github.com/systemfsoftware/agent/blob/main/docs/src/content/docs/guide/getting-started.md">Getting started</a>
  ·
  <a href="https://github.com/systemfsoftware/agent">GitHub</a>
</p>

@systemfsoftware/agent builds **durable agent Threads** in TypeScript with Effect and Effect AI.
Define schemas, instructions, and tools. The runtime runs the model/tool loop, validates
output, and can retain accepted work across process restarts.

A Thread is the conversation; a Run is one logical execution; an Attempt is one period advancing it.
Additional input can join an active Run.
Model context, history, and recovery state have separate lifetimes, so a long conversation
can be compacted without discarding its committed history.

## What you own

Your application supplies authorization, tool handlers, model services, and storage.
@systemfsoftware/agent supplies typed execution, bounded work, approvals, and recovery under a
single owner per Thread. Native Effect AI tools and provider Layers work directly.

A durable receipt means the runtime owes a terminal settlement. Recorded results are reused;
uncertain ordinary mutations require reconciliation. Durable Steps need external idempotency.
There is no exactly-once external execution guarantee.
[Read the durability contract](https://github.com/systemfsoftware/agent/blob/main/docs/src/content/docs/concepts/durability.mdx).

## Try it

```sh
bun add @systemfsoftware/agent@beta effect
```

```ts
import { Agent, AgentRuntime } from '@systemfsoftware/agent'
import { Schema } from 'effect'
import { Toolkit } from 'effect/ai'

const triage = Agent.make('triage', {
  input: Schema.String,
  output: Schema.Struct({
    severity: Schema.Literals(['low', 'medium', 'high', 'critical']),
    explanation: Schema.String,
  }),
  instructions: 'Classify the bug report and explain the severity in one sentence.',
  toolkit: Toolkit.empty,
  policy: { maxTurns: 2, maxToolCalls: 1, maxDuration: '30 seconds' },
})

const result = AgentRuntime.run(triage, 'Users cannot sign in.')
```

Supply a model and history Layer to execute the Effect. The
[getting-started guide](https://github.com/systemfsoftware/agent/blob/main/docs/src/content/docs/guide/getting-started.md) has complete provider
setup, installation, and an executable entry point.

## Choose a host

| Need                        | Choice                                            |
| --------------------------- | ------------------------------------------------- |
| Process-local conversations | `InMemory.layer`                                  |
| Retained successful history | SQLite or PostgreSQL adapter                      |
| Durable Node service        | Supplied SQLite host, or a custom PostgreSQL host |
| Durable Cloudflare service  | SQLite-backed Thread Objects                      |

[How it works](https://github.com/systemfsoftware/agent/blob/main/docs/src/content/docs/concepts/runtime-model.mdx) ·
[Platforms](https://github.com/systemfsoftware/agent/blob/main/docs/src/content/docs/platforms/index.md) ·
[Packages](https://github.com/systemfsoftware/agent/blob/main/docs/src/content/docs/reference/packages.md)

## Development

Framework packages live in `packages/*`. pnpm is the package manager.

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

Read [AGENTS.md](AGENTS.md) and the [glossary](GLOSSARY.md)
before contributing. The gate runs format, lint, typecheck, build and test.
