import cloudflare from '@alchemy.run/cloudflare-runtime/vite'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/travel/',
  plugins: (() =>
    process.env.VITEST
      ? [react()]
      : [
        process.env.ALCHEMY_CLOUDFLARE_VITE_INJECTED === '1'
          ? null
          : cloudflare({
            main: 'src/worker.ts',
            compatibilityDate: '2026-07-01',
            compatibilityFlags: ['nodejs_compat'],
          }),
        tanstackStart({ router: { basepath: '/' } }),
        tailwindcss(),
        react(),
      ])(),
  test: {
    cache: false,
    silent: 'passed-only',
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          // Bundle this entry so unused effect-cf native exports are removed in Node tests.
          include: ['@systemfsoftware/agent-platform-cloudflare/cloudflare-bindings'],
          exclude: ['effect', '@systemfsoftware/agent'],
          rolldownOptions: { external: [/^cloudflare:/] },
        },
      },
    },
  },
})
