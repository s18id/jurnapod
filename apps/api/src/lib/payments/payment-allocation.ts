// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Payment Allocation Logic
 * 
 * Split and allocation logic for payments extracted from sales.ts
 */

import type { RowDataPacket } from "mysql2";
import type { SalesPayment, SalesPaymentSplit } from "@/lib/sales";
import type { QueryExecutor, CanonicalPaymentInput } from "./types";
import { toMysqlDateTime, toMysqlDateTimeFromDateLike } from "@/lib/date-helpers";
import { toRfc3339, toRfc3339Required } from "@jurnapod/shared";
import type { SalesPaymentSplitRow, SalesPaymentRow } from "./types";

const MONEY_SCALE = 100;

function normalizeMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

// Patch 1: Service precision guard - check if value has more than 2 decimal places
export function hasMoreThanTwoDecimals(value: number): boolean {
  const str = value.toFixed(10);
  const decimalPart = str.split(".")[1];
  if (!decimalPart) return false;
  return decimalPart.slice(2).split("").some((d) => d !== "0");
}

export function normalizePaymentSplit(row: SalesPaymentSplitRow): SalesPaymentSplit {
  return {
    id: Number(row.id),
    payment_id: Number(row.payment_id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    split_index: Number(row.split_index),
    account_id: Number(row.account_id),
    account_name: row.account_name,
    amount: normalizeMoney(Number(row.amount))
  };
}

export function normalizePayment(row: SalesPaymentRow): SalesPayment {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    invoice_id: Number(row.invoice_id),
    payment_no: row.payment_no,
    client_ref: row.client_ref ?? null,
    payment_at: row.payment_at,
    account_id: Number(row.account_id),
    account_name: row.account_name,
    method: row.method,
    status: row.status,
    amount: normalizeMoney(Number(row.amount)),
    actual_amount_idr: row.actual_amount_idr !== undefined && row.actual_amount_idr !== null 
      ? normalizeMoney(Number(row.actual_amount_idr)) 
      : undefined,
    invoice_amount_idr: row.invoice_amount_idr !== undefined && row.invoice_amount_idr !== null 
      ? normalizeMoney(Number(row.invoice_amount_idr)) 
      : undefined,
    payment_amount_idr: row.payment_amount_idr !== undefined && row.payment_amount_idr !== null 
      ? normalizeMoney(Number(row.payment_amount_idr)) 
      : undefined,
    payment_delta_idr: row.payment_delta_idr !== undefined 
      ? normalizeMoney(Number(row.payment_delta_idr)) 
      : undefined,
    shortfall_settled_as_loss: row.shortfall_settled_as_loss === 1 ? true : row.shortfall_settled_as_loss === 0 ? false : undefined,
    shortfall_reason: row.shortfall_reason ?? null,
    shortfall_settled_by_user_id: row.shortfall_settled_by_user_id ? Number(row.shortfall_settled_by_user_id) : null,
    shortfall_settled_at: row.shortfall_settled_at ? toRfc3339(row.shortfall_settled_at) : null,
    created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    updated_by_user_id: row.updated_by_user_id ? Number(row.updated_by_user_id) : null,
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  };
}

export async function fetchPaymentSplits(
  executor: QueryExecutor,
  companyId: number,
  paymentId: number
): Promise<SalesPaymentSplit[]> {
  const [rows] = await executor.execute<SalesPaymentSplitRow[]>(
    `SELECT sps.id, sps.payment_id, sps.company_id, sps.outlet_id, sps.split_index,
            sps.account_id, a.name as account_name, sps.amount
     FROM sales_payment_splits sps
     LEFT JOIN accounts a ON a.id = sps.account_id AND a.company_id = sps.company_id
     WHERE sps.company_id = ?
       AND sps.payment_id = ?
     ORDER BY sps.split_index`,
    [companyId, paymentId]
  );
  return rows.map(normalizePaymentSplit);
}

