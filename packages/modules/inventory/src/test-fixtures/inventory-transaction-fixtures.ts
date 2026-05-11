// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Transaction Test Fixtures
 *
 * FIXTURE MODE: Partial Fixture Mode
 * SCOPE: Raw inventory_transactions row creation for test seeding only.
 * RATIONALE: The production StockService requires inventory_stock rows and
 *   performs multi-table transactional validation (availability checks,
 *   concurrent modification guards). In COGS posting tests, the test subject
 *   is COGS calculation (not stock movement validation), so full production
 *   flow is unnecessary and would add excessive test-complexity overhead.
 * OWNER: modules-inventory (owner package for inventory_transactions domain)
 *
 * Location: packages/modules/inventory/src/test-fixtures/
 */

import type { KyselySchema } from "@jurnapod/db";
import { sql } from "kysely";

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
 * This fixture is Partial Fixture Mode — it does a direct INSERT
 * rather than going through StockService, because the test subject
 * is COGS posting calculation, not stock movement validation.
 *
 * @param db - Database connection
 * @param opts - Transaction options
 * @returns The inserted row ID
 */
export async function createTestInventoryTransaction(
  db: KyselySchema,
  opts: CreateTestInventoryTransactionOptions
): Promise<number> {
  const result = await sql`
    INSERT INTO inventory_transactions (
      company_id,
      product_id,
      transaction_type,
      quantity_delta,
      reference_id,
      created_at
    ) VALUES (
      ${opts.companyId},
      ${opts.productId},
      ${opts.transactionType ?? 1},
      ${opts.quantityDelta},
      ${opts.referenceId},
      NOW()
    )
  `.execute(db);
  return Number((result as { insertId?: number }).insertId ?? 0);
}
