import * as Alchemy from 'alchemy'
import * as Cloudflare from '@alchemy.run/cloudflare'
import { Config, Effect, Layer } from 'effect'

// Deploys run against the account-wide Cloudflare state store so CI runs
// share one state history; ALCHEMY_LOCAL_STATE=true keeps dry runs and local
// experiments out of it. Alchemy's `state` option requires an infallible
// Layer (`Layer<State, never, StackServices>`), so a malformed flag cannot
// stay typed past this boundary: it fails closed as a defect that names the
// flag and the accepted values instead of silently picking a state store.
const state = Layer.unwrap(
  Effect.gen(function*() {
    const useLocalState = yield* Config.Boolean('ALCHEMY_LOCAL_STATE').pipe(
      Config.withDefault(false),
    )

    return useLocalState ? Alchemy.localState() : Cloudflare.state()
  }).pipe(
    Effect.mapError(
      (error) =>
        new Error(
          `ALCHEMY_LOCAL_STATE must be a boolean (true/false); refusing to guess a state store: ${String(error)}`,
        ),
    ),
    Effect.orDie,
  ),
)

const docsAssets = {
  base: '/agent/',
  notFoundHandling: '404-page',
} satisfies Omit<Cloudflare.Workers.AssetsProps, 'directory'>

const stack = Effect.gen(function*() {
  // This repository has no approved documentation domain or Cloudflare zone, and the domain this
  // stack was written for belongs to another project. Both are required configuration: without
  // them the entrypoint fails before it defines any resource.
  const domain = yield* Config.NonEmptyString('DOCS_DOMAIN')
  const zone = yield* Config.NonEmptyString('DOCS_ZONE')

  yield* Cloudflare.Website.StaticSite('Docs', {
    name: 'agent-docs',
    command: 'pnpm run docs:build',
    outdir: 'docs/dist',
    domain: { name: domain, zoneName: zone },
    workersDev: false,
    dev: { command: 'pnpm run docs:dev' },
    // Astro emits directory indexes and 404.html. HTML handling keeps the
    // /agent prefix. The Worker runs first so it can redirect the site root
    // onto /agent/ and serve the not-found document with status 404.
    main: './docs/worker.ts',
    assets: {
      ...docsAssets,
      runWorkerFirst: true,
    },
    // The dist and cache directories are gitignored, so hashing docs/**
    // rebuilds exactly when a source page or the site config changes;
    // package.json is included because it owns the docs:build script.
    memo: { include: ['docs/**', 'package.json'], lockfile: true },
  })

  return { url: `https://${domain}/agent/` }
})

export default Alchemy.Stack('agent-docs', { providers: Cloudflare.providers(), state }, stack)
