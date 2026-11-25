import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
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
