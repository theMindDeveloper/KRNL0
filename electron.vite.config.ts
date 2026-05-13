import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/preload.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@brain': resolve(__dirname, 'src/brain'),
        '@voice': resolve(__dirname, 'src/voice'),
      }
    },
    server: {
      // Per-worktree isolated port set by scripts/dev.mjs. Falls back to the
      // Vite default (5173) when running outside the isolation wrapper.
      // strictPort: true ensures Vite errors instead of silently falling back
      // to another port — which would cause Electron main to load the wrong
      // renderer bundle when two worktrees run simultaneously.
      port: process.env.KRNL0_DEV_PORT ? Number(process.env.KRNL0_DEV_PORT) : 5173,
      strictPort: true,
    },
    plugins: [react()]
  }
})
