import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
const R = '/home/user/KRNL0';
export default defineConfig({
  root: R,
  resolve: { alias: {
    '@shared': resolve(R, 'src/shared'), '@brain': resolve(R, 'src/brain'), '@voice': resolve(R, 'src/voice'),
    '@xterm/xterm': resolve(R, 'tests/__mocks__/@xterm/xterm.ts'), '@xterm/addon-fit': resolve(R, 'tests/__mocks__/@xterm/addon-fit.ts'),
    '@xterm/xterm/css/xterm.css': resolve(R, 'tests/__mocks__/@xterm/xterm.css.ts'),
    '@xyflow/react': resolve(R, 'tests/__mocks__/@xyflow/react.tsx'), '@xyflow/react/dist/style.css': resolve(R, 'tests/__mocks__/@xterm/xterm.css.ts'),
  } },
  test: { include: ['marketing/posts/09-every-button-a-command/capture/run.test.ts'], environment: 'node', testTimeout: 60000 },
});
