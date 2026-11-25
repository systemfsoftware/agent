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
    testTimeout: 120_000,
    projects: [
      {
        plugins: [
          cloudflareTest({
            main: './test/worker.ts',
            miniflare: {
              compatibilityDate: '2025-05-01',
              compatibilityFlags: ['nodejs_compat'],
              durableObjects: {
                THREADS: { className: 'TestThreadObject', useSQLite: true },
                PUBLICATIONS: { className: 'PublicationThreadObject', useSQLite: true },
                PROJECTIONS: { className: 'ProjectionThreadObject', useSQLite: true },
                MEMORIES: { className: 'TestMemoryObject', useSQLite: true },
                SCHEDULES: { className: 'TestScheduleOwnerObject', useSQLite: true },
                SUBSCRIPTIONS: { className: 'TestSubscriptionPartitionObject', useSQLite: true },
                SUBAGENTS: { className: 'SubagentThreadObject', useSQLite: true },
                TELEMETRY: { className: 'TelemetryThreadObject', useSQLite: true },
                CONTEXT_COMPACTOR: { className: 'ContextCompactorThreadObject', useSQLite: true },
              },
            },
          }),
        ],
        test: {
          name: 'workerd',
          include: ['test/**/*.test.ts'],
          exclude: [
            'test/restart/**',
            'test/code-mode/**',
            'test/interactive-browser-actions.test.ts',
            'test/interactive-browser-native.test.ts',
            'test/browser-credentials-native.test.ts',
          ],
          testTimeout: 120_000,
        },
      },
      {
        test: {
          name: 'browser-actions',
          include: [
            'test/interactive-browser-actions.test.ts',
            'test/interactive-browser-native.test.ts',
            'test/browser-credentials-native.test.ts',
          ],
          testTimeout: 120_000,
        },
      },
      {
        test: {
          name: 'code-mode',
          include: ['test/code-mode/**/*.test.ts'],
          testTimeout: 120_000,
        },
      },
      {
        test: {
          name: 'restart',
          include: ['test/restart/**/*.test.ts'],
          testTimeout: 120_000,
        },
      },
    ],
  },
})
