import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    cache: false,
    silent: 'passed-only',
    testTimeout: 60_000,
  },
})