export async function fetchPaymentSplitsForMultiple(
  executor: QueryExecutor,
  companyId: number,
  paymentIds: number[]
): Promise<Map<number, SalesPaymentSplit[]>> {
  if (paymentIds.length === 0) {
    return new Map();
  }

  const placeholders = paymentIds.map(() => "?").join(", ");
  const [rows] = await executor.execute<SalesPaymentSplitRow[]>(
    `SELECT sps.id, sps.payment_id, sps.company_id, sps.outlet_id, sps.split_index,
            sps.account_id, a.name as account_name, sps.amount
     FROM sales_payment_splits sps
     LEFT JOIN accounts a ON a.id = sps.account_id AND a.company_id = sps.company_id
     WHERE sps.company_id = ?
       AND sps.payment_id IN (${placeholders})
     ORDER BY sps.payment_id, sps.split_index`,
    [companyId, ...paymentIds]
  );

  const splitsByPaymentId = new Map<number, SalesPaymentSplit[]>();
  for (const row of rows) {
    const paymentId = Number(row.payment_id);
    if (!splitsByPaymentId.has(paymentId)) {
      splitsByPaymentId.set(paymentId, []);
    }
    splitsByPaymentId.get(paymentId)!.push(normalizePaymentSplit(row));
  }

  return splitsByPaymentId;
}

export function attachSplitsToPayment(
  payment: SalesPayment,
  splits: SalesPaymentSplit[]
): SalesPayment {
  return { ...payment, splits };
}

// Patch A: Normalize datetimes for idempotency comparison.
// Incoming payloads are persisted as DATETIME (timezone-less) and then read back through mysql2,
// which interprets DATETIME in local timezone. We mirror that for stable comparisons.
export function normalizeIncomingDatetimeForCompare(paymentAt: string): string {
  const persistedValue = toMysqlDateTime(paymentAt);
  const localInterpreted = new Date(persistedValue.replace(" ", "T"));
  if (Number.isNaN(localInterpreted.getTime())) {
    throw new Error("Invalid datetime");
  }
  return toMysqlDateTime(localInterpreted.toISOString());
}

export function normalizeExistingDatetimeForCompare(paymentAt: string): string {
  return toMysqlDateTimeFromDateLike(paymentAt);
}

export function buildCanonicalInput(
  input: {
    outlet_id: number;
    invoice_id: number;
    payment_at: string;
    amount: number;
    account_id?: number;
    splits?: Array<{ account_id: number; amount: number }>;
  }
): CanonicalPaymentInput {
  const hasSplits = input.splits && input.splits.length > 0;
  const effectiveAccountId = hasSplits ? input.splits![0].account_id : input.account_id!;
  const splits = hasSplits
    ? input.splits!.map(s => ({ account_id: s.account_id, amount_minor: Math.round(s.amount * 100) }))
    : [{ account_id: effectiveAccountId, amount_minor: Math.round(input.amount * 100) }];

  return {
    outlet_id: input.outlet_id,
    invoice_id: input.invoice_id,
    payment_at: normalizeIncomingDatetimeForCompare(input.payment_at),
    amount_minor: Math.round(input.amount * 100),
    account_id: effectiveAccountId,
    splits
  };
}

export function buildCanonicalFromExisting(payment: SalesPayment): CanonicalPaymentInput {
  const splits = payment.splits && payment.splits.length > 0
    ? payment.splits.map(s => ({ account_id: s.account_id, amount_minor: Math.round(s.amount * 100) }))
    : [{ account_id: payment.account_id, amount_minor: Math.round(payment.amount * 100) }];

  return {
    outlet_id: payment.outlet_id,
    invoice_id: payment.invoice_id,
    payment_at: normalizeExistingDatetimeForCompare(payment.payment_at),
    amount_minor: Math.round(payment.amount * 100),
    account_id: payment.account_id,
    splits
  };
}

export function canonicalPaymentsEqual(a: CanonicalPaymentInput, b: CanonicalPaymentInput): boolean {
  if (a.outlet_id !== b.outlet_id) return false;
  if (a.invoice_id !== b.invoice_id) return false;
  if (a.payment_at !== b.payment_at) return false;
  if (a.amount_minor !== b.amount_minor) return false;
  if (a.account_id !== b.account_id) return false;
  if (a.splits.length !== b.splits.length) return false;

  // Compare splits in order (order matters per spec)
  for (let i = 0; i < a.splits.length; i++) {
    if (a.splits[i].account_id !== b.splits[i].account_id) return false;
    if (a.splits[i].amount_minor !== b.splits[i].amount_minor) return false;
  }

  return true;
}
