// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { KyselySchema } from "@jurnapod/db";
import type { OutletFixture } from "./types.js";
import { insertOutlet } from "../outlet-db.js";

// Deterministic run ID (matches API fixture behavior)
const _runIdSeed = (Date.now() ^ (process.pid << 8) ^ (Number(process.env.VITEST_POOL_ID ?? 0) << 16)) & 0x7fffffff;
let _runIdCounter = _runIdSeed;
function makeRunId(): string { return (++_runIdCounter).toString(36); }

/**
 * Create a test outlet through the production insertOutlet() function.
 * Full Fixture Mode — uses the canonical production insert path.
 */
export async function createTestOutletMinimal(
  db: KyselySchema,
  companyId: number,
  options?: Partial<{ code: string; name: string; timezone: string }>
): Promise<OutletFixture> {
  const runId = makeRunId();
  const code = (options?.code ?? `TEST-OL-${runId}`).slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test Outlet ${runId}`;

  const id = await insertOutlet(db, {
    companyId,
    code,
    name,
    timezone: options?.timezone ?? "Asia/Jakarta",
  });

  return { id, company_id: companyId, code, name, timezone: options?.timezone ?? "Asia/Jakarta" };
}

/**
 * Create a test outlet with NULL timezone.
 */
export async function createTestOutletWithoutTimezone(
  db: KyselySchema,
  companyId: number,
  options?: Partial<{ code: string; name: string }>
): Promise<OutletFixture> {
  const runId = makeRunId();
  const code = (options?.code ?? `TEST-OL-${runId}`).slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test Outlet ${runId}`;

  const id = await insertOutlet(db, {
    companyId,
    code,
    name,
    timezone: null,
  });

  return { id, company_id: companyId, code, name, timezone: null };
}
