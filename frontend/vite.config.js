import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/fetch': 'http://localhost:3001',
      '/analyze': 'http://localhost:3001',
      '/chat': 'http://localhost:3001',
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
