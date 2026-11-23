# Coding Standards

Review criteria for every change in this repository. They add to the organization's
`repos/constitution/CODING_STANDARDS.md` (included by `REVIEW.md`) and take local precedence,
except that they cannot loosen anything `REVIEW.md` rates P0. This file holds what the shared
standards do not say and nothing that CI already enforces.

## Non-negotiable architecture rules

1. Public asynchronous operations return `Effect` or `Stream`, not naked `Promise` values.
2. Expected failures remain typed in `E`; dependency requirements remain visible in `R`.
3. Effect `Schema` is the canonical source for persisted, transported, tool, and structured model
   values.
4. Every acquired resource belongs to `Scope`. The engine must not create daemon fibers.
5. Use the pinned Effect v4 AI primitives directly. Do not introduce framework-owned copies of
   Effect AI `Tool`, `Toolkit`, `LanguageModel`, `Prompt`, `Response`, or `Model`.
6. Provider SDK values never become canonical thread records. Effect AI values may be used
   by the interpreter, but durable records remain explicit, versioned Schemas.
7. The canonical log is append-only and owns conversation content, operation evidence and terminal
   outcomes. An unfinished Run's versioned checkpoint is authoritative operational state, committed
   atomically with its new history under the single owner's mutation gate and revision check. Delete
   it at canonical settlement; unresolved operations and handoffs retain their own rows. Projections and lookup indexes
   remain disposable. `verify` checks retained history and active checkpoints, including original
   context consistency through `historyDigest`; it does not attest discarded intermediate
   checkpoint revisions or provide tamper evidence. Storage validates schema, version, identity,
   sequence and atomic commit boundaries without a hash chain or per-record integrity digests.
8. No code may claim exactly-once external side-effect execution.
9. An unresolved ordinary tool call is never automatically replayed after ownership loss.
   One process owns a Thread at a time on every backend. Local owner generations reject late
   results; distributed claims, ownership leases and multi-worker PostgreSQL are out of scope.
10. Tool/model/subagent concurrency is bounded and deterministic at commit time. Tool batches use
    Effect structured concurrency and Semaphore permits rather than a separate Promise scheduler.
11. Security decisions are fail-closed. Model output is untrusted input.
12. Node platform assumptions must not enter core domain modules.

## Package dependency direction

```text
@yielded/agent <- storage-sql <- storage-sqlite
@yielded/agent + selected adapters <- platform-node
```

Within `packages/effect-agent/src`, dependencies point inward:
`core <- engine <- capabilities <- durable` and `core <- sandbox <- capabilities`.
Public module paths address these implementations directly; source directories are not separate
packages. Keep core and sandbox contracts platform-neutral. `pnpm check:exports` enforces these
internal boundaries as well as package imports.

An inward package must not import an outward package. If a feature appears to require that, define
or deepen an inward port and implement an outward adapter.

Framework code lives only in `packages/*`; do not create an `apps/` workspace. Create a new framework
package only for a genuinely new framework concern agreed with the repository owner. Provider
integrations remain upstream Effect AI Layers, not framework provider packages.

## Change discipline

- This library is a v0 beta. Prefer simpler machinery and measured performance gains over
  compatibility with superseded APIs or storage formats.
- Add or update Effect Schema definitions before implementing new wire or persisted values.
- Keep ordinary changes lean and scoped to the requested outcome. Load `.agents/skills/simplify/SKILL.md` when the user explicitly asks for simplification; do not automatically run a broad simplify pass. Public APIs and persisted formats may change to simplify the architecture or meet the task's requirements. Do not preserve obsolete paths or add compatibility layers unless the user explicitly requires compatibility. The architecture and durability rules above still apply.
- Update existing guides or API comments when a change affects their documented behavior.
- Explain rejected alternatives in the pull request when a future agent could reasonably
  re-propose them.
- Do not silently widen errors to `unknown`, `Error`, or `any`.
- Do not use type assertions to cross a schema boundary.
- Change canonical history through export → re-encode → import, never through in-place payload
  rewrites. Export only idle Threads and keep the source quiescent until the archive is complete.
  Current Run state and operation state carry explicit versions. Storage-layout steps remain
  adapter-owned, ordered, and atomic.
  Refuse formats and layouts newer than the running code before mutation.
- Write changesets as one or two imperative sentences naming the consumer-visible change. Add only
  a short usage example or an explicit BEHAVIOR CHANGE note when consumers must act; keep IDs,
  root-cause, review and test stories, and implementation mechanics in the pull request.
