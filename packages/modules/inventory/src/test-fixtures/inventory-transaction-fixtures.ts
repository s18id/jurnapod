// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Transaction Test Fixtures
 *
 * FIXTURE MODE: Partial Fixture Mode
 * SCOPE: Raw inventory_transactions row creation for test seeding only.
 * RATIONALE: The production StockService (StockServiceImpl in this package)
 *   creates inventory_transactions rows, but only as side effects of full
 *   stock operations (deductStock, reserveStock, releaseStock, adjustStock,
 *   transferStock) — each of which requires inventory_stock rows, performs
 *   multi-table transactional validation (availability checks, concurrent
 *   modification guards, FOR UPDATE locks), and triggers cost-layer calculations.
 *
 *   In COGS posting tests and other scenarios where the test subject is
 *   NOT stock movement validation (e.g., COGS calculation, journal posting),
 *   the full production StockService flow is unnecessary overhead and would
 *   add excessive test-complexity without improving test fidelity for the
 *   target assertion.
 *
 *   This fixture uses the canonical Kysely insertInto pattern — the same DB
 *   access style used by StockServiceImpl's internal INSERT statements — but
 *   at a decomposed level, without the surrounding validation and stock updates.
 *
 * OWNER: modules-inventory (owner package for inventory_transactions domain)
 *
 * Location: packages/modules/inventory/src/test-fixtures/
 */

import type { KyselySchema } from "@jurnapod/db";

/**
 * Options for creating a test inventory transaction row.
 */
export interface CreateTestInventoryTransactionOptions {
  companyId: number;
  productId: number;
  quantityDelta: number;
  referenceId: string;
  /** Transaction type constant (default: 1 = SALE) */
  transactionType?: number;
}

/**
 * Creates a raw inventory_transactions row for test seeding.
 *
 * Uses the canonical Kysely insertInto pattern — the same DB access
 * used by StockServiceImpl when it inserts inventory_transactions rows.
 * This is Partial Fixture Mode — it bypasses StockService's validation
 * because the test subject is not stock movement correctness.
 *
 * @param db - Database connection
 * @param opts - Transaction options
 * @returns The inserted row ID
 */
export async function createTestInventoryTransaction(
  db: KyselySchema,
  opts: CreateTestInventoryTransactionOptions
): Promise<number> {
  const result = await db
    .insertInto("inventory_transactions")
    .values({
      company_id: opts.companyId,
      product_id: opts.productId,
      transaction_type: opts.transactionType ?? 1,
      quantity_delta: opts.quantityDelta,
      reference_id: opts.referenceId,
    })
    .executeTakeFirst();
  return Number(result.insertId ?? 0);
}
