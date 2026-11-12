import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// La app se sirve desde https://myappsserver.duckdns.org/esputi/
export default defineConfig({
  base: '/esputi/',
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    // En desarrollo, la mini-API de usuarios se pide al servidor real
    proxy: {
      '/esputi/api': { target: 'https://myappsserver.duckdns.org', changeOrigin: true },
    },
  },
})
