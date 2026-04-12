// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { defineConfig } from 'vitest/config';
import path from 'node:path';
import fs from 'node:fs';
// Load root .env with package-level override support
// This script runs on import and sets up process.env
import '../../scripts/test/load-root-env.mjs';

// Ensure logs directory exists
const logsDir = path.resolve(__dirname, "../../test-logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export default defineConfig({
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@/lib": path.resolve(__dirname, "src/lib"),
      "@/services": path.resolve(__dirname, "src/services"),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['__test__/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    // Use threads pool — max 2 workers prevents memory exhaustion
    pool: 'threads',
    maxWorkers: 4,
    minWorkers: 1,
    // forceExit kills workers after tests — prevents zombie processes
    forceExit: true,
    // Output JSON results to file for CI/CD
    outputFile: {
      json: path.resolve(logsDir, 'test-results.json'),
    },
  },
});
