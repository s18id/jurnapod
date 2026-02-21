const DEFAULT_DB_PORT = 3306;
const DEFAULT_DB_CONNECTION_LIMIT = 10;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const ENV_VALIDATION_PREFIX = "Invalid API environment configuration:";

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
    issuer: string | null;
    audience: string | null;
  };
};

let cachedEnv: AppEnv | null = null;
let cachedEnvError: Error | null = null;

export function getAppEnv(): AppEnv {
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

    const issuer = process.env.AUTH_JWT_ISSUER;
    const audience = process.env.AUTH_JWT_AUDIENCE;

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
        issuer: issuer && issuer.length > 0 ? issuer : null,
        audience: audience && audience.length > 0 ? audience : null
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
