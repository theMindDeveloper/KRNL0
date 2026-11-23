import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../../../vitest.config';
export default mergeConfig(base, defineConfig({ root: '/home/user/KRNL0', test: { include: ['marketing/posts/09-every-button-a-command/.capture/run.test.ts'] } }));
