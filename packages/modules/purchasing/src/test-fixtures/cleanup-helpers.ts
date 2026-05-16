// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchasing-domain test cleanup helpers.
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
 * Clean up purchasing domain documents for a specific company.
 *
 * Deletes in FK-safe order:
 *   purchase_invoice_lines → purchase_invoices
 *   ap_payment_lines (via JOIN) → ap_payments
 *   purchase_credit_lines (via JOIN) → purchase_credits
 *   goods_receipt_lines → goods_receipts
 *   purchase_order_lines → purchase_orders
 *   exchange_rates
 *
 * Line tables without company_id (ap_payment_lines, purchase_credit_lines)
 * use INNER JOIN with their parent tables for scoped cleanup.
 *
 * Does NOT touch: journal_lines, journal_batches (immutable by DB trigger),
 * suppliers, company_modules, or ACL tables.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Target company ID for scoped cleanup
 */
export async function cleanupPurchasingDocuments(
  db: KyselySchema,
  companyId: number
): Promise<void> {
  // Lines WITHOUT company_id — delete via JOIN with parent
  await sql`DELETE apl FROM ap_payment_lines apl INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id WHERE ap.company_id = ${companyId}`.execute(db);
  await sql`DELETE pcl FROM purchase_credit_lines pcl INNER JOIN purchase_credits pc ON pc.id = pcl.purchase_credit_id WHERE pc.company_id = ${companyId}`.execute(db);

  // Lines WITH company_id — direct delete
  await sql`DELETE FROM purchase_invoice_lines WHERE company_id = ${companyId}`.execute(db);
  await sql`DELETE FROM goods_receipt_lines WHERE company_id = ${companyId}`.execute(db);
  await sql`DELETE FROM purchase_order_lines WHERE company_id = ${companyId}`.execute(db);

  // Unset FK references before deleting parent rows
  await sql`UPDATE ap_payments SET journal_batch_id = NULL WHERE company_id = ${companyId}`.execute(db);

  // Parent tables
  await sql`DELETE FROM purchase_invoices WHERE company_id = ${companyId}`.execute(db);
  await sql`DELETE FROM ap_payments WHERE company_id = ${companyId}`.execute(db);
  await sql`DELETE FROM purchase_credits WHERE company_id = ${companyId}`.execute(db);
  await sql`DELETE FROM goods_receipts WHERE company_id = ${companyId}`.execute(db);
  await sql`DELETE FROM purchase_orders WHERE company_id = ${companyId}`.execute(db);

  // Exchange rates
  await sql`DELETE FROM exchange_rates WHERE company_id = ${companyId}`.execute(db);
}

/**
 * Clean up company_modules rows for a specific company.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Target company ID
 */
export async function cleanupCompanyModules(
  db: KyselySchema,
  companyId: number
): Promise<void> {
  await sql`DELETE FROM company_modules WHERE company_id = ${companyId}`.execute(db);
}

/**
 * Clean up purchasing-specific support rows for a company:
 *   suppliers
 *
 * Does NOT touch bank_accounts, journal tables, or platform tables.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Target company ID
 */
export async function cleanupPurchasingSupportTables(
  db: KyselySchema,
  companyId: number
): Promise<void> {
  await sql`DELETE FROM suppliers WHERE company_id = ${companyId}`.execute(db);
}

/**
 * Clean up custom module_roles for a specific company (NOT system roles).
 *
 * P0 ACL safe: scoped by company_id, which only matches custom roles.
 * System roles have company_id = NULL and are never affected.
 *
 * Also cleans user_role_assignments for users of this company to
 * satisfy FK constraints before deleting module_roles.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Target company ID
 */
export async function cleanupCompanyModuleRoles(
  db: KyselySchema,
  companyId: number
): Promise<void> {
  await sql`DELETE FROM user_role_assignments WHERE user_id IN (SELECT id FROM users WHERE company_id = ${companyId})`.execute(db);
  await sql`DELETE FROM module_roles WHERE company_id = ${companyId}`.execute(db);
}

/**
 * Clean up settings_strings for a specific company.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Target company ID
 */
export async function cleanupCompanySettings(
  db: KyselySchema,
  companyId: number
): Promise<void> {
  await sql`DELETE FROM settings_strings WHERE company_id = ${companyId}`.execute(db);
}

/**
 * Clean up bank_accounts for a specific company.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Target company ID
 */
export async function cleanupBankAccounts(
  db: KyselySchema,
  companyId: number
): Promise<void> {
  await sql`DELETE FROM bank_accounts WHERE company_id = ${companyId}`.execute(db);
}

// ---------------------------------------------------------------------------
// AR Snapshot Trigger-Exercise Helpers (Story 57.1)
// ---------------------------------------------------------------------------

/**
 * Archive a reconciliation snapshot (sets status='ARCHIVED').
 *
 * Test/fixture helper — exercises the AR snapshot trigger's allowed
 * archive transition. NOT a production business-write path.
 *
 * @param db - KyselySchema database instance
 * @param snapshotId - Snapshot record ID
 */
export async function archiveTestReconciliationSnapshot(
  db: KyselySchema,
  snapshotId: number
): Promise<void> {
  await sql`
    UPDATE ap_reconciliation_snapshots
    SET status = 'ARCHIVED', archived_at = NOW()
    WHERE id = ${snapshotId}
  `.execute(db);
}

/**
 * Archive multiple reconciliation snapshots in a single statement.
 *
 * Test/fixture helper for batch cleanup.
 *
 * @param db - KyselySchema database instance
 * @param snapshotIds - Array of snapshot record IDs
 */
export async function archiveTestReconciliationSnapshots(
  db: KyselySchema,
  snapshotIds: number[]
): Promise<void> {
  if (snapshotIds.length === 0) return;
  await sql`
    UPDATE ap_reconciliation_snapshots
    SET status = 'ARCHIVED', archived_at = NOW()
    WHERE id IN (${sql.join(snapshotIds)})
  `.execute(db);
}

/**
 * Attempt a non-archive UPDATE on a snapshot (forbidden by trigger 0201).
 *
 * Test/fixture helper — exercises the trigger's append-only guard.
 * The DB trigger MUST block this mutation.
 *
 * @param db - KyselySchema database instance
 * @param snapshotId - Snapshot record ID
 * @returns Object with `blocked` flag and `errorMessage`
 */
export async function attemptForbiddenSnapshotMutation(
  db: KyselySchema,
  snapshotId: number
): Promise<{ blocked: boolean; errorMessage: string }> {
  try {
    await sql`
      UPDATE ap_reconciliation_snapshots
      SET ap_subledger_balance = 9999999.0000
      WHERE id = ${snapshotId}
    `.execute(db);
    return { blocked: false, errorMessage: '' };
  } catch (err: unknown) {
    return {
      blocked: true,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Attempt a DELETE on a snapshot (forbidden by companion DELETE trigger 0191).
 *
 * Test/fixture helper — exercises the trigger's append-only guard.
 * The DB trigger MUST block this deletion.
 *
 * @param db - KyselySchema database instance
 * @param snapshotId - Snapshot record ID
 * @returns Object with `blocked` flag and `errorMessage`
 */
export async function attemptForbiddenSnapshotDelete(
  db: KyselySchema,
  snapshotId: number
): Promise<{ blocked: boolean; errorMessage: string }> {
  try {
    await sql`
      DELETE FROM ap_reconciliation_snapshots WHERE id = ${snapshotId}
    `.execute(db);
    return { blocked: false, errorMessage: '' };
  } catch (err: unknown) {
    return {
      blocked: true,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
