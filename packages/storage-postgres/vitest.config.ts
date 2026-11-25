import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Vite replaces its defaults when conditions are set, so the defaults are listed back and the
  // workspace source condition is appended for both the client and SSR resolvers.
  resolve: { conditions: ['module', 'browser', 'development|production', '@systemfsoftware/source'] },
  ssr: {
    resolve: { conditions: ['module', 'node', 'development|production', '@systemfsoftware/source'] },
  },
  test: {
    cache: false,
    maxWorkers: 1,
    silent: 'passed-only',
    testTimeout: 60_000,
  },
})
