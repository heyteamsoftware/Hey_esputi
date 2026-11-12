import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Identificador de esta compilación: la app lo compara con version.json del servidor
// para avisar de que hay una versión nueva
const BUILD = Date.now().toString(36)

// La app se sirve desde https://myappsserver.duckdns.org/esputi/
export default defineConfig({
  base: '/esputi/',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [
    react(),
    {
      name: 'esputi-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) })
      },
    },
  ],
  server: {
    port: 5173,
    host: '127.0.0.1',
    // En desarrollo, la mini-API de usuarios se pide al servidor real
    proxy: {
      '/esputi/api': { target: 'https://myappsserver.duckdns.org', changeOrigin: true },
    },
  },
})
