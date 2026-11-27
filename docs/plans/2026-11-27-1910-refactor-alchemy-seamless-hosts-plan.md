---
title: Alchemy-Hosted Durable Objects Through effect-cf - Plan
type: refactor
date: 2026-11-27
topic: alchemy-seamless-hosts
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Alchemy-Hosted Durable Objects Through effect-cf - Plan

## Goal Capsule

- **Objective:** a Worker author declares this library's Thread, scheduling, subscription and memory Durable Objects in an Alchemy stack, deploys it, and every object works with its alarms, with no wake lost. The same objects keep working in a plain Cloudflare Worker without Alchemy.
- **Means:** effect-cf, which this project now maintains as a fork, gains a host-neutral instance core, a hosted mount form and a delegated alarm slot. The agent's Cloudflare package keeps effect-cf as its one Durable Object substrate and exposes each domain both as a class and as a mount (KTD1 to KTD4).
- **Product authority:** this Product Contract, under each repository's `AGENTS.md`, `CODING_STANDARDS.md` and `REVIEW.md`. Design calls the law leaves open are recorded in Key Technical Decisions or Open Questions.
- **Open blockers:** the effect-cf fork must be publishable before the agent units start, and that tooling port is separate work (Dependencies). The agent units can be written against a local build of the fork but cannot merge until the fork release exists.
- **Execution profile:** two pull requests, in order. First, one in `systemfsoftware/effect-cf` (E1 to E4). Then one in `systemfsoftware/agent` (A1 to A5), which waits until the effect-cf release from E4 is published.
- **Stop conditions:** stop and report if any of these happens:
  - a KTD proves impossible on the installed library sources;
  - a unit would need an Alchemy dependency in either published package;
  - the deployed check in A4 loses a wake or raises the AsyncLocalStorage error.
- **Who finishes:** an implementation agent builds every unit. The lead runs the deployed check in A4, because it needs deploy credentials. The lead also holds the merges and the TEST-1 admissions.

---

## Product Contract

### Summary

Make the agent library's four Cloudflare Durable Object domains deployable from an Alchemy stack as easily as from a plain Worker. The work changes two repositories this project owns: effect-cf (the Durable Object runtime) and the agent's Cloudflare package. No layer exposes another layer's types it does not need, and neither published package depends on Alchemy.

### Problem Frame

Every agent Durable Object class is built by effect-cf's `DurableObject.make`. That function returns a class extending `cloudflare:workers` `DurableObject`, and the class owns the instance's `ManagedRuntime`, its init gate, per-event Scopes, native RPC methods, telemetry flush and the alarm multiplexer. It is the sole `setAlarm` writer.

Alchemy constructs Durable Object classes itself. Its workerd bridge builds each instance inside `blockConcurrencyWhile`, dispatches RPC through a proxy to the own properties of one returned method record, flushes telemetry per call, and runs its own alarm-callback dispatcher before the instance's `alarm`. When that dispatcher is in use, it sets the single alarm to its own earliest row or deletes it. So an effect-cf class cannot be handed to Alchemy as is. If both effect-cf and Alchemy schedule one object's alarm, each overwrites the other and wakes are lost.

The Thread object has an application-owned path (`ThreadObject.layerInHost`, documented under "Use an existing Object" in `docs/src/content/docs/storage/cloudflare.md`). That path still needs effect-cf's `ThreadMaintenanceAlarm` and `DurableObjectAlarm.ScheduleConfiguration`, which leaks effect-cf types onto a path that does not run effect-cf's class. Scheduling, subscriptions and memory have no such path. Both repositories are owned here, so the fix can be made where the coupling lives, in effect-cf, instead of rebuilding effect-cf's runtime next to it.

### Requirements

**Hosting**

- R1. Each of the Thread, schedule owner, subscription partition and memory objects can be declared in an Alchemy stack and deployed, with the same behaviour, persisted records and RPC wire values as under a plain Worker.
- R2. Each of the four objects keeps working as a plain Cloudflare Worker class, with no Alchemy present.
- R3. A consumer can add their own methods, and their own services, to a library object under either host, sharing its runtime, SQLite database and init gate.

**Alarms**

- R4. Each object has exactly one writer of its physical alarm slot at a time. Under Alchemy, a consumer can also use Alchemy alarm callbacks on the same object without any library wake being lost.
- R5. Library alarms keep today's retry, park and repeat semantics under both hosts.

**Abstraction boundaries**

