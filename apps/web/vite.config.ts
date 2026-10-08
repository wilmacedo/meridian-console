import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, type Plugin } from 'vite'

// The ONNX runtime the wake word loads is 14 MB of wasm, about 4 MB compressed: the server sends the compressed copy
// (`preCompressed` in web-app.ts), which matters on mobile data.
const compressWasm = (): Plugin => ({
  name: 'compress-wasm',
  apply: 'build',
  closeBundle() {
    const dir = 'dist/assets'
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.wasm'))) {
      const bytes = readFileSync(join(dir, file))
      writeFileSync(join(dir, `${file}.br`), brotliCompressSync(bytes))
      writeFileSync(join(dir, `${file}.gz`), gzipSync(bytes, { level: 9 }))
    }
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), compressWasm()],
  // The wake word's worker loads the ONNX runtime, which an IIFE worker bundle cannot hold.
  worker: { format: 'es' },
  server: {
    // Loopback only, for the same reason as the API: its proxy reaches NOX. Other devices come in through
    // `tailscale serve`, which connects from this machine.
    host: '127.0.0.1',
    // The dev server is reached over HTTPS through `tailscale serve`, by a *.ts.net name.
    allowedHosts: ['.ts.net'],
    // Backend serves the built frontend in production (same origin), so this proxy only matters
    // for `pnpm dev:web` — it lets the app always use same-origin /api and WebSocket URLs.
    // Prod owns port 4000, so a dev server started with PORT=<n> is reached with MERIDIAN_API_PORT=<n>.
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.MERIDIAN_API_PORT ?? 4000}`,
        ws: true,
      },
    },
  },
})
