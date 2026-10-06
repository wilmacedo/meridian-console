import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    // Backend serves the built frontend in production (same origin), so this proxy only matters
    // for `pnpm dev:web` — lets console-state.svelte.ts always use a same-origin WS URL.
    proxy: {
      '/api': 'http://localhost:4000',
      '/ws': {
        target: 'http://localhost:4000',
        ws: true,
      },
    },
  },
})
