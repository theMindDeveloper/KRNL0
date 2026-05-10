import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@brain': resolve(__dirname, 'src/brain'),
      '@voice': resolve(__dirname, 'src/voice'),
      // Stub browser-only xterm packages so Node-environment tests can import
      // components that depend on them (e.g. TerminalNode via nodeRegistry).
      '@xterm/xterm': resolve(__dirname, 'tests/__mocks__/@xterm/xterm.ts'),
      '@xterm/addon-fit': resolve(__dirname, 'tests/__mocks__/@xterm/addon-fit.ts'),
      '@xterm/xterm/css/xterm.css': resolve(__dirname, 'tests/__mocks__/@xterm/xterm.css.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
