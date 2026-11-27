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
- **Open blockers:** none. Outstanding Questions marked Deferred to Planning are answered during planning.

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
- **Cross-call wake delivery inside one object incarnation stays as it is.** A local reproduction showed it correct under workerd with `nodejs_compat` (see Sources). Rejected for now: replacing in-memory wake hubs with storage-backed polling or alarm-driven wake-ups, which add storage operations and wake latency to fix a failure not reproduced. Governs R17.
- **The library offers both adapters even though a given consumer uses only one.** Governs R1.

### Requirements

**Host independence**

- R1. The package offers an effect-cf adapter and a plain Cloudflare Workers adapter as separate opt-in entrypoints; neither is the default, and a consumer picks one at its Worker composition root.
- R2. No module reachable from a host-independent entrypoint imports effect-cf, and effect-cf is at most an optional peer dependency.
- R3. Host-independent services take plain `DurableObjectState`, `DurableObjectStorage` and `Env` and express every host interaction (state, bindings, alarm scheduling, client transport) through ports a host adapter satisfies.
- R4. The Thread, scheduling owner, subscription partition and memory objects each work under both adapters with the same behaviour, persisted records and RPC wire values.
- R5. A host adapter only wires lifecycle: it constructs or joins the class, builds and caches the runtime once per object incarnation, maps the host's state and env into the shared services, routes lifecycle events to the shared handlers, and runs its host's end-of-event teardown. Domain state transitions, SQL and schemas live in shared code.
- R6. Combining parts of the two adapters in one object (for example the effect-cf alarm port with a plain-Workers shell) cannot type-check.
- R7. Superseded effect-cf-coupled entrypoints are deleted, with no aliases or compatibility re-exports.

**Lifecycle and composition**

- R8. Both adapters run the existing local-only initialization (schema migration and version check, configuration decode, ensure-alarm) inside `blockConcurrencyWhile` before any event is handled; recovery and any cross-object call stay outside the gate and run per event.
- R9. A consumer can place the library's RPC methods, alarm handling and initialization on one class beside their own methods, sharing one runtime, one SQLite database and one initialization gate. This holds both for a class the plain adapter builds and for a class a host such as Alchemy constructs from one built method shape.
- R10. Under either adapter, exactly one dispatcher reads or writes the object's physical alarm slot.
- R11. The plain adapter supports both slot arrangements: owning the slot itself while multiplexing every library alarm (Thread maintenance, scheduling, subscriptions and consumer registrations), and handing the slot to a host dispatcher that already owns it, so the host's reconcile never drops a library wake.
- R12. The effect-cf adapter keeps effect-cf's alarm multiplexer as the slot owner and the existing named alarm registration behaviour.

**Client and transport**

- R13. The Thread, scheduling, subscription and memory clients are split the same way: a host-independent client contract and one client implementation per adapter, so application code does not change when a deployment switches adapter.
- R14. Every value crossing a Durable Object boundary is encoded and decoded with the existing Effect Schemas under both adapters, and RPC trace context propagates under both.

**Telemetry**

- R15. Shared code emits telemetry only through Effect tracing, metrics and logging, and never builds an exporter or calls `waitUntil` to flush.
- R16. Each adapter makes recorded telemetry leave the object by the end of every event kind it handles (RPC, alarm, fetch, WebSocket), with no export interval, and a host that already flushes per event (such as Alchemy's bridge) gets no second flush.

**Fiber lifetime**

- R17. Every fiber the shared code forks runs in a Scope opened and closed within one event; nothing outlives the event that forked it. A fiber parked inside a still-open call may be resumed by another call of the same incarnation, which is how progress and settlement waits are woken today.

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
- Browser Run, code mode, AI Gateway and R2 tool-result storage, which do not import effect-cf, are out unless planning finds they reach effect-cf through a shared module.
- Replacing in-memory cross-call wake delivery is out (see Key Decisions); it returns only if the reproduction fails on a newer workerd or under a host adapter.

### Dependencies / Assumptions

- effect-cf `^0.59.0` is the effect-cf version the effect-cf adapter targets.
- Alchemy's workerd bridge behaviour cited here is read from its source at the time of writing: construction inside `blockConcurrencyWhile`, proxy or static dispatch over one built shape, per-event telemetry flush, and an alarm dispatcher that runs before the instance's own `alarm` and reconciles the slot to its own rows.
- The reproduction in Sources ran on local workerd through Miniflare, not on deployed Cloudflare.

### Outstanding Questions

**Deferred to Planning**

- How does the plain adapter hand alarm ownership to a host dispatcher? Settled by reading whether Alchemy exposes a callback registration the library can schedule into, or only a builder DSL, and choosing the hand-off that R11 needs.
- Do library method names need a namespace when they share a class with consumer methods (R9)? Settled by checking whether Alchemy's static dispatch accepts nested method objects or only flat properties.
- How do progress, settlement and live-text waits cross the plain Workers RPC boundary, including cancellation? Settled by measuring native Workers RPC `ReadableStream` and disposable-stub behaviour across Durable Object calls at the target compatibility date, and whether Alchemy's proxy forwards them intact.
- Do clients reach objects only through a `DurableObjectNamespace` binding, or also through service bindings across Workers? Settled by listing the binding types every client constructor accepts today.
- Why did an exporter loop parked on a Latch fail with the AsyncLocalStorage error when a parked `Deferred` waiter does not? Settled by reproducing that case beside the one in Sources; the answer bounds R17's allowed pattern.
- What does a long-held waiting RPC cost in Durable Object duration billing and hibernation eligibility, compared with a client-side poll? Settled by measuring a held wait's billed duration on a deployed object; it decides whether R17's wait pattern needs a time cap.

### Sources / Research

- `packages/platform-cloudflare/src/ThreadObject.ts`: `make` builds the class with effect-cf `DurableObject.make`, registers RPC and alarm only, and keeps recovery out of the constructor gate.
- `packages/platform-cloudflare/src/Alarm.ts`: per-Thread attempts and lanes fork into a Scope opened in one alarm event and closed before the final re-arm.
- `packages/platform-cloudflare/src/WakeScheduler.ts` and `src/internal/progress-wait.ts`: per-incarnation wake hubs and a waiter registry; a call waiting on progress is woken by another call's notify.
- Cross-call wake reproduction, Miniflare `5.20260811.1-alpha`, compatibility date `2025-05-01`, `nodejs_compat`, Effect `4.1.5`. One object holds a `Deferred`. Call A awaits it then reads storage; call B completes it. A second case forks the same wait from a call that has already returned. Output: `status 200 ["notified","woken","parked","notified",["detached resumed"]]`. No AsyncLocalStorage error appeared, and both waiters settled.
- `pnpm exec vitest run --project workerd test/progress-wait.test.ts` in `packages/platform-cloudflare`: 3 of 3 passed, including a wait woken by a later approval call after eviction, with no AsyncLocalStorage error in the output.
- Effect `4.1.5` `internal/effect.ts`: a fiber resumes inside a `node:async_hooks` `AsyncResource` captured when it parked.
- effect-cf `0.59.0` `DurableObject.ts`: flushes OTLP in `waitUntil` on RPC and alarm exit only, capped at 2 seconds with failures swallowed.
- Alchemy `packages/alchemy/src/Workers/DurableObjectBridge.ts`, `Workerd/DurableObjectBridge.ts`, `Workerd/AlarmCallback.ts` and `Workerd/DurableObjectAlarmStorage.ts`: the bridge facts in Dependencies / Assumptions, and `reconcileDurableObjectAlarm` setting the slot to the earliest of its own tables or deleting it.
