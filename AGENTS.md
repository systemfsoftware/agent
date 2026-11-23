# agent

Effect-native agents with durable Threads, published as four packages: `@yielded/agent`,
`@yielded/agent-storage-sql`, `@yielded/agent-storage-sqlite` and `@yielded/agent-platform-node`.
This repository is public: nothing private goes in files, commit messages, pull requests or comments.

## Commands

Work inside `nix develop` when the repository has a flake; until then Node 24 and pnpm 12.9.0 are enough.

```bash
pnpm install --ignore-scripts && pnpm run prepare
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm --filter <package> test
```

`package.json` owns what each script runs, so read it before you assume. `pnpm check:exports`,
`pnpm check:record-format`, `pnpm check:package-purity` and `pnpm check:pack` guard the published
surface. A pull request merges only through the Mergify queue, whose result on the merged tree is the
gate. Never pass `--no-verify`.

Use an Effect API only if it exists in the installed `node_modules/effect`, which the pnpm catalog pins.

## Routing

Load a doc when its trigger fires, not before.

| Load                                                                                                                                 | When                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `repos/constitution/CODING_STANDARDS.md`, `repos/constitution/REVIEW.md` and this repository's `CODING_STANDARDS.md` and `REVIEW.md` | you plan, write, review or propose a test                            |
| `repos/constitution/GRADERS.md`                                                                                                      | you build or change a check (a lint rule, CI job, hook or threshold) |
| `node_modules/effect/AGENTS.md`, then `.agents/skills/effect/SKILL.md`                                                               | you write Effect code                                                |
| `GLOSSARY.md`                                                                                                                        | you change a domain concept or public terminology                    |
| the READMEs and API comments of the packages in scope                                                                                | you change runtime, storage or platform code                         |
| the vendored sources declared in `subtrees.toml`                                                                                     | you use a library API you have not seen used in this tree            |

## Boundaries

| Surface                                                                                                          | Your limit                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Graders: the oxlint, dprint and commitlint configs, `oxlint.baseline.json`, `.github/workflows/`, `.mergify.yml` | Never change one to make your work pass; change the implementation. |
| Law: `CODING_STANDARDS.md`, `REVIEW.md`, this file                                                               | Change only when the task is to change the law.                     |
| Vendored: `repos/**`                                                                                             | Read only; update with `git subtree pull`.                          |
| Human-controlled: merging, deploys, credentials, repository settings                                             | Never do these yourself.                                            |
| Everything else                                                                                                  | Edit as the task needs.                                             |

Doppler is the only credential store. Never print a secret.

## End of session

Work on a branch. Never use `git stash`: set work aside by committing it on your own branch. One branch
carries one PR.