- R6. Neither published package (`@systemfsoftware/agent-platform-cloudflare` and the effect-cf fork) imports or declares Alchemy, and neither exposes Alchemy types.
- R7. effect-cf knows nothing about the agent. The agent core (`@systemfsoftware/agent`) imports nothing from Cloudflare or effect-cf. A consumer hosting objects under Alchemy imports no effect-cf module and names no effect-cf type for the common case: the four domains, the alarm slot choice, consumer services and consumer methods.
- R8. Superseded entrypoints are deleted with no alias. This includes the application-owned Thread path, if R3 covers it (Open Questions Q3).

**Runtime**

- R9. Telemetry recorded by library code leaves the object by the end of every event under both hosts, and no span is exported twice.
- R10. Every fiber library code forks is scoped to one event. Interrupting a host call interrupts the library work it started.
- R11. A deployed Alchemy-built Worker proves R1, R4 and R9 on Cloudflare. Local workerd evidence alone does not count.

### Acceptance Examples

- AE1. **Covers R1, R11.** Given an Alchemy stack declaring all four objects, when it is deployed and a client submits a Thread run, creates a schedule, subscribes and writes memory, then each call answers and each object's alarm-driven work runs.
- AE2. **Covers R4.** Given an Alchemy object hosting the Thread domain in delegated slot mode, plus a consumer Alchemy callback due at t2, and a library maintenance wake due at t1 > t2, when the alarm fires at t2, then the library wake still fires at t1.
- AE3. **Covers R2.** Given a plain Worker exporting the four classes, when it is deployed and exercised as in AE1, then the same calls answer and the same alarms fire.
- AE4. **Covers R3.** Given a mounted Thread object with a consumer method `ping` that reads a row the Thread wrote, when a client calls both through one stub, then both answer.
- AE5. **Covers R6, R7.** Given the Alchemy example's source, then it imports no effect-cf module, and neither published package's `package.json` or emitted declarations name Alchemy.
- AE6. **Covers R9.** Given one RPC to a mounted object, then every span it recorded is exported exactly once.

### Scope Boundaries

- An Alchemy-specific package, entrypoint or adapter in either repository is out (R6). The Alchemy glue a consumer writes is shown in an example workspace.
- A second Durable Object runtime, stub cache or trace carrier beside effect-cf's is out. That is the shape this plan replaces.
- Upstreaming the effect-cf changes to the original repository is not required (Open Questions Q4).
- Porting the agent repository's tooling into the effect-cf fork so that it can publish is a dependency, not this plan's scope.

### Dependencies / Assumptions

- `systemfsoftware/effect-cf` is a public fork of `danieljvdm/effect-cf` at `0.59.0`, MIT-licensed. Its `packages/effect-cf/src` is identical to the installed `effect-cf@0.59.0` for `DurableObject.ts`, `DurableObjectAlarm.ts`, `RpcTargets.ts` and `RpcTracing.ts` (byte-compared). It builds with bun and has its own CI and release workflows.
- The npm name `effect-cf` belongs to the original maintainer, and `@systemfsoftware/effect-cf` is not published (`npm view` returned 404). The fork therefore publishes under a scoped name (Open Questions Q1).
- Installed sources the plan is resolved against: Effect `4.1.5`, `@cloudflare/workers-types` `5.20261026.1`, Alchemy and `@alchemy.run/cloudflare` `2.0.0-beta.87`.
- Deploying the check in A4 follows the durable-bench pattern. It uses the Alchemy CLI, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, a `workers.dev` URL behind a secret, and teardown through `alchemy destroy` plus the existing cleanup check.

### Sources / Research

- effect-cf `packages/effect-cf/src/DurableObject.ts`:
  - `make` (`:255`) builds the class at `:292`.
  - The constructor builds the runtime from the consumer Layer plus `DurableObjectAlarm.layer` and `DurableObjectState` (`:298-317`). It runs `initialize` under `state.blockConcurrencyWhile` (`:321-333`).
  - `[RunSymbol]` runs each event, with dispatch-after-event through `waitUntil` (`:335-403`). `fetch` is at `:394-404`, and `#runAlarm` hands the alarm to `DurableObjectAlarm`'s `RunAlarm` (`:410-440`).
