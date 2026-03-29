/**
 * Test environment configuration loader for token secrets
 * Loads from .env.test file
 */

import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.test (don't fail if missing)
config({ path: join(__dirname, '../../.env.test') });

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

export const testEnv = {
  tokens: {
    accessTokenSecret: getEnv('AUTH_TEST_ACCESS_TOKEN_SECRET', 'test-secret-32-chars-long-for-testing!!'),
    accessTokenTtlSeconds: getEnvInt('AUTH_TEST_ACCESS_TOKEN_TTL_SECONDS', 900),
    refreshTokenSecret: getEnv('AUTH_TEST_REFRESH_TOKEN_SECRET', 'refresh-secret-32-chars-long!!!'),
    refreshTokenTtlSeconds: getEnvInt('AUTH_TEST_REFRESH_TOKEN_TTL_SECONDS', 604800),
    issuer: getEnv('AUTH_TEST_ISSUER', ''),
    audience: getEnv('AUTH_TEST_AUDIENCE', ''),
  },
  password: {
    defaultAlgorithm: getEnv('AUTH_TEST_PASSWORD_ALGORITHM', 'argon2id') as 'bcrypt' | 'argon2id',
    bcryptRounds: getEnvInt('AUTH_TEST_BCRYPT_ROUNDS', 12),
    argon2MemoryKb: getEnvInt('AUTH_TEST_ARGON2_MEMORY_KB', 65536),
    argon2TimeCost: getEnvInt('AUTH_TEST_ARGON2_TIME_COST', 3),
    argon2Parallelism: getEnvInt('AUTH_TEST_ARGON2_PARALLELISM', 4),
    rehashOnLogin: true,
  },
  throttle: {
    baseDelayMs: getEnvInt('AUTH_TEST_THROTTLE_BASE_DELAY_MS', 1000),
    maxDelayMs: getEnvInt('AUTH_TEST_THROTTLE_MAX_DELAY_MS', 30000),
  },
  emailTokens: {
    passwordResetTtlMinutes: getEnvInt('AUTH_TEST_PASSWORD_RESET_TTL_MINUTES', 60),
    inviteTtlMinutes: getEnvInt('AUTH_TEST_INVITE_TTL_MINUTES', 1440),
    verifyEmailTtlMinutes: getEnvInt('AUTH_TEST_VERIFY_EMAIL_TTL_MINUTES', 60),
  },
};
