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
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