- effect-cf `DurableObjectAlarm.ts`: the physical slot is touched in two places only. `readNativeAlarm` calls `storage.getAlarm` (`:1329-1342`), and `writeNativeAlarm` calls `setAlarm` or `deleteAlarm` (`:1362-1372`). The comment there names the scheduler as the sole alarm writer.
- effect-cf `RpcTargets.ts:10-30`: reuses native Durable Object stubs within one invocation and builds a fresh one outside it. It is a stub cache over native RPC, not a separate transport.
- effect-cf `internal/Runtime.ts`: `makeEntrypointRuntime` (`:62`), `scopeEvent` (`:89`) and `runEventPromise` (`:92-143`) are already host-neutral functions over a `ManagedRuntime`.
- Alchemy `2.0.0-beta.87`:
  - It builds the instance inside `blockConcurrencyWhile` (`alchemy/src/Workers/Workerd/DurableObjectBridge.ts:99`).
  - It dispatches only to own properties of the returned record, which must return an Effect or Stream (`alchemy/src/Workers/DurableObjectBridge.ts:252-276`).
  - Its `alarm` runs `dispatchAlarmCallbacks` first, then the instance's `alarm` (`Workerd/DurableObjectBridge.ts:124-131`).
  - With no registered callback and no Alchemy alarm tables, the dispatcher returns at once (`Workerd/AlarmCallback.ts:402-417`). Otherwise it ends by reconciling the slot to its own earliest row, or deleting it (`:556`, `Workerd/DurableObjectAlarmStorage.ts:83-102`). Scheduling a callback from user code reconciles too (`AlarmCallback.ts:361`, `:377`).
  - A success value that is not a Stream reaches native RPC unchanged, and a typed failure becomes an error envelope (`alchemy/src/Workers/Worker.ts:258-283`).
  - Its trace argument is a trailing `{ "~alchemy/traceparent": string }`, and its stripper removes only that shape (`@alchemy.run/cloudflare` `src/Workers/internal/RpcTraceContext.ts:12-55`). effect-cf's own tagged trace argument therefore passes through to the method.
  - A consumer declares `class X extends Cloudflare.DurableObject<X>()(name, outer)`. The outer Effect resolves dependencies and the state reference, and the inner Effect returns the method record (`@alchemy.run/cloudflare` `src/Workers/DurableObject.ts:455-519`). The native state is `state.raw` (`alchemy/src/Workers/Workerd/DurableObjectState.ts:64-66`), and env comes from `WorkerEnvironment`.
  - A per-call telemetry Scope closes in `waitUntil` after each call (`alchemy/src/Workers/DurableObjectBridge.ts:199-248`).
- Agent `packages/platform-cloudflare/src`:
  - Ten files import effect-cf: `Alarm`, `CloudflareBindings`, `CloudflareMemory`, `CloudflareScheduling`, `CloudflareSubscriptions`, `CloudflareThreadClient`, `ThreadObject`, `internal/layers`, `internal/transport` and `internal/live-text-observation`.
  - Class factories: `ThreadObject.make` (`ThreadObject.ts:1264`), `makeScheduleOwnerObjectClass` (`CloudflareScheduling.ts:671`), `makeSubscriptionPartitionObjectClass` (`CloudflareSubscriptions.ts:925`), and memory's `make` (`CloudflareMemory.ts:406`).
  - Thread endpoints are flat Effects with no typed failure (`ThreadObject.ts:1128-1140`), so Alchemy's error envelope does not apply to them.
  - `SubscriptionPartitionAlarmHandler` exposes effect-cf's `DurableObjectAlarmEvent` (`CloudflareSubscriptions.ts:78-83`).
  - `examples/shared-owner.ts:14,57` imports and provides `ThreadMaintenanceAlarm` for the application-owned path.
- `watchTextEncoded` returns a byte stream plus an `RpcTarget` lifetime (`internal/live-text.ts:24-35`). Because Alchemy passes non-Stream values to native RPC unchanged, workerd serializes that target natively. Whether its disposal reaches the object under Alchemy is checked on the deployed stage (A4).
- The durable-bench deployed tooling: `examples/durable-bench/deployed/stack.ts:68-110`, `deploy.ts:134-166` and `:552-599`, and `driver.ts:765-768` (the bearer-token gate).

---

## Planning Contract

Product Contract preservation: new plan (`ce-plan-bootstrap`). It replaces an earlier plan that added a second adapter beside effect-cf.

### Key Technical Decisions

