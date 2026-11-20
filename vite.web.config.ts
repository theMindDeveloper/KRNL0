// The KRNL0 web app (Decision 51): the same renderer as the desktop window, with
// window.krnl answered by the browser's own sync (src/web). Built into
// dist-web/, which the KRNL0 server serves to its logged-in owner.
//
//   npm run build:web            one build
//   npm run build:web -- --watch rebuild on change (point the server at dist-web)

import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const APP_VERSION = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')).version as string

export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  base: '/',
  publicDir: false,
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __KRNL_WEB__: 'true',
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@brain': resolve(__dirname, 'src/brain'),
      '@voice': resolve(__dirname, 'src/voice'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    // The server's CSP allows no inline script: keep every script a file.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
  },
  plugins: [react()],
})
