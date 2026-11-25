import { cloudflareTest } from '@cloudflare/vitest-plugin'
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
    silent: 'passed-only',
    testTimeout: 30_000,
    projects: [
      {
        plugins: [
          cloudflareTest({
            main: './test/worker.ts',
            miniflare: {
              compatibilityDate: '2025-05-01',
              compatibilityFlags: ['nodejs_compat'],
              durableObjects: {
                THREADS: { className: 'ThreadStorageObject', useSQLite: true },
                SCHEDULES: { className: 'ScheduleStorageObject', useSQLite: true },
              },
            },
          }),
        ],
        test: { testTimeout: 30_000 },
      },
    ],
  },
})
