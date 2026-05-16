// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * OpenAPI Spec Exporter
 *
 * Imports the OpenAPI aggregator and writes the current spec to stdout as JSON.
 * Used by scripts/check-api-contract-diff.ts for contract validation.
 *
 * Run from apps/api cwd via tsx:
 *   npx tsx scripts/export-openapi-spec.ts
 *
 * Important:
 * Some API route modules transitively import runtime services that validate app env.
 * This exporter is a build/contract tool, not the server, so it provides safe
 * dummy defaults before importing route modules.
 */

const SPEC_GENERATION_SECRET =
  "30afa7c25660d388d43ce9acb3c492a33093d668a823636e871eef8030412352";

const specGenerationEnvDefaults: Record<string, string> = {
  NODE_ENV: "test",

  DB_HOST: "127.0.0.1",
  DB_PORT: "3306",
  DB_USER: "root",
  DB_PASSWORD: "",
  DB_NAME: "jurnapod",

  AUTH_JWT_ACCESS_SECRET: SPEC_GENERATION_SECRET,
  AUTH_JWT_ACCESS_TTL_SECONDS: "3600",
  AUTH_REFRESH_SECRET: SPEC_GENERATION_SECRET,
  AUTH_REFRESH_TTL_SECONDS: "2592000",
  AUTH_JWT_ISSUER: "jurnapod-api",
  AUTH_JWT_AUDIENCE: "jurnapod-clients",

  APP_PUBLIC_URL: "http://127.0.0.1:3001",
  PLATFORM_SETTINGS_ENCRYPTION_KEY: SPEC_GENERATION_SECRET,
  CRON_EMAIL_OUTBOX_SECRET: SPEC_GENERATION_SECRET,

  MAILER_DRIVER: "disabled",
};

for (const [key, value] of Object.entries(specGenerationEnvDefaults)) {
  process.env[key] ??= value;
}

async function main(): Promise<void> {
  // Dynamic import is intentional.
  // Static ESM imports are evaluated before this module body runs, which means
  // env defaults would be set too late for transitive API env validation.
  const { openAPISpec } = await import("../src/routes/openapi-aggregator.js");

  process.stdout.write(JSON.stringify(openAPISpec, null, 2));

  // Force exit to prevent hanging on lingering event loop references from
  // transitively-imported modules, such as database pools or timers.
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("ERROR: Failed to export OpenAPI spec.");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

export {};