import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/sandbox/',
  build: { outDir: 'dist/sandbox', emptyOutDir: true },
  plugins: [tailwindcss(), react()],
})
