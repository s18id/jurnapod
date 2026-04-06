// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import '../../scripts/test/load-root-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
    alias: {
      '@jurnapod/modules-inventory': path.resolve(__dirname, '../modules/inventory/src/index.ts'),
      '@jurnapod/modules-inventory-costing': path.resolve(__dirname, '../modules/inventory-costing/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['__test__/**/*.test.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
  },
});
