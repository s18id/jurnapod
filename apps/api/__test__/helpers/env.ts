// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Test Environment Setup
 * 
 * This module provides utilities for setting up the test environment.
 * Environment loading happens via vitest.config.ts which imports
 * '../../scripts/test/load-root-env.mjs'.
 */

/**
 * Get the test API base URL
 * Uses JP_TEST_BASE_URL env var if set, otherwise uses default test port
 */
export function getTestBaseUrl(): string {
  return process.env.JP_TEST_BASE_URL ?? 'http://127.0.0.1:3002';
}

/**
 * Get test server port
 * Uses JP_TEST_PORT env var if set, otherwise uses default 0 (OS assigns random available port)
 */
export function getTestPort(): number {
  const port = process.env.JP_TEST_PORT;
  return port ? Number(port) : 0; // 0 means OS assigns random available port
}