- KTD1. **effect-cf gets a host-neutral instance core, and `DurableObject.make` becomes a thin class over it.** The core takes the native `DurableObjectState`, the env, a gate capability and the same options `make` takes today. It returns the built runtime and one Promise-returning function per RPC method, plus `alarm` and `fetch`. The class passes `ctx.blockConcurrencyWhile` as the gate. No behaviour of `make` changes. Rejected: a second runtime in the agent package, which duplicates effect-cf's runtime, stub cache and trace context.
- KTD2. **effect-cf adds `DurableObject.mount`, the hosted form of the same options.** It returns an Effect that builds the core with an "already gated" capability and runs `initialize` inline, because the host already holds `blockConcurrencyWhile` and a nested gate could deadlock. It yields a plain record whose own properties are Effect-returning methods. Each method:
  - runs the core function with an `AbortSignal` that fires on interruption (R10);
  - passes the calling fiber's current span as the parent when no effect-cf trace argument is present (R9).

  The record type is structural, an `Effect` plus a `Record<string, (...args: never[]) => Effect<unknown>>`, so it names no host (R6). The core keeps effect-cf's own flush through `state.waitUntil`. This needs an exporter in the object's Layer: `mount` takes the same application Layer `make` does, so the consumer supplies effect-cf's OTLP Layer there under either host, and A4 does so. Under Alchemy, Alchemy exports its call span and effect-cf exports its own spans, so no span is exported twice (AE6).
- KTD3. **effect-cf's alarm multiplexer gets a closed slot union: `Exclusive` or `Delegated`.** `Exclusive` keeps today's `getAlarm`, `setAlarm` and `deleteAlarm`. `Delegated` takes `{ schedule: (at) => Effect<void, SlotError>; cancel: Effect<void, SlotError> }`. Effects, not Promises, because public asynchronous operations return `Effect` (`CODING_STANDARDS.md` rule 1); the consumer provides any host services the Effects need. In that mode `readNativeAlarm` and `writeNativeAlarm` never touch storage alarms. The delegate is called after the SQL transaction commits. The multiplexer persists the deadline it last handed off. At the end of every event and in the init gate, it re-sends the earliest pending deadline when that differs from the handed-off one, which closes the window where a crash or failed call between commit and handoff would lose a wake. A spurious host wake runs nothing that is not due. `mount` requires the slot option with no default, so the choice is explicit. `Exclusive` is correct only when nothing else on the object schedules the slot. Under Alchemy, that means the consumer registers no Alchemy callback on that object, and the docs and example say so (R4). `make` keeps `Exclusive`. Governs R4, R5.
- KTD4. **The agent keeps effect-cf as its one substrate. Each domain exports its effect-cf options once and offers `make` (class) and `mount` (hosted) over them.** `ThreadObject.mount`, `ScheduleOwnerObject.mount`, `SubscriptionPartitionObject.mount` and `MemoryObject.mount` take the native state, the env, the slot option and an optional consumer extension. They return the effect-cf mount record. Their option types are library-owned, so an Alchemy consumer names no effect-cf type (R7). Governs R1, R2, R7.
- KTD5. **The consumer extension runs on the library's runtime.** `make` and `mount` accept `extend: { layer, rpc }`. The consumer Layer is merged into the object's runtime, and the consumer handlers join the library's flat method record. A name that collides with a library method is refused at the type level for literal keys and at construction otherwise. This replaces the application-owned `layerInHost` path, which needs effect-cf alarm types on a path that does not use effect-cf's class (Open Questions Q3). Governs R3, R8.
- KTD6. **Under Alchemy, the consumer writes the glue in their own stack.** The outer Effect resolves `Cloudflare.DurableObjectState`, `WorkerEnvironment` and, for `Delegated`, one `makeCallback` entry whose handler calls the mount's `alarm`. The inner Effect returns `ThreadObject.mount({ state: state.raw, env, slot })`, or spreads it beside Alchemy-runtime methods. No glue ships in a package (R6). The example workspace in A4 holds the canonical form. In `Exclusive` mode, the record includes `alarm`, and Alchemy calls it after its dispatcher returns early. In `Delegated` mode the record omits `alarm`, so the callback is the only entry. Governs R4, R6.
- KTD7. **Live text keeps `watchTextEncoded`.** Alchemy passes non-Stream values to native RPC unchanged (Sources), so the `RpcTarget` lifetime is serialized by workerd, not by Alchemy. A4 checks disposal on the deployed stage. If it fails, the existing `observePage` endpoint (`ThreadObject.ts:685`) is the fallback, and that change gets its own unit. This departs from an earlier design ruling that assumed the proxy breaks disposal (Open Questions Q7).
- KTD8. **Public types that leak effect-cf without need get library-owned replacements.** `SubscriptionPartitionAlarmHandler`'s event becomes a library type. A mounted object's own Alchemy callbacks need no consumer alarm registration type, because in `Delegated` mode consumer alarms are Alchemy callbacks. Governs R7.
- KTD9. **Under `Delegated`, Alchemy's retry policy never applies to library work.** The callback handler runs effect-cf's due entries, records each entry's own retry or park outcome in effect-cf's table, and always succeeds toward Alchemy. effect-cf's retry, park and repeat semantics are therefore the only ones that apply (R5). Governs R5.

