// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP payment test fixtures for purchasing module.
 *
 * All fixture functions use the production APPaymentService to create
 * domain-valid AP payments (never raw SQL). Deterministic defaults
 * ensure reproducible test data.
 */

import type { KyselySchema } from "@jurnapod/db";
import { APPaymentService } from "../services/ap-payment-service.js";
import type { ApPaymentFixture } from "./types.js";

// Deterministic run ID for fixture code/name generation (matches API fixture behavior)
const _runIdSeed = (Date.now() ^ (process.pid << 8) ^ (Number(process.env.VITEST_POOL_ID ?? 0) << 16)) & 0x7fffffff;
let _runIdCounter = _runIdSeed;

function makeRunId(): string {
  return (++_runIdCounter).toString(36);
}

/**
 * Create a deterministic AP payment fixture via the production service.
 *
 * Creates a DRAFT AP payment with sensible defaults. The caller MAY
 * post the payment separately using APPaymentService.postAPPayment() if a
 * POSTED payment is required.
 *
 * @param db - KyselySchema database instance
 * @param opts - AP payment options
 * @param opts.companyId - Company ID (required)
 * @param opts.userId - User ID for created_by_user_id (required)
 * @param opts.supplierId - Supplier ID (required)
 * @param opts.bankAccountId - Bank account ID (required, must be BANK or CASH type)
 * @param opts.paymentDate - Payment date (default: new Date("2099-01-15"))
 * @param opts.description - Description (default: null)
 * @param opts.lines - Payment line items (required)
 * @returns ApPaymentFixture with id, company_id, payment_no, etc.
 */
export async function createTestApPayment(
  db: KyselySchema,
  opts: {
    companyId: number;
    userId: number;
    supplierId: number;
    bankAccountId: number;
    paymentDate?: Date;
    description?: string | null;
    lines: Array<{
      purchaseInvoiceId: number;
      allocationAmount: string;
      description?: string | null;
    }>;
  }
): Promise<ApPaymentFixture> {
  const service = new APPaymentService(db);

  const paymentDate = opts.paymentDate ?? new Date("2099-01-15");

  const result = await service.createDraftAPPayment({
    companyId: opts.companyId,
    userId: opts.userId,
    paymentDate,
    bankAccountId: opts.bankAccountId,
    supplierId: opts.supplierId,
    description: opts.description ?? null,
    lines: opts.lines.map((l) => ({
      purchaseInvoiceId: l.purchaseInvoiceId,
      allocationAmount: l.allocationAmount,
      description: l.description ?? null,
    })),
  });

  return {
    id: result.id,
    company_id: result.company_id,
    payment_no: result.payment_no,
    payment_date: result.payment_date,
    bank_account_id: result.bank_account_id,
    supplier_id: result.supplier_id,
    supplier_name: result.supplier_name,
    description: result.description,
    status: result.status,
  };
}
