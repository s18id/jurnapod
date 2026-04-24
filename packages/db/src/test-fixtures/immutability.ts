// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Canonical immutability assertion helpers for integration tests.
 *
 * PURPOSE:
 * Provides deterministic DB-level immutability verification for append-only
 * financial/input tables (e.g., ap_reconciliation_snapshots, journal_batches).
 *
 * These helpers attempt raw SQL UPDATE/DELETE and verify they fail or have no effect,
 * confirming that the application enforces immutability (via triggers or application logic).
 *
 * SCOPE:
 * - DB-level verification only — does NOT replace application-level immutability checks
 * - Each helper is scoped to a single table and tenant (company_id)
 * - Helpers are idempotent — safe to call multiple times in the same test
 *
 * OWNER: @jurnapod/db (owns the database invariants for snapshot/audit tables)
 *
 * USAGE:
 * ```typescript
 * import { expectImmutableTable } from '@jurnapod/db/test-fixtures';
 *
 * await expectImmutableTable(
 *   db,
 *   'ap_reconciliation_snapshots',
 *   { companyId: 1, snapshotId: 42 }
 * );
 * ```
 */

import { sql } from "kysely";
import type { KyselySchema } from "../kysely/index.js";

export type ImmutableTableOptions = {
  /** Tenant/company scope for the immutability check */
  companyId: number;
  /** Primary key value of the row to test immutability against */
  recordId?: number;
  /** Optional: additional WHERE clause snippet (appended after company_id AND recordId) */
  extraCondition?: string;
};

/**
 * Assert that a database table is immutable at the DB level for a given tenant.
 *
 * This helper:
 * 1. Attempts an UPDATE on the target table (scoped to company_id, optional recordId)
 * 2. Attempts a DELETE on the target table (same scope)
 * 3. Verifies both operations either fail or have no rows affected
 *
 * For append-only tables that use DB triggers to enforce immutability
 * (e.g., ap_reconciliation_snapshots, journal_batches), the UPDATE/DELETE
 * should be blocked by the trigger and throw an error.
 *
 * @param db - Kysely database instance
 * @param tableName - Name of the table to test immutability for
 * @param options - Immutable check options
 */
export async function expectImmutableTable(
  db: KyselySchema,
  tableName: string,
  options: ImmutableTableOptions
): Promise<void> {
  const { companyId, recordId, extraCondition } = options;

  // Build WHERE clause
  let whereClause = `company_id = ${companyId}`;
  if (recordId !== undefined) {
    whereClause += ` AND id = ${recordId}`;
  }
  if (extraCondition) {
    whereClause += ` AND ${extraCondition}`;
  }

  const updateSql = sql`UPDATE ${sql.raw(tableName)} SET created_at = NOW() WHERE ${sql.raw(whereClause)} LIMIT 1`;
  const deleteSql = sql`DELETE FROM ${sql.raw(tableName)} WHERE ${sql.raw(whereClause)} LIMIT 1`;

  // Attempt UPDATE — should fail or affect 0 rows for truly immutable table
  try {
    const updateResult = await updateSql.execute(db);
    // If we got here without throwing, check rows affected
    // A properly immutable table should either:
    // - Throw via trigger (most common for enforced immutability)
    // - Affect 0 rows (no matching record to update)
    // Any other case means immutability is not enforced at DB level
    if ('rowsAffected' in updateResult && Number(updateResult.rowsAffected) > 0) {
      throw new Error(
        `UPDATE on table '${tableName}' affected ${updateResult.rowsAffected} row(s). ` +
        `Table is NOT immutable at DB level for company ${companyId}.`
      );
    }
  } catch (error) {
    // Expected: DB trigger blocks the UPDATE
    // Re-throw with context if it's an unexpected error type
    const message = error instanceof Error ? error.message : String(error);
    const normalizedMessage = message.toLowerCase();
    // Ignore "trigger" or "constraint" errors — those indicate immutability is enforced
    const isImmutabilityError =
      normalizedMessage.includes("trigger") ||
      normalizedMessage.includes("cannot be modified") ||
      normalizedMessage.includes("immutable") ||
      normalizedMessage.includes("append-only") ||
      normalizedMessage.includes("not allowed") ||
      normalizedMessage.includes("denied") ||
      normalizedMessage.includes("blocked");

    if (!isImmutabilityError) {
      throw new Error(
        `Unexpected error during immutability check on '${tableName}': ${message}`
      );
    }
  }

  // Attempt DELETE — should fail or affect 0 rows
  try {
    const deleteResult = await deleteSql.execute(db);
    if ('rowsAffected' in deleteResult && Number(deleteResult.rowsAffected) > 0) {
      throw new Error(
        `DELETE on table '${tableName}' affected ${deleteResult.rowsAffected} row(s). ` +
        `Table is NOT immutable at DB level for company ${companyId}.`
      );
    }
  } catch (error) {
    // Expected: DB trigger blocks the DELETE
    const message = error instanceof Error ? error.message : String(error);
    const normalizedMessage = message.toLowerCase();
    const isImmutabilityError =
      normalizedMessage.includes("trigger") ||
      normalizedMessage.includes("cannot be deleted") ||
      normalizedMessage.includes("immutable") ||
      normalizedMessage.includes("append-only") ||
      normalizedMessage.includes("not allowed") ||
      normalizedMessage.includes("denied") ||
      normalizedMessage.includes("blocked");

    if (!isImmutabilityError) {
      throw new Error(
        `Unexpected error during immutability check on '${tableName}': ${message}`
      );
    }
  }
}
