// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { SupplierFixture } from "./types.js";

// Deterministic run ID for fixture code/name generation (matches API fixture behavior)
const _runIdSeed = (Date.now() ^ (process.pid << 8) ^ (Number(process.env.VITEST_POOL_ID ?? 0) << 16)) & 0x7fffffff;
let _runIdCounter = _runIdSeed;

function makeRunId(): string {
  return (++_runIdCounter).toString(36);
}

/**
 * Create a deterministic supplier fixture.
 *
 * @param db - KyselySchema database instance
 * @param options - Supplier options
 * @returns Supplier fixture with id, company_id, code, name, currency, payment_terms_days, is_active
 */
export async function createSupplierFixture(
  db: KyselySchema,
  options: {
    companyId: number;
    code?: string;
    name?: string;
    currency?: string;
    isActive?: boolean;
    paymentTermsDays?: number;
  }
): Promise<SupplierFixture> {
  const runId = makeRunId();

  const code = (options.code ?? `TEST-SUP-${runId}`).slice(0, 20).toUpperCase();
  const name = options.name ?? `Test Supplier ${runId}`;
  const currency = options.currency ?? "IDR";
  const paymentTermsDays = options.paymentTermsDays ?? null;
  const isActive = options.isActive ?? true;

  try {
    await sql`
      INSERT INTO suppliers (company_id, code, name, currency, payment_terms_days, is_active, created_at, updated_at)
      VALUES (${options.companyId}, ${code}, ${name}, ${currency}, ${paymentTermsDays}, ${isActive ? 1 : 0}, NOW(), NOW())
    `.execute(db);

    const result = await sql`SELECT id, company_id, code, name, currency, payment_terms_days, is_active FROM suppliers WHERE company_id = ${options.companyId} AND code = ${code} LIMIT 1`.execute(db);
    if (result.rows.length === 0) {
      throw new Error(`Failed to create supplier with code ${code}`);
    }
    const row = result.rows[0] as {
      id: number;
      company_id: number;
      code: string;
      name: string;
      currency: string;
      payment_terms_days: number | null;
      is_active: number;
    };
    const fixture: SupplierFixture = {
      id: Number(row.id),
      company_id: Number(row.company_id),
      code: row.code,
      name: row.name,
      currency: row.currency,
      payment_terms_days: row.payment_terms_days,
      is_active: Boolean(row.is_active),
    };
    return fixture;
  } catch (error: unknown) {
    // Handle duplicate - fetch existing
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      const result = await sql`SELECT id, company_id, code, name, currency, payment_terms_days, is_active FROM suppliers WHERE company_id = ${options.companyId} AND code = ${code} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as {
          id: number;
          company_id: number;
          code: string;
          name: string;
          currency: string;
          payment_terms_days: number | null;
          is_active: number;
        };
        return {
          id: Number(row.id),
          company_id: Number(row.company_id),
          code: row.code,
          name: row.name,
          currency: row.currency,
          payment_terms_days: row.payment_terms_days,
          is_active: Boolean(row.is_active),
        };
      }
    }
    throw error;
  }
}

/**
 * Set supplier active status for tests validating posting safeguards.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Company ID
 * @param supplierId - Supplier ID
 * @param isActive - Active status to set
 */
export async function setSupplierActiveFixture(
  db: KyselySchema,
  companyId: number,
  supplierId: number,
  isActive: boolean
): Promise<void> {
  await sql`
    UPDATE suppliers
    SET is_active = ${isActive ? 1 : 0}, updated_at = NOW()
    WHERE id = ${supplierId} AND company_id = ${companyId}
  `.execute(db);
}
