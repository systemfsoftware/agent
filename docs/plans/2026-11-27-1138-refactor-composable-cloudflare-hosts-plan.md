---
title: Composable Cloudflare Hosts for the Durable Object Adapters - Plan
type: refactor
date: 2026-11-27
topic: composable-cloudflare-hosts
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Composable Cloudflare Hosts for the Durable Object Adapters - Plan

## Goal Capsule

- **Objective:** a Worker author can run this library's Durable Object Threads, scheduling, subscriptions and memory under the host their Worker already uses, either effect-cf or plain Cloudflare Workers (including classes an Alchemy bridge constructs), and install nothing for the host they do not use.
- **Means:** host-independent Durable Object services over plain `DurableObjectState` and `Env`, plus one thin, opt-in outer shell per host. No host is a default and no host is baked into the shared code.
- **Product authority:** this Product Contract, under the repository's `CODING_STANDARDS.md`. Design calls that repository law leaves open are recorded under Key Decisions with the alternative each rejects.
- **Open blockers:** none block planning. R18 gates the wake-transport choice inside planning: it is not yet known whether in-memory cross-call wake delivery is correct on deployed workerd, because local workerd does not reproduce a failure that was seen in deployment.

---

## Product Contract

### Summary

Split `@systemfsoftware/agent-platform-cloudflare` into host-independent Durable Object logic and two opt-in host adapters: one for effect-cf and one for plain Cloudflare Workers.
Every Durable Object class the package ships today (Thread, scheduling owner, subscription partition, memory) works under either host.
The client side is split the same way, and a consumer can put the library's methods and their own methods on one class.

### Problem Frame

Today `ThreadObject.make(applicationLayer, options)` returns a class built by effect-cf `DurableObject.make`.
effect-cf owns the class, the cached `ManagedRuntime`, native RPC method registration, per-event scopes and telemetry flushing.
The scheduling, subscription and memory objects are built the same way, and the alarm logic, clients and bindings call effect-cf directly: ten source files under `packages/platform-cloudflare/src` import it, and it is a required peer dependency.

A Worker whose Durable Object classes are constructed by another host cannot use these objects without also running effect-cf's class wrapper, runtime and alarm multiplexer.
Two hosts that each own the class, the runtime and the alarm slot cannot both own the same object.
Alchemy's workerd bridge is such a host. It builds the instance inside `blockConcurrencyWhile`, dispatches RPC through a proxy over one built method shape, flushes its per-instance telemetry at the end of every event, and runs its own alarm-callback dispatcher.
When its callbacks are in use, that dispatcher sets the single Durable Object alarm to its own earliest row or deletes it.

The platform-neutral core, `@systemfsoftware/agent`, already imports nothing from Cloudflare, so the coupling lives only in this adapter package.

### Key Decisions

- **Two adapters: effect-cf and plain Cloudflare Workers. Alchemy is a host the plain adapter composes into, not a third adapter or a dependency.** A plain-Workers adapter serves standalone Workers and Alchemy-built classes alike; an Alchemy adapter would couple the published library to Alchemy internals and leave standalone Workers unsupported. Governs R1, R2, R9.
- **The host seam sits outside the runtime, not inside it as an Effect Layer.** Both hosts are outer class or entrypoint wrappers that create the runtime, so the shared part is services and layers over plain `DurableObjectState` and `Env`, consumed by a thin outer shell. Rejected: passing a host Layer into `ThreadObject.make`. Governs R3, R5.
- **All four Durable Object domains move in this one restructure.** Leaving scheduling, subscriptions or memory on effect-cf keeps effect-cf mandatory for any consumer that uses them. Governs R1, R4.
- **Exactly one owner of the physical alarm slot per object.** Two multiplexers writing `setAlarm` in one object overwrite each other and silently drop wakes; the observed Alchemy reconcile does exactly that. Rejected: letting the library and the host each schedule the slot. Governs R10, R11.
- **In-memory cross-call wake delivery is a provisional baseline, not a settled choice.** Local workerd shows it working (see Sources), but local workerd also runs the case that failed in deployment without error, so local evidence cannot clear it. It stays unless the deployed probe in R18 fails; the event-scope rule in R17 holds either way. Governs R17, R18.
- **The library offers both adapters even though a given consumer uses only one.** Governs R1.

### Requirements

**Host independence**

