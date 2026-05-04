// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Period-close override helper for purchasing module.
 *
 * Extracted from individual service files (Story 54.6, D54-003)
 * to eliminate duplication across PurchaseInvoice, APPayment,
 * and PurchaseCredit services.
 */

import type { KyselySchema } from "@jurnapod/db";

export interface InsertPeriodCloseOverrideParams {
  companyId: number;
  userId: number;
  transactionType: string;
  transactionId: number;
  periodId: number;
  reason: string;
  overriddenAt: Date;
}

/**
 * Insert a period-close override record AND an audit log entry.
 * Both writes happen in the same DB transaction (caller must pass trx).
 */
export async function insertPeriodCloseOverride(
  db: KyselySchema,
  params: InsertPeriodCloseOverrideParams
): Promise<void> {
  await db
    .insertInto("period_close_overrides")
    .values({
      company_id: params.companyId,
      user_id: params.userId,
      transaction_type: params.transactionType,
      transaction_id: params.transactionId,
      period_id: params.periodId,
      reason: params.reason,
      overridden_at: params.overriddenAt,
    })
    .execute();

  // FIX(54.5-AC3): Audit log entry for period-close override
  await db
    .insertInto("audit_logs")
    .values({
      company_id: params.companyId,
      outlet_id: null,
      user_id: params.userId,
      action: "PERIOD_CLOSE_OVERRIDE",
      result: "SUCCESS",
      success: 1,
      ip_address: null,
      payload_json: JSON.stringify({
        periodId: params.periodId,
        reason: params.reason,
        transactionType: params.transactionType,
        transactionId: params.transactionId,
      }),
    })
    .execute();
}
