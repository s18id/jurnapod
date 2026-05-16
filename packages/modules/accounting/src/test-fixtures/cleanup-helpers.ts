// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Accounting-domain test cleanup helpers.
 *
 * These helpers provide targeted, dependency-order-aware cleanup for test
 * teardown. They operate directly on domain tables via scoped DELETEs — they
 * are NOT business-write paths; they are test/fixture maintenance helpers.
 *
 * Usage: call in afterAll() blocks to clean records scoped to a test company.
 *
 * FK dependency order is preserved internally (child → parent).
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

/**
 * Clean up accounting domain journal documents for a specific company.
 *
 * Deletes in FK-safe order: journal_lines → journal_batches.
 * These tables are protected by DB triggers (immutable rows), so cleanup
 * operates only on test-created records (non-immutable).
 *
 * @param db - KyselySchema database instance
 * @param companyId - Target company ID for scoped cleanup
 */
export async function cleanupAccountingJournalDocuments(
  db: KyselySchema,
  companyId: number,
): Promise<void> {
  await sql`DELETE FROM journal_lines WHERE company_id = ${companyId}`.execute(db);
  await sql`DELETE FROM journal_batches WHERE company_id = ${companyId}`.execute(db);
}

/**
 * Clean up accounts and tax_rates for a specific company.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Target company ID
 */
export async function cleanupAccountingChartDocuments(
  db: KyselySchema,
  companyId: number,
): Promise<void> {
  await sql`DELETE FROM tax_rates WHERE company_id = ${companyId}`.execute(db);
  await sql`DELETE FROM accounts WHERE company_id = ${companyId}`.execute(db);
}

/**
 * Clean up fiscal_periods and fiscal_years for a specific company.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Target company ID
 */
export async function cleanupFiscalStructure(
  db: KyselySchema,
  companyId: number,
): Promise<void> {
  await sql`DELETE FROM fiscal_periods WHERE company_id = ${companyId}`.execute(db);
  await sql`DELETE FROM fiscal_years WHERE company_id = ${companyId}`.execute(db);
}
