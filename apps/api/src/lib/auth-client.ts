// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Singleton auth client for API.
 * 
 * Creates and exports a single AuthClient instance that wraps
 * the @jurnapod/auth package with API-specific configuration.
 */

import { createAuthAdapter } from './auth-adapter.js';
import { getAppEnv } from './env.js';
import type { AuthConfig, AuthClient } from '@jurnapod/auth';
import { createAuthClient } from '@jurnapod/auth';

let authClientInstance: AuthClient | null = null;

/**
 * Map AppEnv to AuthConfig for the @jurnapod/auth package.
 */
function buildAuthConfig(): AuthConfig {
  const env = getAppEnv();

  const config: AuthConfig = {
    tokens: {
      accessTokenSecret: env.auth.accessTokenSecret,
      accessTokenTtlSeconds: env.auth.accessTokenTtlSeconds,
      refreshTokenSecret: env.auth.refreshTokenSecret,
      refreshTokenTtlSeconds: env.auth.refreshTokenTtlSeconds,
      issuer: env.auth.issuer ?? undefined,
      audience: env.auth.audience ?? undefined,
      refreshCookieCrossSite: env.auth.refreshCookieCrossSite,
    },
    password: {
      defaultAlgorithm: env.auth.password.defaultAlgorithm,
      bcryptRounds: env.auth.password.bcryptRounds,
      argon2MemoryKb: env.auth.password.argon2MemoryKb,
      argon2TimeCost: env.auth.password.argon2TimeCost,
      argon2Parallelism: env.auth.password.argon2Parallelism,
      rehashOnLogin: env.auth.password.rehashOnLogin,
    },
    throttle: {
      baseDelayMs: env.auth.loginThrottle.baseDelayMs,
      maxDelayMs: env.auth.loginThrottle.maxDelayMs,
    },
  };

  // Add OAuth config if Google OAuth is configured
  if (env.googleOAuth.clientId && env.googleOAuth.clientSecret) {
    config.oauth = {
      google: {
        clientId: env.googleOAuth.clientId,
        clientSecret: env.googleOAuth.clientSecret,
        redirectUris: env.googleOAuth.redirectUris,
      },
    };
  }

  // Add email token config if email is enabled
  if (env.email?.tokenTtl) {
    config.emailTokens = {
      passwordResetTtlMinutes: env.email.tokenTtl.passwordResetMinutes,
      inviteTtlMinutes: env.email.tokenTtl.inviteMinutes,
      verifyEmailTtlMinutes: env.email.tokenTtl.verifyEmailMinutes,
    };
  }

  return config;
}

/**
 * Get or create the singleton AuthClient instance.
 */
export function getAuthClient(): AuthClient {
  if (authClientInstance) {
    return authClientInstance;
  }

  const adapter = createAuthAdapter();
  const config = buildAuthConfig();
  authClientInstance = createAuthClient(adapter, config);

  return authClientInstance;
}

/**
 * Export the auth client singleton for use throughout the API.
 */
export const authClient = getAuthClient();
