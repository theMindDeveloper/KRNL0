// Browser-only preview config for the KRNL0 renderer.
// Lets us serve src/renderer/index.html in a regular browser (no Electron)
// for visual review of station mode in Claude Code preview tools.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@brain': resolve(__dirname, 'src/brain'),
      '@voice': resolve(__dirname, 'src/voice'),
    },
  },
  plugins: [react()],
  server: {
    port: 5201,
    strictPort: true,
  },
});
