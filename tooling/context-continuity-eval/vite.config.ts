import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    cache: false,
    silent: 'passed-only',
    maxWorkers: 1,
  },
})
