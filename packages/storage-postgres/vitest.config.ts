import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    cache: false,
    maxWorkers: 1,
    silent: 'passed-only',
    testTimeout: 60_000,
  },
})
