// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { defineConfig } from 'vitest/config';
import path from 'node:path';
import '../../scripts/test/load-root-env.mjs';

export default defineConfig({
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
    alias: {
      '@/lib': path.resolve(__dirname, 'src/lib'),
      '@/services': path.resolve(__dirname, 'src/services'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['__test__/**/*.test.ts'],
    testTimeout: 180000,
    hookTimeout: 60000,
    teardownTimeout: 30000,
  },
});
