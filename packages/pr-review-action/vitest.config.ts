import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    cache: false,
    silent: 'passed-only',
    testTimeout: 30_000,
  },
})