- R1. The package offers an effect-cf adapter and a plain Cloudflare Workers adapter as separate opt-in entrypoints; neither is the default, and a consumer picks one at its Worker composition root.
- R2. No module reachable, directly or transitively, from the package root or the plain-Workers entrypoint imports effect-cf. This includes shared helpers used by Browser Run, code mode, AI Gateway and R2 tool-result storage. effect-cf is at most an optional peer dependency.
- R3. Host-independent services take plain `DurableObjectState`, `DurableObjectStorage` and `Env` and express every host interaction (state, bindings, alarm scheduling, client transport) through ports a host adapter satisfies.
- R4. The Thread, scheduling owner, subscription partition and memory objects each work under both adapters with the same behaviour, persisted records and RPC wire values.
- R5. A host adapter only wires lifecycle: it constructs or joins the class, builds and caches the runtime once per object incarnation, maps the host's state and env into the shared services, routes lifecycle events to the shared handlers, and runs its host's end-of-event teardown. Domain state transitions, SQL and schemas live in shared code.
- R6. Consumers compose only complete adapter shells and client layers; host ports are not exported for mixing, so one object cannot be built from parts of both adapters.
- R7. Superseded effect-cf-coupled entrypoints are deleted, with no aliases or compatibility re-exports.

**Lifecycle and composition**

- R8. Both adapters run the existing local-only initialization (schema migration and version check, configuration decode, ensure-alarm) inside `blockConcurrencyWhile` before any event is handled, followed by any consumer local-only initialization under the same rule; recovery and any cross-object call stay outside the gate and run per event.
- R9. A consumer can place the library's RPC methods, alarm handling and initialization on one class beside their own methods, sharing one runtime built from the library's and the consumer's Layers, one SQLite database and one initialization gate. This holds both for a class the plain adapter builds and for a class a host such as Alchemy constructs from one built method shape.
- R10. Under either adapter, exactly one dispatcher reads or writes the object's physical alarm slot.
- R11. The plain adapter supports both slot arrangements: owning the slot itself while multiplexing every library alarm (Thread maintenance, scheduling, subscriptions and consumer registrations), and handing the slot to a host dispatcher through one library alarm entry and a next-due time, so the library never writes a slot the host owns.
- R12. Both adapters accept consumer alarm registrations, run every due handler on an alarm, and re-arm for the earliest remaining deadline before the event ends, with today's retry, parked-delay and repeat semantics. The effect-cf adapter keeps effect-cf's alarm multiplexer as the slot owner.

**Client and transport**

- R13. The Thread, scheduling, subscription and memory clients are split the same way: a host-independent client contract and one client implementation per adapter, so application code does not change when a deployment switches adapter. Each adapter's clients accept the binding kinds today's clients accept.
- R14. Every value crossing a Durable Object boundary is encoded and decoded with the existing Effect Schemas under both adapters, and so is every chunk of a streamed or long-lived wait. RPC trace context propagates under both adapters. Interrupting a client wait cancels the wait inside the object.

**Telemetry**

