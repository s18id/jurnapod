// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Shared open-amount calculation for purchase invoices in base currency.
 */

import type { KyselySchema } from "@jurnapod/db";
import { sql } from "kysely";
import { AP_PAYMENT_STATUS, PURCHASE_CREDIT_STATUS } from "@jurnapod/shared";
import { sub } from "@jurnapod/shared";

export async function computePurchaseInvoiceOpenAmount(
  db: KyselySchema,
  companyId: number,
  invoiceId: number
): Promise<string> {
  const baseTotalResult = await sql<{ base_grand_total: string }>`
    SELECT COALESCE(ROUND(grand_total * exchange_rate, 4), 0) AS base_grand_total
    FROM purchase_invoices
    WHERE id = ${invoiceId}
      AND company_id = ${companyId}
    LIMIT 1
  `.execute(db);

  if (baseTotalResult.rows.length === 0) {
    return "0.0000";
  }

  const baseGrandTotal = String(baseTotalResult.rows[0]?.base_grand_total ?? "0");

  const paidResult = await sql<{ total: string }>`
    SELECT COALESCE(SUM(apl.allocation_amount), 0) as total
    FROM ap_payment_lines apl
    INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id
    WHERE apl.purchase_invoice_id = ${invoiceId}
      AND ap.company_id = ${companyId}
      AND ap.status = ${AP_PAYMENT_STATUS.POSTED}
  `.execute(db);

  const creditedResult = await sql<{ total: string }>`
    SELECT COALESCE(SUM(pca.applied_amount), 0) as total
    FROM purchase_credit_applications pca
    INNER JOIN purchase_credits pc ON pc.id = pca.purchase_credit_id
    WHERE pca.purchase_invoice_id = ${invoiceId}
      AND pca.company_id = ${companyId}
      AND pc.status IN (${PURCHASE_CREDIT_STATUS.PARTIAL}, ${PURCHASE_CREDIT_STATUS.APPLIED})
  `.execute(db);

  const paidAmount = String(paidResult.rows[0]?.total ?? "0");
  const creditedAmount = String(creditedResult.rows[0]?.total ?? "0");
  return sub(sub(baseGrandTotal, paidAmount), creditedAmount);
}
