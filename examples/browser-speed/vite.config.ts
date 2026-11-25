import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Files keep the example prefix inside dist so Workers
// static assets match request paths directly.
export default defineConfig({
  base: '/browser-use/',
  build: { outDir: 'dist/browser-use', emptyOutDir: true },
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5191,
    strictPort: true,
    proxy: {
      '/browser-use/api': {
        target: 'http://127.0.0.1:8791',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (outgoing, incoming) => {
            if (incoming.headers.origin === 'http://127.0.0.1:5191') {
              outgoing.setHeader('origin', 'http://127.0.0.1:8791')
            }
          })
        },
      },
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    cache: false,
    silent: 'passed-only',
    maxWorkers: 1,
  },
})
