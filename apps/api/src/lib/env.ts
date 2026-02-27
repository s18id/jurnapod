const DEFAULT_DB_PORT = 3306;
const DEFAULT_DB_CONNECTION_LIMIT = 10;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_LOGIN_THROTTLE_BASE_MS = 10000;
const DEFAULT_LOGIN_THROTTLE_MAX_MS = 300000;
const DEFAULT_REFRESH_COOKIE_CROSS_SITE = false;
const DEFAULT_PASSWORD_ALGO = "argon2id";
const DEFAULT_PASSWORD_REHASH_ON_LOGIN = true;
const DEFAULT_BCRYPT_ROUNDS = 12;
const DEFAULT_ARGON2_MEMORY_KB = 65536;
const DEFAULT_ARGON2_TIME_COST = 3;
const DEFAULT_ARGON2_PARALLELISM = 1;
const ENV_VALIDATION_PREFIX = "Invalid API environment configuration:";
const REPO_ROOT_ENV_AUTOLOAD_DISABLE_KEY = "JP_DISABLE_REPO_ROOT_ENV_AUTOLOAD";

export type PasswordHashAlgorithm = "argon2id" | "bcrypt";

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  key: string
) {
  if (value == null || value.length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return parsed;
}

function requiredEnv(value: string | undefined, key: string) {
  if (value == null || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function parseBooleanString(value: string | undefined, fallback: boolean, key: string) {
  if (value == null || value.length === 0) {
    return fallback;
  }

  const normalized = value.toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(`${key} must be \"true\" or \"false\"`);
}

function parseOptionalString(value: string | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseCsv(value: string | undefined): string[] {
  if (value == null || value.trim().length === 0) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parsePasswordHashAlgorithm(
  value: string | undefined,
  fallback: PasswordHashAlgorithm,
  key: string
): PasswordHashAlgorithm {
  if (value == null || value.length === 0) {
    return fallback;
  }

  if (value === "argon2id" || value === "bcrypt") {
    return value;
  }

  throw new Error(`${key} must be \"argon2id\" or \"bcrypt\"`);
}

function createEnvValidationError(cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : "unknown configuration error";
  return new Error(
    `${ENV_VALIDATION_PREFIX} ${message}. Set required variables in server env (for local dev, update repo-root .env).`
  );
}

export type AppEnv = {
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectionLimit: number;
  };
  auth: {
    accessTokenSecret: string;
    accessTokenTtlSeconds: number;
    refreshTokenSecret: string;
    refreshTokenTtlSeconds: number;
    issuer: string | null;
    audience: string | null;
    password: {
      defaultAlgorithm: PasswordHashAlgorithm;
      rehashOnLogin: boolean;
      bcryptRounds: number;
      argon2MemoryKb: number;
      argon2TimeCost: number;
      argon2Parallelism: number;
    };
    loginThrottle: {
      baseDelayMs: number;
      maxDelayMs: number;
    };
    refreshCookieCrossSite: boolean;
  };
  googleOAuth: {
    clientId: string | null;
    clientSecret: string | null;
    redirectUris: string[];
  };
};

let cachedEnv: AppEnv | null = null;
let cachedEnvError: Error | null = null;

function loadRepoRootEnv(): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (process.env[REPO_ROOT_ENV_AUTOLOAD_DISABLE_KEY] === "true") {
    return;
  }

  if (process.env.AUTH_JWT_ACCESS_SECRET) {
    return;
  }

  if (typeof process.loadEnvFile !== "function") {
    return;
  }

  const candidatePaths = [".env", "../.env", "../../.env"];

  for (const candidatePath of candidatePaths) {
    if (process.env.AUTH_JWT_ACCESS_SECRET) {
      return;
    }

    try {
      process.loadEnvFile(candidatePath);
    } catch {
      // Ignore missing/unreadable path and continue probing.
    }
  }
}

export function getAppEnv(): AppEnv {
  loadRepoRootEnv();

  if (cachedEnv) {
    return cachedEnv;
  }

  if (cachedEnvError) {
    throw cachedEnvError;
  }

  try {
    const dbPort = parsePositiveInt(process.env.DB_PORT, DEFAULT_DB_PORT, "DB_PORT");
    const dbConnectionLimit = parsePositiveInt(
      process.env.DB_CONNECTION_LIMIT,
      DEFAULT_DB_CONNECTION_LIMIT,
      "DB_CONNECTION_LIMIT"
    );
    const passwordDefaultAlgorithm = parsePasswordHashAlgorithm(
      process.env.AUTH_PASSWORD_ALGO_DEFAULT,
      DEFAULT_PASSWORD_ALGO,
      "AUTH_PASSWORD_ALGO_DEFAULT"
    );
    const passwordRehashOnLogin = parseBooleanString(
      process.env.AUTH_PASSWORD_REHASH_ON_LOGIN,
      DEFAULT_PASSWORD_REHASH_ON_LOGIN,
      "AUTH_PASSWORD_REHASH_ON_LOGIN"
    );
    const refreshTokenTtlSeconds = parsePositiveInt(
      process.env.AUTH_REFRESH_TTL_SECONDS,
      DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
      "AUTH_REFRESH_TTL_SECONDS"
    );
    const loginThrottleBaseMs = parsePositiveInt(
      process.env.AUTH_LOGIN_THROTTLE_BASE_MS,
      DEFAULT_LOGIN_THROTTLE_BASE_MS,
      "AUTH_LOGIN_THROTTLE_BASE_MS"
    );
    const loginThrottleMaxMs = parsePositiveInt(
      process.env.AUTH_LOGIN_THROTTLE_MAX_MS,
      DEFAULT_LOGIN_THROTTLE_MAX_MS,
      "AUTH_LOGIN_THROTTLE_MAX_MS"
    );
    const refreshCookieCrossSite = parseBooleanString(
      process.env.AUTH_REFRESH_COOKIE_CROSS_SITE,
      DEFAULT_REFRESH_COOKIE_CROSS_SITE,
      "AUTH_REFRESH_COOKIE_CROSS_SITE"
    );
    const bcryptRounds = parsePositiveInt(
      process.env.AUTH_BCRYPT_ROUNDS,
      DEFAULT_BCRYPT_ROUNDS,
      "AUTH_BCRYPT_ROUNDS"
    );
    const argon2MemoryKb = parsePositiveInt(
      process.env.AUTH_ARGON2_MEMORY_KB,
      DEFAULT_ARGON2_MEMORY_KB,
      "AUTH_ARGON2_MEMORY_KB"
    );
    const argon2TimeCost = parsePositiveInt(
      process.env.AUTH_ARGON2_TIME_COST,
      DEFAULT_ARGON2_TIME_COST,
      "AUTH_ARGON2_TIME_COST"
    );
    const argon2Parallelism = parsePositiveInt(
      process.env.AUTH_ARGON2_PARALLELISM,
      DEFAULT_ARGON2_PARALLELISM,
      "AUTH_ARGON2_PARALLELISM"
    );

    const issuer = process.env.AUTH_JWT_ISSUER;
    const audience = process.env.AUTH_JWT_AUDIENCE;

    const googleClientId = parseOptionalString(process.env.GOOGLE_OAUTH_CLIENT_ID);
    const googleClientSecret = parseOptionalString(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    const googleRedirectUris = parseCsv(process.env.GOOGLE_OAUTH_REDIRECT_URIS);

    if ((googleClientId && !googleClientSecret) || (!googleClientId && googleClientSecret)) {
      throw new Error(
        "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set together"
      );
    }

    if (googleClientId && googleRedirectUris.length === 0) {
      throw new Error("GOOGLE_OAUTH_REDIRECT_URIS is required when Google OAuth is enabled");
    }

    if (loginThrottleMaxMs < loginThrottleBaseMs) {
      throw new Error("AUTH_LOGIN_THROTTLE_MAX_MS must be >= AUTH_LOGIN_THROTTLE_BASE_MS");
    }

    cachedEnv = Object.freeze({
      db: {
        host: process.env.DB_HOST ?? "127.0.0.1",
        port: dbPort,
        user: process.env.DB_USER ?? "root",
        password: process.env.DB_PASSWORD ?? "",
        database: process.env.DB_NAME ?? "jurnapod",
        connectionLimit: dbConnectionLimit
      },
      auth: {
        accessTokenSecret: requiredEnv(
          process.env.AUTH_JWT_ACCESS_SECRET,
          "AUTH_JWT_ACCESS_SECRET"
        ),
        accessTokenTtlSeconds: parsePositiveInt(
          process.env.AUTH_JWT_ACCESS_TTL_SECONDS,
          DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
          "AUTH_JWT_ACCESS_TTL_SECONDS"
        ),
        refreshTokenSecret: requiredEnv(
          process.env.AUTH_REFRESH_SECRET,
          "AUTH_REFRESH_SECRET"
        ),
        refreshTokenTtlSeconds,
        issuer: issuer && issuer.length > 0 ? issuer : null,
        audience: audience && audience.length > 0 ? audience : null,
        password: {
          defaultAlgorithm: passwordDefaultAlgorithm,
          rehashOnLogin: passwordRehashOnLogin,
          bcryptRounds,
          argon2MemoryKb,
          argon2TimeCost,
          argon2Parallelism
        },
        loginThrottle: {
          baseDelayMs: loginThrottleBaseMs,
          maxDelayMs: loginThrottleMaxMs
        },
        refreshCookieCrossSite
      },
      googleOAuth: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        redirectUris: googleRedirectUris
      }
    });
  } catch (error) {
    cachedEnvError = createEnvValidationError(error);
    throw cachedEnvError;
  }

  return cachedEnv;
}

export function assertAppEnvReady(): void {
  getAppEnv();
}