### High-Level Technical Design

Layers after the change. Arrows point from importer to imported; nothing imports Alchemy except the example.

```mermaid
flowchart TB
  subgraph Example["examples/alchemy-host (consumer)"]
    STACK[Alchemy stack and DO declarations]
  end
  subgraph AgentCf["@systemfsoftware/agent-platform-cloudflare"]
    DOM[Domain options: Thread, schedule owner, subscription partition, memory]
    MK[make: classes]
    MT[mount: hosted records]
  end
  subgraph EffectCf["effect-cf fork"]
    CORE[Instance core]
    CLS[DurableObject.make]
    MNT[DurableObject.mount]
    ALM[Alarm multiplexer: Exclusive or Delegated slot]
  end
  CORE2["@systemfsoftware/agent (no Cloudflare)"]
  STACK --> MT
  STACK -.-> ALCH[alchemy]
  MK --> CLS
  MT --> MNT
  DOM --> CORE2
  CLS --> CORE
  MNT --> CORE
  CORE --> ALM
```

Delegated slot under Alchemy (AE2):

```mermaid
sequenceDiagram
  participant M as effect-cf multiplexer (Delegated)
  participant A as Alchemy callback dispatcher
  participant S as Alarm slot
  M->>M: commit library row due t1
  M->>A: schedule(t1) via the consumer's callback
  A->>S: reconcile to min(own rows) = t2
  S-->>A: alarm at t2
  A->>A: run consumer callback, reconcile to t1
  S-->>A: alarm at t1
  A->>M: callback handler calls mount.alarm
  M->>M: run due library entries
  M->>A: schedule(next) or cancel()
```

### Assumptions

These are unconfirmed bets. Each names what would overturn it.

- Alchemy never registers alarm callbacks or creates its alarm tables on its own for an object whose consumer does not use them. If it did, `Exclusive` mode would lose wakes under Alchemy. Evidence: the early return at `AlarmCallback.ts:402-417`. Overturned if a later Alchemy release adds built-in callbacks.
- Calling an Alchemy callback's `schedule` from a Promise captured over the Alchemy instance's context is valid after construction. Overturned if `schedule` requires a per-call Alchemy service.
- Two runtimes per object under Alchemy (Alchemy's own, effect-cf's mounted one) are acceptable in memory and start-up time. Overturned by the deployed check's cold-start numbers.

### Sequencing

E1 to E3 land in one effect-cf pull request, with its own suites proving `make` unchanged. E4 publishes the scoped release. A1 then switches the agent to it. A2 and A3 add mounts and remove the leaking paths. A4 deploys both hosts. A5 updates docs last, so no step leaves a half-moved export.

---

## Implementation Units

| U-ID | Repo      | Title                                      | Key files                                                                                             | Depends on       |
| ---- | --------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------- |
| E1   | effect-cf | Host-neutral instance core                 | `packages/effect-cf/src/internal/Instance.ts`, `src/DurableObject.ts`                                 | none             |
| E2   | effect-cf | Delegated alarm slot                       | `src/DurableObjectAlarm.ts`                                                                           | none             |
| E3   | effect-cf | `DurableObject.mount`                      | `src/DurableObject.ts`, `src/internal/Instance.ts`                                                    | E1, E2           |
| E4   | effect-cf | Scoped release                             | `packages/effect-cf/package.json`, `.changeset/`                                                      | E3, tooling port |
| A1   | agent     | Depend on the fork release                 | `packages/platform-cloudflare/package.json`, `pnpm-workspace.yaml`, imports                           | E4 published     |
| A2   | agent     | Domain mounts and consumer extension       | `src/ThreadObject.ts`, `CloudflareScheduling.ts`, `CloudflareSubscriptions.ts`, `CloudflareMemory.ts` | A1               |
| A3   | agent     | Remove leaking paths                       | `src/internal/layers.ts`, `src/CloudflareSubscriptions.ts`, `examples/shared-owner.ts`                | A2               |
| A4   | agent     | Alchemy and plain examples, deployed check | `examples/alchemy-host/`, `examples/durable-bench/deployed/`                                          | A2               |
| A5   | agent     | Docs and changeset                         | `docs/src/content/docs/`, `.changeset/`                                                               | A3, A4           |

Paths in E-units are in `systemfsoftware/effect-cf`. A-unit paths without a prefix are under `packages/platform-cloudflare/` in `systemfsoftware/agent`.

