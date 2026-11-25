# Repository toolchain

Use pnpm for dependencies and the repository scripts for everything else. Versions
live in the root [package.json](../package.json) and the
[workspace catalog](../pnpm-workspace.yaml).

| Command              | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `pnpm install`       | Install dependencies                                |
| `pnpm format`        | Format files with dprint                            |
| `pnpm format:check`  | Check formatting                                    |
| `pnpm lint`          | Lint with Oxlint and tsc-Aware rules                |
| `pnpm typecheck`     | Check types and Effect diagnostics with effect-tsgo |
| `pnpm test`          | Run all workspace tests                             |
| `pnpm build`         | Build packages, the docs site, and the Action       |
| `pnpm check:exports` | Verify package exports and internal boundaries      |
| `pnpm check:pack`    | Pack every public package and inspect the tarball   |

Run a single workspace script with `pnpm --filter <package> <script>`, for example
`pnpm --filter @systemfsoftware/agent test`.

Typechecking uses `effect-tsgo` for the Effect diagnostics and plain `tsrs` for the
documentation project. Effect warnings remain visible but do not fail checks;
TypeScript and configured Effect errors do.
`@effect/tsgo` also provides the editor language service and tsconfig schema;
Oxlint handles linting.

## Postgres tests

The Postgres suites need no server and no Docker daemon. Each suite boots Postgres
and [IntegreSQL](https://github.com/allaboutapps/integresql) inside a microVM, which
needs the host's KVM device (`/dev/kvm` on Linux) and checks a database out of
IntegreSQL for every case. The layer is pinned by digest and cached under
`~/.cache/agent/integresql-layers`.

Set `EFFECT_AGENT_TEST_POSTGRES_URL` to point the same suites at a server you run
yourself; they then create and drop their own databases on it instead.

## Live credentials

Live evaluations use provider keys from the environment. If your shell has an
Infisical machine identity, load the project's `dev` environment with it:

```sh
export INFISICAL_TOKEN="$(infisical login --method=universal-auth --silent --plain)"
infisical run --projectId="$(jq -r .workspaceId .infisical.json)" --env=dev -- <command>
```

The [hosted checkout proof](../tooling/browser-run-worker-proof/README.md#run)
also needs Cloudflare credentials.
