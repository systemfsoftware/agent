# Coding Standards

Review criteria for every change in this repository. They add to the organization's
`repos/constitution/CODING_STANDARDS.md` (included by `REVIEW.md`) and take local precedence,
except that they cannot loosen anything `REVIEW.md` rates P0. This file holds rules that no CI check
fully enforces; each names what enforces it, or says that review does.

## Non-negotiable architecture rules

1. Public asynchronous operations return `Effect` or `Stream`, not naked `Promise` values.
   Enforced by review.
2. Expected failures remain typed in `E`; dependency requirements remain visible in `R`. `pnpm typecheck`
   (`effect-tsgo` `anyUnknownInErrorContext`) rejects `any` and `unknown` in either channel; review
   enforces the rest.
3. Effect `Schema` is the canonical source for persisted, transported, tool, and structured model
   values. Enforced by review; `pnpm check:record-format` pins the persisted record format.
4. Every acquired resource belongs to `Scope`. The engine must not create daemon fibers. Enforced by review.
5. Use the pinned Effect v4 AI primitives directly. Do not introduce framework-owned copies of
   Effect AI `Tool`, `Toolkit`, `LanguageModel`, `Prompt`, `Response`, or `Model`. Enforced by review.
6. Provider SDK values never become canonical thread records. Effect AI values may be used
   by the interpreter, but durable records remain explicit, versioned Schemas. Enforced by review.
7. The canonical log is append-only and owns conversation content, operation evidence and terminal
   outcomes. An unfinished Run's versioned checkpoint is authoritative operational state, committed
   atomically with its new history under the single owner's mutation gate and revision check. Delete
   it at canonical settlement; unresolved operations and handoffs retain their own rows. Projections and lookup indexes
   remain disposable. `verify` checks retained history and active checkpoints, including original
   context consistency through `historyDigest`; it does not attest discarded intermediate
   checkpoint revisions or provide tamper evidence. Storage validates schema, version, identity,
   sequence and atomic commit boundaries without a hash chain or per-record integrity digests.
   Enforced by `packages/storage-sqlite/test/sqlite-ledger.test.ts` and the shared store conformance
   suites it runs; review enforces the rest.
8. No code may claim exactly-once external side-effect execution. Enforced by review.
9. An unresolved ordinary tool call is never automatically replayed after ownership loss.
   One process owns a Thread at a time on every backend. Local owner generations reject late
   results; distributed claims, ownership leases and multi-worker PostgreSQL are out of scope.
   Enforced by `packages/platform-node/test/crash/crash.test.ts` and the ledger tests above; review
   enforces the rest.
10. Tool/model/subagent concurrency is bounded and deterministic at commit time. Tool batches use
    Effect structured concurrency and Semaphore permits rather than a separate Promise scheduler.
    Enforced by `packages/effect-agent/test/engine/tool-broker.test.ts` and
    `packages/effect-agent/test/capabilities/subagent-reservation.test.ts`; review enforces the rest.
11. Security decisions are fail-closed. Model output is untrusted input. Enforced by review.
12. Node platform assumptions must not enter core domain modules. `pnpm check:exports` restricts core
    modules to relative framework imports and `effect`; `pnpm check:package-purity` bundles each
    published entrypoint for the neutral platform.

## Package dependency direction

```text
@yielded/agent <- storage-sql <- storage-sqlite
@yielded/agent + selected adapters <- platform-node
```

An inward package must not import an outward package. If a feature appears to require that, define
or deepen an inward port and implement an outward adapter. `pnpm check:exports` requires every
cross-package import to be a public export and a declared dependency; review enforces the direction
itself. The direction of the internal layers under `packages/effect-agent/src` is enforced by
`pnpm check:exports` and is not restated here.

Framework code lives only in `packages/*`; do not create an `apps/` workspace. Create a new framework
package only for a genuinely new framework concern agreed with the repository owner. Provider
integrations remain upstream Effect AI Layers, not framework provider packages. Enforced by review.

## Change discipline

- This library is a v0 beta. Prefer simpler machinery and measured performance gains over
  compatibility with superseded APIs or storage formats. Do not preserve obsolete paths or add
  compatibility layers unless the owner requires compatibility. Enforced by review.
- Add or update Effect Schema definitions before implementing new wire or persisted values. Enforced by review.
- Do not silently widen errors to `unknown`, `Error`, or `any`. `pnpm typecheck` rejects the error and
  requirements channels; review enforces the rest.
- Do not use type assertions to cross a schema boundary. Enforced by review.
- Change canonical history through export, re-encode and import, never through in-place payload
  rewrites. Export only idle Threads and keep the source quiescent until the archive is complete.
  Current Run state and operation state carry explicit versions. Storage-layout steps remain
  adapter-owned, ordered, and atomic. Refuse formats and layouts newer than the running code before
  mutation. Enforced by review; `pnpm check:record-format` fails a changed record format without a
  version bump.
- Write changesets as one or two imperative sentences naming the consumer-visible change. Add only
  a short usage example or an explicit BEHAVIOR CHANGE note when consumers must act; keep IDs,
  root-cause, review and test stories, and implementation mechanics in the pull request. Enforced by review.
- Explain rejected alternatives in the pull request when a future agent could reasonably
  re-propose them. Enforced by review.
