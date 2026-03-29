/**
 * Database test configuration loader
 * Priority: .env.test.db.local > .env.test.db > hardcoded defaults
 */

import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load base config first
config({ path: join(__dirname, '../../.env.test.db') });
// Local overrides (if exists)
config({ path: join(__dirname, '../../.env.test.db.local') });

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

export const dbConfig = {
  useRealDb: process.env.AUTH_TEST_USE_DB === '1',
  host: getEnv('AUTH_TEST_DB_HOST', 'localhost'),
  port: getEnvInt('AUTH_TEST_DB_PORT', 3306),
  user: getEnv('AUTH_TEST_DB_USER', 'root'),
  password: getEnv('AUTH_TEST_DB_PASSWORD', ''),
  database: getEnv('AUTH_TEST_DB_DATABASE', 'jurnapod_test'),
  connectionLimit: getEnvInt('AUTH_TEST_DB_CONNECTION_LIMIT', 5),
};

export const useRealDb = dbConfig.useRealDb;

// Validation helper
export function validateDbConfig(): void {
  if (useRealDb) {
    console.log('[Auth Tests] Using REAL database for integration tests');
    console.log(`[Auth Tests] Database: ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`);
  } else {
    console.log('[Auth Tests] Using MOCK adapter (set AUTH_TEST_USE_DB=1 for real DB)');
  }
}
