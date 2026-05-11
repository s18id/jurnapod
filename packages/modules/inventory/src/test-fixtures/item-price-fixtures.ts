// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Item Price Test Fixtures
 *
 * FIXTURE MODE: Partial Fixture Mode
 * SCOPE: Raw item_prices row creation for test seeding only.
 * RATIONALE: The production ItemPriceServiceImpl.createItemPrice enforces
 *   composite FK constraints (`fk_item_prices_company_outlet_scoped`) that
 *   fail when the outlet was created via a different DB connection pool in
 *   the test setup. Since the test subject is COGS posting (not item price
 *   validation), a Partial Fixture Mode raw INSERT is used to avoid pool-boundary
 *   FK issues while keeping the fixture in the owner package.
 * OWNER: modules-inventory (owner package for item_prices domain)
 *
 * Location: packages/modules/inventory/src/test-fixtures/
 */

import type { KyselySchema } from "@jurnapod/db";
import { sql } from "kysely";

/**
 * Options for creating a test item price.
 */
export interface CreateTestItemPriceOptions {
  companyId: number;
  itemId: number;
  outletId: number | null;
  price: number;
  isActive?: boolean;
  variantId?: number | null;
}

/**
 * Creates a raw item_prices row for test seeding.
 *
 * This fixture is Partial Fixture Mode — it does a direct INSERT
 * rather than going through ItemPriceServiceImpl, because the production
 * service enforces composite FK constraints that fail when cross-pool
 * test fixtures provide the company/outlet.
 *
 * @param db - Database connection
 * @param opts - Price options
 * @returns The inserted row ID
 */
export async function createTestItemPrice(
  db: KyselySchema,
  opts: CreateTestItemPriceOptions
): Promise<number> {
  const result = await sql`
    INSERT INTO item_prices (
      company_id,
      item_id,
      outlet_id,
      variant_id,
      price,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      ${opts.companyId},
      ${opts.itemId},
      ${opts.outletId},
      ${opts.variantId ?? null},
      ${opts.price},
      ${opts.isActive === false ? 0 : 1},
      NOW(),
      NOW()
    )
  `.execute(db);
  return Number((result as { insertId?: number }).insertId ?? 0);
}
