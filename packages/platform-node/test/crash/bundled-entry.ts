import { buildSync } from 'esbuild'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const built = new Map<string, string>()

/**
 * Node cannot resolve the extensionless relative imports this repository uses, so a child process
 * that runs TypeScript source is spawned from an esbuild bundle of that source instead. Each entry
 * is bundled once per test process.
 */
export const bundledEntry = (entry: string): string => {
  const cached = built.get(entry)

  if (cached !== undefined) return cached

  // The bundle sits inside the package so its external imports still resolve through
  // the package's node_modules.
  const outdir = path.join(path.dirname(entry), '.entries')

  mkdirSync(outdir, { recursive: true })

  const outfile = path.join(outdir, `${path.basename(entry, '.ts')}.mjs`)

  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
    sourcemap: 'inline',
    // Effect ships as ESM and must stay a single instance; workspace sources are bundled so their
    // extensionless imports resolve.
    external: ['effect', 'effect/*', '@effect/*'],
  })

  built.set(entry, outfile)

  return outfile
}
