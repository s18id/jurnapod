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
 * NOTE: Some imported route modules may keep the event loop alive (e.g., DB pools).
 * We explicitly force exit after writing to ensure clean termination.
 */

import { openAPISpec } from "../src/routes/openapi-aggregator.js";

process.stdout.write(JSON.stringify(openAPISpec, null, 2));
// Force exit to prevent hanging on lingering event loop references from
// transitively-imported modules (e.g., database pools, timers).
process.exit(0);