### PR 1: systemfsoftware/effect-cf

Waits on: nothing to start. E4's publish step waits on the tooling port being merged in the fork.

#### E1. Host-neutral instance core

- **Goal:** everything `DurableObject.make`'s class does lives in functions over a native state, an env and a gate capability (KTD1).
- **Requirements:** R2, R10.
- **Files:**
  - create `packages/effect-cf/src/internal/Instance.ts`;
  - modify `packages/effect-cf/src/DurableObject.ts` (the class delegates to the instance);
  - test: the existing `tests/DurableObject*.test.ts`, `tests/DurableObjectAlarm*.test.ts` and `tests/definitions.test.ts` suites.
- **Approach:**
  1. Move the constructor body (`:298-333`), `[RunSymbol]` (`:335-403`), `fetch` and `#runAlarm` (`:394-489`) into `makeInstance(options, host)`. `host` carries `state`, `env` and `gate: (run) => Promise<void>`.
  2. `RunSymbol` stays a class method that forwards to the instance, so existing consumers of `RunSymbol` (the agent's `test/worker.ts`) keep working.
  3. Each event run accepts an optional `AbortSignal` that interrupts its fiber.
- **Patterns to follow:** `internal/Runtime.ts` (already host-neutral).
- **Test scenarios:** the existing suites pass unchanged. No new test.
- **Verification:** the fork's CI check and test workflows pass. The real-system check is A4's deployed plain Worker, which runs `make` through the core.

#### E2. Delegated alarm slot

- **Goal:** the multiplexer can hand the physical slot to a host dispatcher (KTD3).
- **Requirements:** R4, R5.
- **Files:**
  - modify `packages/effect-cf/src/DurableObjectAlarm.ts` (a slot service read by `readNativeAlarm` and `writeNativeAlarm`; `Exclusive` default for `layer`);
  - test: `tests/DurableObjectAlarm.worker.test.ts`, `tests/durable-alarm.test-d.ts` (existing), plus the TEST-1 candidates T1, T2 and T4.
- **Approach:**
  1. `Slot = Exclusive | Delegated`, as a tagged union.
  2. In `Delegated` mode, `readNativeAlarm` returns the last deadline the multiplexer handed to the delegate. That value is persisted in the multiplexer's own table, so a consumed-timestamp check still works.
  3. `writeNativeAlarm` records the deadline, and an after-commit hook calls the delegate. A failed delegate call is retried on the next event and at init, never rolled back into the logical schedule.
  4. At every event end and in the init path, re-send `MIN(run_at)` when it differs from the persisted handed-off deadline.
- **Patterns to follow:** the existing "a failed platform setAlarm rolls back" contract (`:485`) for `Exclusive`, unchanged.
- **Test scenarios:** T1, T2 and T4 if admitted; otherwise the existing alarm suites are its proof.
- **Verification:** the fork's CI passes. The real-system check is A4's delegated-mode object, which loses no wake beside an Alchemy callback.

#### E3. `DurableObject.mount`

- **Goal:** the same options yield a host-built method record (KTD2).
- **Requirements:** R1, R3, R9, R10, R6.
- **Files:**
  - modify `packages/effect-cf/src/DurableObject.ts` (export `mount`), and `src/index.ts`;
  - modify `packages/effect-cf/README.md` and `docs/` (one section on hosted objects, with no host named in an API type);
  - test: T3 if admitted.
- **Approach:**
  1. `mount(layer, options)` returns `(host: { state; env; slot }) => Effect<Record>`. It builds the instance with a gate that runs its argument inline, then awaits `initialize`.
  2. Each RPC method becomes `(...args) => Effect.callback`, which aborts the instance run on interruption and passes the current span as the parent.
  3. `alarm` is included only when `slot` is `Exclusive`. A separate `runAlarms` Effect is always returned for a `Delegated` handler.
  4. `mount` refuses the reserved method names and a duplicate key.
- **Patterns to follow:** the `make` overloads (`:255-290`) for option typing.
- **Test scenarios:** T3 if admitted.
- **Verification:** the fork's CI passes. The real-system check is A4.

#### E4. Scoped release

- **Goal:** the agent can depend on a published fork.
- **Requirements:** R6.
- **Files:** modify `packages/effect-cf/package.json` (scoped name, version `0.60.0`), and add a changeset describing `mount`, the slot union and the instance core.
- **Approach:** release through the fork's `release.yml` after the tooling port lands. Keep the upstream MIT notice in `LICENSE`.
- **Test expectation:** none; the release workflow is the check.
- **Verification:** `npm view <scoped name>@0.60.0` resolves.

### PR 2: systemfsoftware/agent

Waits on: PR 1 merged and E4's release published to npm.

#### A1. Depend on the fork release

- **Goal:** every agent workspace resolves effect-cf from the fork.
- **Requirements:** R6, R7.
- **Files:** modify `pnpm-workspace.yaml` (catalog), `packages/platform-cloudflare/package.json` (peer and dev), the effect-cf-importing source files listed in Sources, and `examples/{shared,browser-speed,cold-start,sandbox,durable-bench,travel-planner}` and `tooling/{cloudflare-memory,context-continuity-eval}`.
- **Approach:** a mechanical import rename to the scoped name, with no behaviour change.
- **Test expectation:** none; typecheck and the existing suites in CI prove it.
- **Verification:** `pnpm typecheck` and `pnpm check:package-purity` pass, and `rg "from 'effect-cf'"` finds nothing.

#### A2. Domain mounts and consumer extension

- **Goal:** each of the four domains offers `make` and `mount` over one options value, with a consumer extension (KTD4, KTD5).
- **Requirements:** R1, R2, R3, R7.
- **Files:**
  - modify `src/ThreadObject.ts` (`make` at `:1264` and a new `mount`), `src/CloudflareScheduling.ts` (`:671`), `src/CloudflareSubscriptions.ts` (`:925`) and `src/CloudflareMemory.ts` (`:406`);
  - modify `package.json` `exports` if a new subpath is needed (it should not be: `mount` lives beside `make`);
  - test: the existing workerd suites through `test/worker.ts`, plus T5 if admitted.
- **Approach:**
  1. Extract each factory's effect-cf options into one internal function. `make` passes it to effect-cf `make`, and `mount` passes it to effect-cf `mount`.
  2. `mount`'s options are library types: `{ state: DurableObjectState; env; slot; extend? }`, using workers-types and library names only.
  3. `extend.layer` is merged into the application Layer. `extend.rpc` joins the method record after the collision check.
- **Patterns to follow:** today's `ThreadObject.make` options (`eventLayer`, `rpcTracing`).
- **Test scenarios:** AE4 through T5.
- **Verification:** the suites pass in CI. The real-system check is A4.

#### A3. Remove leaking paths

- **Goal:** no public path needs effect-cf types without running effect-cf's object (R7, R8).
- **Requirements:** R7, R8.
- **Files:**
  - delete `ThreadObject.layerInHost` and `layerHostConfig`, plus their sections in `src/internal/layers.ts`, if Q3 confirms;
  - delete `examples/shared-owner.ts`, or rewrite it over `extend`;
  - modify `test/publication.types.ts:28`, which calls `layerInHost`;
  - modify `src/CloudflareSubscriptions.ts:78-83` (library-owned alarm event type).
- **Approach:** delete with no alias. Every in-repository caller moves to `extend`.
- **Test expectation:** none; deletion is proven by typecheck and `rg`.
- **Verification:** `rg 'layerInHost|layerHostConfig'` finds nothing, and the emitted `.d.ts` for `CloudflareSubscriptions` names no effect-cf alarm type.

#### A4. Alchemy and plain examples, deployed check

- **Goal:** prove the Done-when on Cloudflare (R11).
- **Requirements:** R1, R2, R4, R9, R11, AE1 to AE6.
- **Files:**
  - create the workspace `examples/alchemy-host/`: an Alchemy stack with the four objects, one Thread object in `Delegated` mode with a consumer Alchemy callback, and the others in `Exclusive` mode;
  - create `examples/alchemy-host/plain/`: the same four classes through `make`;
  - modify `examples/durable-bench/deployed/` (a mode that deploys either stack, drives the AE scenarios and tears down), or create an equivalent driver following its pattern.
- **Approach:**
  1. Serve the Worker on `workers.dev` behind a secret, following durable-bench's bearer-token gate. Use compatibility date `2026-08-18` with `nodejs_compat`.
  2. The driver records, per object, every scheduled wake and whether it fired.
  3. It records a `watchTextEncoded` observation and its disposal, and a cross-call progress wait with any AsyncLocalStorage error.
  4. It counts exported spans per RPC through the tail consumer, with effect-cf's OTLP Layer configured on every object.
  5. It makes one library alarm entry fail twice in `Delegated` mode and records that it retries on effect-cf's schedule, not Alchemy's (R5, KTD9).
- **Test expectation:** none. The deployed report is the evidence, and the lead records it in the pull request.
- **Verification:** on a deployed stage of each stack, every wake fires, the delegated object's library wake fires after the consumer callback, live text closes when its stub is disposed, and the cleanup check finds nothing left.

#### A5. Docs and changeset

- **Goal:** the published docs show both hosts.
- **Requirements:** R8.
- **Files:** modify `docs/src/content/docs/platforms/cloudflare.mdx` and `storage/cloudflare.md` (replace "Use an existing Object" with `extend` and an Alchemy section), and add a `.changeset/` entry with a BEHAVIOR CHANGE note for the removed host path and the dependency rename.
- **Test expectation:** none.
- **Verification:** the docs build passes, and the page's Alchemy snippet matches `examples/alchemy-host`.

---

## Verification Contract

| Gate                    | Command                                                                                                  | Proves                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| effect-cf CI            | the fork's `ci.yml` and `check.yml` on the pull request                                                  | E1 to E3 keep `make` behaviour     |
| Agent types and surface | `pnpm typecheck`, `pnpm check:exports`, `pnpm check:package-purity`, `pnpm check:pack`                   | R6, R7, R8                         |
| Agent record format     | `pnpm check:record-format`                                                                               | no persisted record changed (R1)   |
| Targeted workerd files  | `pnpm --filter @systemfsoftware/agent-platform-cloudflare exec vitest run --project workerd test/<file>` | per-unit behaviour while iterating |
| Full suites             | CI only                                                                                                  | R2                                 |
| Deployed check          | A4 driver, run by the lead                                                                               | R1, R4, R9, R11                    |

### TEST-1 candidates

Each one is held for the lead's admission:

- T1 (effect-cf, workerd): in `Delegated` mode, scheduling three entries never calls `setAlarm`, `deleteAlarm` or `getAlarm`, and the delegate receives the earliest deadline after commit. Catches the multiplexer writing a slot a host owns, which loses that host's wakes.
- T2 (effect-cf, workerd): a delegate that throws once leaves the row committed, and the next init re-sends the deadline. Catches a wake lost between commit and handoff.
- T3 (effect-cf, workerd): a mounted instance under a fake host that already holds `blockConcurrencyWhile` runs `initialize` once before the first method and does not deadlock. An interrupted method stops its forked fiber. Catches a nested-gate deadlock and an orphaned fiber (R10).
- T4 (effect-cf, type-level `.test-d.ts`): `mount` without `slot` does not compile, and `Delegated` without a delegate does not compile. Catches a silent `Exclusive` beside a host dispatcher.
- T5 (agent, workerd): the existing suite runs against the four domains through `mount` in a minimal host class that mirrors Alchemy's dispatch (own-property Effect methods, already gated). Catches drift between `make` and `mount` (R1).
- T6 (agent, check): an import scan fails if any module under `packages/` imports `alchemy` or `@alchemy.run/*`. Catches an Alchemy dependency entering the library (R6). It follows OPS-5 if admitted.

## Definition of Done

- Each unit's Verification holds, and A4's deployed report for both stacks is in the agent pull request.
- No module in either published package imports Alchemy, and the Alchemy example imports no effect-cf module.
- Superseded paths are deleted with no alias, and no abandoned-attempt code remains.

---

## Open Questions

- Q1. What scoped npm name does the fork publish under? Does the agent keep it as a peer dependency, so that a consumer's own effect-cf objects share one copy, or as a regular dependency? Gates E4 and A1.
- Q2. Should `mount` require the slot choice (KTD3), or default to `Exclusive`? Exclusive is safe only while the consumer uses no Alchemy callback on that object. Gates E3.
- Q3. Should the application-owned Thread path (`layerInHost`, the documented "Use an existing Object") be deleted in favour of `extend` (KTD5)? It is a public, documented API. Gates A3.
- Q4. Are E1 to E3 offered upstream, or does the fork stay permanent? Gates nothing.
- Q5. KTD9 makes the effect-cf callback handler always succeed toward Alchemy, so that only effect-cf's retry policy applies. Is losing Alchemy's own park reporting for that entry acceptable? Gates nothing; KTD9 is the default.
- Q6. Is serving the deployed check on `workers.dev` behind a secret acceptable for a new example Worker, as it was for durable-bench? Gates A4's deployed run.
- Q7. Should live text keep `watchTextEncoded`, given that Alchemy passes the value to native RPC unchanged (KTD7), instead of an earlier ruling's cursor-paged reads? A4 settles the fact. Gates nothing before A4.
- Q8. Should a consumer's Alchemy-runtime methods share the object with a separate effect-cf runtime, or should `extend` be the only supported way to add methods under `mount`? Gates A2.
