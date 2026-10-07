import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    // The dev server is reached over HTTPS through `tailscale serve` (docs/https.md), by a *.ts.net name.
    allowedHosts: ['.ts.net'],
    // Backend serves the built frontend in production (same origin), so this proxy only matters
    // for `pnpm dev:web` — it lets the app always use same-origin /api and WebSocket URLs.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        ws: true,
      },
    },
  },
})
