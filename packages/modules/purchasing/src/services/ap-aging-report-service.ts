// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Aging Report Service for purchasing module.
 *
 * Provides AP aging report functionality with tenant isolation and deterministic output.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import { AP_PAYMENT_STATUS, PURCHASE_CREDIT_STATUS, PURCHASE_INVOICE_STATUS, toUtcIso, fromUtcIso } from "@jurnapod/shared";
import type {
  APAgingSummary,
  APAgingSupplierDetail,
  APAgingSupplierRow,
  APAgingBuckets,
  AgingBucketKey,
  GetAPAgingSummaryParams,
  GetAPAgingSupplierDetailParams,
} from "../types/ap-aging-report.js";

// =============================================================================
// BigInt Scaled Decimal Helpers
// =============================================================================

function toScaled(value: string, scale: number): bigint {
  const trimmed = value.trim();
  const re = new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`);
  if (!re.test(trimmed)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  const [integer, fraction = ""] = trimmed.split(".");
  const scaleFactor = 10n ** BigInt(scale);
  const fracScaled = (fraction + "0".repeat(scale)).slice(0, scale);
  return BigInt(integer) * scaleFactor + BigInt(fracScaled);
}

function toScaled4(value: string): bigint {
  return toScaled(value, 4);
}

function fromScaled4(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const intPart = abs / 10000n;
  const fracPart = (abs % 10000n).toString().padStart(4, "0");
  return `${sign}${intPart.toString()}.${fracPart}`;
}

function divScaled4(numeratorScaled4: bigint, denominatorScaled8: bigint): bigint {
  if (denominatorScaled8 <= 0n) {
    return numeratorScaled4;
  }
  return (numeratorScaled4 * 100000000n + denominatorScaled8 / 2n) / denominatorScaled8;
}

// =============================================================================
// Date Helpers
// =============================================================================


function dateWithOffset(baseDate: string, offsetDays: number): string {
  const date = new Date(`${baseDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return fromUtcIso.dateOnly(toUtcIso.dateLike(date) as string);
}

function daysPastDue(asOfDate: string, dueDate: string): number {
  const asOf = new Date(`${asOfDate}T00:00:00.000Z`).getTime();
  const due = new Date(`${dueDate}T00:00:00.000Z`).getTime();
  return Math.floor((asOf - due) / 86400000);
}

function resolveBucket(asOfDate: string, dueDate: string): AgingBucketKey {
  const overdueDays = daysPastDue(asOfDate, dueDate);

  if (overdueDays <= 0) return "current";
  if (overdueDays <= 30) return "due_1_30";
  if (overdueDays <= 60) return "due_31_60";
  if (overdueDays <= 90) return "due_61_90";
  return "due_over_90";
}

function zeroBuckets(): Record<AgingBucketKey, bigint> {
  return {
    current: 0n,
    due_1_30: 0n,
    due_31_60: 0n,
    due_61_90: 0n,
    due_over_90: 0n,
  };
}

function formatBuckets(buckets: Record<AgingBucketKey, bigint>): APAgingBuckets {
  return {
    current: fromScaled4(buckets.current),
    due_1_30: fromScaled4(buckets.due_1_30),
    due_31_60: fromScaled4(buckets.due_31_60),
    due_61_90: fromScaled4(buckets.due_61_90),
    due_over_90: fromScaled4(buckets.due_over_90),
  };
}

// =============================================================================
// Raw Row Types
// =============================================================================

type RawInvoiceBalanceRow = {
  purchase_invoice_id: number;
  invoice_no: string;
  invoice_date: Date;
  due_date: Date | null;
  supplier_id: number;
  supplier_name: string;
  supplier_currency: string | null;
  invoice_currency: string;
  supplier_payment_terms_days: number | null;
  company_payment_terms_days: string | null;
  exchange_rate: string;
  grand_total: string;
  base_total: string;
  paid_base: string;
  credited_base: string;
};

// =============================================================================
// Internal Query Functions
// =============================================================================

async function getRawOpenInvoiceRows(
  db: KyselySchema,
  companyId: number,
  supplierId?: number
): Promise<RawInvoiceBalanceRow[]> {
  const supplierFilter = supplierId !== undefined ? sql`AND pi.supplier_id = ${supplierId}` : sql``;

  const rows = await sql<RawInvoiceBalanceRow>`
    SELECT
      pi.id AS purchase_invoice_id,
      pi.invoice_no,
      pi.invoice_date,
      pi.due_date,
      pi.supplier_id,
      COALESCE(s.name, CONCAT('Supplier #', pi.supplier_id)) AS supplier_name,
      s.currency AS supplier_currency,
      pi.currency_code AS invoice_currency,
      s.payment_terms_days AS supplier_payment_terms_days,
      cs.setting_value AS company_payment_terms_days,
      pi.exchange_rate,
      pi.grand_total,
      ROUND(pi.grand_total * pi.exchange_rate, 4) AS base_total,
      COALESCE(pay.total_paid, 0) AS paid_base,
      COALESCE(cr.total_credited, 0) AS credited_base
    FROM purchase_invoices pi
    INNER JOIN suppliers s ON s.id = pi.supplier_id AND s.company_id = pi.company_id
    LEFT JOIN (
      SELECT apl.purchase_invoice_id, SUM(apl.allocation_amount) AS total_paid
      FROM ap_payment_lines apl
      INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id
      WHERE ap.company_id = ${companyId}
        AND ap.status = ${AP_PAYMENT_STATUS.POSTED}
      GROUP BY apl.purchase_invoice_id
    ) pay ON pay.purchase_invoice_id = pi.id
    LEFT JOIN (
      SELECT pca.purchase_invoice_id, SUM(pca.applied_amount) AS total_credited
      FROM purchase_credit_applications pca
      INNER JOIN purchase_credits pc ON pc.id = pca.purchase_credit_id
      WHERE pca.company_id = ${companyId}
        AND pc.status IN (${PURCHASE_CREDIT_STATUS.PARTIAL}, ${PURCHASE_CREDIT_STATUS.APPLIED})
      GROUP BY pca.purchase_invoice_id
    ) cr ON cr.purchase_invoice_id = pi.id
    LEFT JOIN settings_numbers cs
      ON cs.company_id = pi.company_id
      AND cs.outlet_id IS NULL
      AND cs.setting_key = 'purchase_payment_terms_days'
    WHERE pi.company_id = ${companyId}
      AND pi.status = ${PURCHASE_INVOICE_STATUS.POSTED}
      ${supplierFilter}
    ORDER BY pi.invoice_date ASC, pi.id ASC
  `.execute(db);

  return rows.rows;
}

function resolvePaymentTermsDays(row: RawInvoiceBalanceRow): number {
  if (row.supplier_payment_terms_days !== null && row.supplier_payment_terms_days !== undefined) {
    return Math.max(0, Number(row.supplier_payment_terms_days));
  }

  const companyDefault = row.company_payment_terms_days !== null
    ? Number(row.company_payment_terms_days)
    : NaN;

  if (Number.isFinite(companyDefault) && companyDefault >= 0) {
    return companyDefault;
  }

  return 30;
}

function resolveDueDate(row: RawInvoiceBalanceRow): string {
  if (row.due_date) {
    return fromUtcIso.dateOnly(toUtcIso.dateLike(row.due_date) as string);
  }
  return dateWithOffset(fromUtcIso.dateOnly(toUtcIso.dateLike(row.invoice_date) as string), resolvePaymentTermsDays(row));
}

function resolveSupplierCurrency(row: RawInvoiceBalanceRow): string {
  return row.supplier_currency ?? row.invoice_currency;
}

// =============================================================================
// Service
// =============================================================================

export class ApAgingReportService {
  constructor(private readonly db: KyselySchema) {}

  async getAPAgingSummary(params: GetAPAgingSummaryParams): Promise<APAgingSummary> {
    const { companyId, asOfDate } = params;
    const rows = await getRawOpenInvoiceRows(this.db, companyId);

    const bySupplier = new Map<number, {
      supplier_id: number;
      supplier_name: string;
      currency: string;
      total_open_amount: bigint;
      base_open_amount: bigint;
      buckets: Record<AgingBucketKey, bigint>;
    }>();

    const grandBuckets = zeroBuckets();
    const currencyTotals = new Map<string, bigint>();
    let grandBase = 0n;

    for (const row of rows) {
      const baseTotal = toScaled4(String(row.base_total ?? "0"));
      const paidBase = toScaled4(String(row.paid_base ?? "0"));
      const creditedBase = toScaled4(String(row.credited_base ?? "0"));
      const openBase = baseTotal - paidBase - creditedBase;

      if (openBase <= 0n) {
        continue;
      }

      const exchangeRateScaled8 = toScaled(String(row.exchange_rate ?? "1"), 8);
      const openSupplier = divScaled4(openBase, exchangeRateScaled8);

      const dueDate = resolveDueDate(row);
      const bucket = resolveBucket(asOfDate, dueDate);

      const supplierCurrency = resolveSupplierCurrency(row);
      const existing = bySupplier.get(row.supplier_id) ?? {
        supplier_id: row.supplier_id,
        supplier_name: row.supplier_name,
        currency: supplierCurrency,
        total_open_amount: 0n,
        base_open_amount: 0n,
        buckets: zeroBuckets(),
      };

      existing.total_open_amount += openSupplier;
      existing.base_open_amount += openBase;
      existing.buckets[bucket] += openSupplier;
      bySupplier.set(row.supplier_id, existing);

      grandBase += openBase;
      grandBuckets[bucket] += openBase;
      currencyTotals.set(supplierCurrency, (currencyTotals.get(supplierCurrency) ?? 0n) + openSupplier);
    }

    const suppliers: APAgingSupplierRow[] = Array.from(bySupplier.values())
      .sort((a, b) => a.supplier_name.localeCompare(b.supplier_name))
      .map((row) => ({
        supplier_id: row.supplier_id,
        supplier_name: row.supplier_name,
        currency: row.currency,
        total_open_amount: fromScaled4(row.total_open_amount),
        base_open_amount: fromScaled4(row.base_open_amount),
        exchange_rate_note: "per_invoice_rate",
        buckets: formatBuckets(row.buckets),
      }));

    return {
      as_of_date: asOfDate,
      suppliers,
      grand_totals: {
        base_open_amount: fromScaled4(grandBase),
        buckets: formatBuckets(grandBuckets),
        currency_totals: Array.from(currencyTotals.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([currency, total]) => ({
            currency,
            total_open_amount: fromScaled4(total),
          })),
      },
    };
  }

  async getAPAgingSupplierDetail(params: GetAPAgingSupplierDetailParams): Promise<APAgingSupplierDetail | null> {
    const { companyId, supplierId, asOfDate } = params;
    const rows = await getRawOpenInvoiceRows(this.db, companyId, supplierId);

    if (rows.length === 0) {
      const supplier = await this.db
        .selectFrom("suppliers")
        .where("company_id", "=", companyId)
        .where("id", "=", supplierId)
        .select(["id", "name", "currency"])
        .executeTakeFirst();

      if (!supplier) {
        return null;
      }

      return {
        as_of_date: asOfDate,
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        currency: supplier.currency,
        invoices: [],
        totals: {
          total_open_amount: "0.0000",
          base_open_amount: "0.0000",
          buckets: formatBuckets(zeroBuckets()),
        },
      };
    }

    let totalOpen = 0n;
    let totalBaseOpen = 0n;
    const buckets = zeroBuckets();

    const invoices: Array<{
      purchase_invoice_id: number;
      pi_number: string;
      pi_date: string;
      due_date: string;
      payment_terms_days: number;
      currency: string;
      exchange_rate: string;
      original_amount: string;
      balance: string;
      base_balance: string;
      bucket: AgingBucketKey;
    }> = [];

    for (const row of rows) {
      const baseTotal = toScaled4(String(row.base_total ?? "0"));
      const paidBase = toScaled4(String(row.paid_base ?? "0"));
      const creditedBase = toScaled4(String(row.credited_base ?? "0"));
      const openBase = baseTotal - paidBase - creditedBase;

      if (openBase <= 0n) {
        continue;
      }

      const exchangeRateScaled8 = toScaled(String(row.exchange_rate ?? "1"), 8);
      const openSupplier = divScaled4(openBase, exchangeRateScaled8);

      const termsDays = resolvePaymentTermsDays(row);
      const dueDate = resolveDueDate(row);
      const bucket = resolveBucket(asOfDate, dueDate);

      totalOpen += openSupplier;
      totalBaseOpen += openBase;
      buckets[bucket] += openSupplier;

      invoices.push({
        purchase_invoice_id: row.purchase_invoice_id,
        pi_number: row.invoice_no,
        pi_date: fromUtcIso.dateOnly(toUtcIso.dateLike(row.invoice_date) as string),
        due_date: dueDate,
        payment_terms_days: termsDays,
        currency: row.invoice_currency,
        exchange_rate: String(row.exchange_rate),
        original_amount: String(row.grand_total),
        balance: fromScaled4(openSupplier),
        base_balance: fromScaled4(openBase),
        bucket,
      });
    }

    invoices.sort((a, b) => {
      if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
      return a.purchase_invoice_id - b.purchase_invoice_id;
    });

    const supplierName = rows[0]?.supplier_name ?? `Supplier #${supplierId}`;
    const supplierCurrency = resolveSupplierCurrency(rows[0]);

    return {
      as_of_date: asOfDate,
      supplier_id: supplierId,
      supplier_name: supplierName,
      currency: supplierCurrency,
      invoices,
      totals: {
        total_open_amount: fromScaled4(totalOpen),
        base_open_amount: fromScaled4(totalBaseOpen),
        buckets: formatBuckets(buckets),
      },
    };
  }
}
