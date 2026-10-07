import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    // Loopback only, for the same reason as the API: its proxy reaches NOX. Other devices come in through
    // `tailscale serve`, which connects from this machine.
    host: '127.0.0.1',
    // The dev server is reached over HTTPS through `tailscale serve` (docs/https.md), by a *.ts.net name.
    allowedHosts: ['.ts.net'],
    // Backend serves the built frontend in production (same origin), so this proxy only matters
    // for `pnpm dev:web` — it lets the app always use same-origin /api and WebSocket URLs.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        ws: true,
      },
    },
  },
})
