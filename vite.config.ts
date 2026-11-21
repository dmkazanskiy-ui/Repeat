import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  // Локально: npm run dev + python3 deploy/sync/server.py → /api уходит на сервер синка.
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
})
