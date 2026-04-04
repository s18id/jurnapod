import { defineConfig } from 'vitest/config';
import '../../scripts/test/load-root-env.mjs';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
