import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    cache: false,
    silent: 'passed-only',
    maxWorkers: 1,
  },
})
