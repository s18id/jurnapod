// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { defineConfig } from 'vitest/config';
import '../../scripts/test/load-root-env.mjs';

export default defineConfig({
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['__test__/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    pool: 'threads',
    maxWorkers: 1,
    minWorkers: 1,
    poolOptions: {
      threads: { singleThread: true },
    },
    forceExit: true,
  },
});
