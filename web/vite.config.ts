import { defineConfig } from 'vite'

// The phone loads the app from http://<laptop-LAN-IP>:5173. Proxying /api to
// FastAPI keeps every API call same-origin, so no CORS setup is needed.
export default defineConfig({
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
