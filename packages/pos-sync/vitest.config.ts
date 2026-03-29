// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { defineConfig } from 'vitest/config';
import path from 'path';
import { config } from 'dotenv';

// Load .env file
const envPath = path.resolve(process.cwd(), '.env');
config({ path: envPath });

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
  },
});