- R15. Shared code emits telemetry only through Effect tracing, metrics and logging, and never builds an exporter or calls `waitUntil` to flush.
- R16. Each adapter makes recorded telemetry leave the object by the end of every event kind it routes, with no export interval. The plain adapter is told whether its host already flushes per event (as Alchemy's bridge does) and then adds no second flush.

**Fiber lifetime**

- R17. Every fiber the shared code forks runs in a Scope opened and closed within one event; nothing outlives the event that forked it. A fiber parked inside a still-open call may be resumed by another call of the same incarnation, which is how progress and settlement waits are woken today.
- R18. Before planning commits a wake transport, a probe on a deployed object at the target compatibility date with `nodejs_compat` records two things. First, whether a fiber parked on a `Deferred` or `Latch` and resumed by a later call raises the AsyncLocalStorage error when it touches storage, an AsyncLocalStorage-bound function or outbound `fetch`, once while the parking call is still open and once after it has returned or the client aborted. Second, the billed duration and hibernation state of an object holding a waiting call. If the error appears, or the held-wait cost is unacceptable, cross-call wakes move to a transport that does not resume fibers across calls.

### Acceptance Examples

- AE1. **Covers R2, R1.** Given a Worker that imports only the plain adapter, when it is type-checked and bundled with effect-cf absent from `node_modules`, then both succeed.
- AE2. **Covers R10, R11.** Given a class built by a host whose alarm dispatcher owns the slot, and library alarms due at t1 and a host callback due at t2 < t1, when the alarm fires at t2 and the host reconciles, then the library alarm still fires at t1.
- AE3. **Covers R10, R11.** Given the plain adapter owning the slot, when Thread maintenance, a schedule and a subscription register wakes at different times, then the slot holds the earliest and each fires.
- AE4. **Covers R8.** Given two Thread objects that each read the other during recovery, when both start cold at the same time, then neither blocks in its initialization gate and both recover on their first event.
- AE5. **Covers R9.** Given one class carrying the library's Thread methods and a consumer method `ping`, when a caller invokes both through one stub, then both answer and share one SQLite database.
- AE6. **Covers R17.** Given a call waiting on Thread progress, when a second call to the same object records progress, then the waiting call returns without an AsyncLocalStorage error.
- AE7. **Covers R16.** Given an object under Alchemy's bridge, when one RPC ends, then its spans are exported once.

### Scope Boundaries

- Choosing one host for the library, or making either adapter the default, is out.
- An Alchemy-specific adapter or a runtime dependency on Alchemy is out; Alchemy is a host the plain adapter composes into (R9, R11).
- The platform-neutral core `@systemfsoftware/agent` is unchanged except where a port it already defines must deepen.
- Browser Run, code mode, AI Gateway and R2 tool-result storage, which do not import effect-cf, change only as far as R2 requires.

### Dependencies / Assumptions

- effect-cf `^0.59.0` is the effect-cf version the effect-cf adapter targets.
- Alchemy's workerd bridge behaviour cited here is read from its source at the time of writing: construction inside `blockConcurrencyWhile`, proxy or static dispatch over one built shape, per-event telemetry flush, and an alarm dispatcher that runs before the instance's own `alarm` and reconciles the slot to its own rows.
- The reproductions in Sources ran on local workerd through Miniflare, not on deployed Cloudflare.
- The deployed probe in R18 runs without exposing a new public route, for example through a remote preview session.

### Outstanding Questions

**Deferred to Planning**

- How does Alchemy's dispatcher call the library alarm entry that R11 defines? Settled by reading whether Alchemy exposes a callback registration API or only a builder DSL.
- Do library method names need a namespace when they share a class with consumer methods (R9)? Settled by checking whether Alchemy's static dispatch accepts nested method objects or only flat properties.
- How do progress, settlement and live-text waits cross the plain Workers RPC boundary, including cancellation? Settled by measuring native Workers RPC `ReadableStream` and disposable-stub behaviour across Durable Object calls at the target compatibility date, and whether Alchemy's proxy forwards them intact.
- Which wake transport replaces cross-call fiber resumption if R18's probe fails: storage-backed polling, alarm-driven wakes, or a bounded client re-poll? Settled by R18's measurements, compared on storage operations per wait, wake latency, billed duration, hibernation, behaviour across eviction, and complexity.

### Sources / Research

- `packages/platform-cloudflare/src/ThreadObject.ts`: `make` builds the class with effect-cf `DurableObject.make`, registers RPC and alarm only, and keeps recovery out of the constructor gate.
- `packages/platform-cloudflare/src/Alarm.ts`: per-Thread attempts and lanes fork into a Scope opened in one alarm event and closed before the final re-arm.
- `packages/platform-cloudflare/src/WakeScheduler.ts` and `src/internal/progress-wait.ts`: per-incarnation wake hubs and a waiter registry; a call waiting on progress is woken by another call's notify.
- Cross-call wake reproduction, Miniflare `5.20260811.1-alpha`, compatibility date `2025-05-01`, `nodejs_compat`, Effect `4.1.5`. One object holds a `Deferred`. Call A awaits it then reads storage; call B completes it. A second case forks the same wait from a call that has already returned. Output: `status 200 ["notified","woken","parked","notified",["detached resumed"]]`. No AsyncLocalStorage error appeared, and both waiters settled.
- Extended local probe on the same runtime. A fiber parked on a `Deferred` or on a `Latch` was resumed by a later call, once while the parking call was still open and once after it had returned. Each resumed fiber then read storage, read `AsyncLocalStorage.getStore()`, and called a function bound with `AsyncLocalStorage.bind` in the parking call. All succeeded and the store still held the parking call's value. Outbound `fetch` to a closed port failed only with `Network connection lost.` Local workerd therefore did not reproduce the AsyncLocalStorage error reported in deployment for a resumed exporter loop.
- `pnpm exec vitest run --project workerd test/progress-wait.test.ts` in `packages/platform-cloudflare`: 3 of 3 passed, including a wait woken by a later approval call after eviction, with no AsyncLocalStorage error in the output.
- Effect `4.1.5` `internal/effect.ts`: a fiber resumes inside a `node:async_hooks` `AsyncResource` captured when it parked.
- effect-cf `0.59.0` `DurableObject.ts`: flushes OTLP in `waitUntil` on RPC and alarm exit only, capped at 2 seconds with failures swallowed.
- Alchemy `packages/alchemy/src/Workers/DurableObjectBridge.ts`, `Workerd/DurableObjectBridge.ts`, `Workerd/AlarmCallback.ts` and `Workerd/DurableObjectAlarmStorage.ts`: the bridge facts in Dependencies / Assumptions, and `reconcileDurableObjectAlarm` setting the slot to the earliest of its own tables or deleting it.
