// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { type PosOfflineDb, posDb } from "./db.js";
import { enqueueOutboxJobInTransaction } from "./outbox.js";
import {
  type CompleteSaleInput,
  type CompleteSaleResult,
  type CompleteSaleTotalsInput,
  type CreateSaleDraftInput,
  type CreateSaleDraftResult,
  type PaymentRow,
  type ProductCacheRow,
  type SaleItemRow,
  type SaleRow,
  InvalidSaleTransitionError,
  ProductSnapshotNotFoundError,
  RecordNotFoundError,
  SaleCompletionInProgressError,
  SaleTotalsMismatchError,
  ScopeValidationError
} from "./types.js";

const saleCompletionLocks = new Set<string>();
const MONEY_SCALE = 100;

function nowIso(): string {
  return new Date().toISOString();
}

function assertPositiveId(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ScopeValidationError(`${field} must be a positive integer`);
  }
}

function assertNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ScopeValidationError(`${field} must be a non-negative number`);
  }
}

function normalizeMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

function sumMoney(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return normalizeMoney(total);
}

function reconcileSaleTotals(itemRows: readonly SaleItemRow[], paymentRows: readonly PaymentRow[]): CompleteSaleTotalsInput {
  const subtotal = sumMoney(itemRows.map((line) => normalizeMoney(line.qty * line.unit_price_snapshot)));
  const discountTotal = sumMoney(itemRows.map((line) => line.discount_amount));
  const grandTotal = sumMoney(itemRows.map((line) => line.line_total));
  const taxTotal = normalizeMoney(grandTotal - normalizeMoney(subtotal - discountTotal));
  const paidTotal = sumMoney(paymentRows.map((payment) => payment.amount));
  const changeTotal = normalizeMoney(paidTotal - grandTotal);

  return {
    subtotal,
    discount_total: discountTotal,
    tax_total: taxTotal,
    grand_total: grandTotal,
    paid_total: paidTotal,
    change_total: changeTotal
  };
}

function assertTotalMatch(
  field: keyof CompleteSaleTotalsInput,
  callerValue: number,
  computedValue: number
): void {
  const normalizedCaller = normalizeMoney(callerValue);
  const normalizedComputed = normalizeMoney(computedValue);

  if (normalizedCaller !== normalizedComputed) {
    throw new SaleTotalsMismatchError(field, normalizedCaller, normalizedComputed);
  }
}

function assertCallerTotalsMatch(
  callerTotals: CompleteSaleTotalsInput,
  computedTotals: CompleteSaleTotalsInput
): void {
  assertTotalMatch("subtotal", callerTotals.subtotal, computedTotals.subtotal);
  assertTotalMatch("discount_total", callerTotals.discount_total, computedTotals.discount_total);
  assertTotalMatch("tax_total", callerTotals.tax_total, computedTotals.tax_total);
  assertTotalMatch("grand_total", callerTotals.grand_total, computedTotals.grand_total);
  assertTotalMatch("paid_total", callerTotals.paid_total, computedTotals.paid_total);
  assertTotalMatch("change_total", callerTotals.change_total, computedTotals.change_total);
}

function assertSaleCompletionInput(input: CompleteSaleInput): void {
  if (!input.sale_id) {
    throw new ScopeValidationError("sale_id is required");
  }

  if (input.items.length === 0) {
    throw new ScopeValidationError("items must not be empty");
  }

  if (input.payments.length === 0) {
    throw new ScopeValidationError("payments must not be empty");
  }

  for (const item of input.items) {
    assertPositiveId(item.item_id, "item_id");
    if (!Number.isFinite(item.qty) || item.qty <= 0) {
      throw new ScopeValidationError("qty must be > 0");
    }
    assertNonNegative(item.discount_amount ?? 0, "discount_amount");
  }

  for (const payment of input.payments) {
    if (!payment.method.trim()) {
      throw new ScopeValidationError("payment method is required");
    }
    assertNonNegative(payment.amount, "payment.amount");
  }

  assertNonNegative(input.totals.subtotal, "totals.subtotal");
  assertNonNegative(input.totals.discount_total, "totals.discount_total");
  assertNonNegative(input.totals.tax_total, "totals.tax_total");
  assertNonNegative(input.totals.grand_total, "totals.grand_total");
  assertNonNegative(input.totals.paid_total, "totals.paid_total");
  assertNonNegative(input.totals.change_total, "totals.change_total");

  if (input.totals.paid_total < input.totals.grand_total) {
    throw new ScopeValidationError("paid_total must be >= grand_total");
  }
}

async function withSaleCompletionLock<T>(db: PosOfflineDb, saleId: string, operation: () => Promise<T>): Promise<T> {
  const lockKey = `${db.name}:${saleId}`;
  if (saleCompletionLocks.has(lockKey)) {
    throw new SaleCompletionInProgressError(saleId);
  }

  saleCompletionLocks.add(lockKey);
  try {
    return await operation();
  } finally {
    saleCompletionLocks.delete(lockKey);
  }
}

async function readProductSnapshot(
  db: PosOfflineDb,
  companyId: number,
  outletId: number,
  itemId: number
): Promise<ProductCacheRow> {
  const snapshot = await db.products_cache
    .where("[company_id+outlet_id+item_id]")
    .equals([companyId, outletId, itemId])
    .first();

  if (!snapshot) {
    throw new ProductSnapshotNotFoundError(companyId, outletId, itemId);
  }

  return snapshot;
}

export async function createSaleDraft(
  input: CreateSaleDraftInput,
  db: PosOfflineDb = posDb
): Promise<CreateSaleDraftResult> {
  assertPositiveId(input.company_id, "company_id");
  assertPositiveId(input.outlet_id, "outlet_id");
  assertPositiveId(input.cashier_user_id, "cashier_user_id");

  const openedAt = input.opened_at ?? nowIso();
  const sale: SaleRow = {
    sale_id: crypto.randomUUID(),
    company_id: input.company_id,
    outlet_id: input.outlet_id,
    cashier_user_id: input.cashier_user_id,
    status: "DRAFT",
    sync_status: "LOCAL_ONLY",
    trx_at: openedAt,
    subtotal: 0,
    discount_total: 0,
    tax_total: 0,
    grand_total: 0,
    paid_total: 0,
    change_total: 0,
    data_version: null,
    created_at: openedAt,
    completed_at: null
  };

  await db.sales.add(sale);

  return {
    sale_id: sale.sale_id,
    status: "DRAFT"
  };
}

export async function completeSale(input: CompleteSaleInput, db: PosOfflineDb = posDb): Promise<CompleteSaleResult> {
  assertSaleCompletionInput(input);

  return withSaleCompletionLock(db, input.sale_id, async () => {
    return db.transaction("rw", [db.sales, db.products_cache, db.sale_items, db.payments, db.outbox_jobs], async () => {
      const currentSale = await db.sales.get(input.sale_id);
      if (!currentSale) {
        throw new RecordNotFoundError("sale", input.sale_id);
      }

      if (currentSale.status !== "DRAFT") {
        throw new InvalidSaleTransitionError(currentSale.sale_id, currentSale.status, "COMPLETED");
      }

      const completedAt = nowIso();
      const clientTxId = crypto.randomUUID();
      const trxAt = input.trx_at ?? completedAt;

      const itemRows: SaleItemRow[] = [];
      for (const line of input.items) {
        const snapshot = await readProductSnapshot(db, currentSale.company_id, currentSale.outlet_id, line.item_id);
        const discountAmount = line.discount_amount ?? 0;
        const lineTotal = normalizeMoney(line.qty * snapshot.price_snapshot - discountAmount);
        if (lineTotal < 0) {
          throw new ScopeValidationError("line_total must be non-negative");
        }

        itemRows.push({
          line_id: crypto.randomUUID(),
          sale_id: currentSale.sale_id,
          company_id: currentSale.company_id,
          outlet_id: currentSale.outlet_id,
          item_id: line.item_id,
          name_snapshot: snapshot.name,
          sku_snapshot: snapshot.sku,
          item_type_snapshot: snapshot.item_type,
          qty: line.qty,
          unit_price_snapshot: snapshot.price_snapshot,
          discount_amount: discountAmount,
          line_total: lineTotal
        });
      }

      const paymentRows: PaymentRow[] = input.payments.map((payment) => ({
        payment_id: crypto.randomUUID(),
        sale_id: currentSale.sale_id,
        company_id: currentSale.company_id,
        outlet_id: currentSale.outlet_id,
        method: payment.method,
        amount: payment.amount,
        reference_no: payment.reference_no ?? null,
          paid_at: trxAt
        }));

      const reconciledTotals = reconcileSaleTotals(itemRows, paymentRows);
      if (reconciledTotals.paid_total < reconciledTotals.grand_total) {
        throw new ScopeValidationError("paid_total must be >= grand_total");
      }

      assertCallerTotalsMatch(input.totals, reconciledTotals);

      const updatedCount = await db.sales.update(currentSale.sale_id, {
        client_tx_id: clientTxId,
        status: "COMPLETED",
        sync_status: "PENDING",
        trx_at: trxAt,
        subtotal: reconciledTotals.subtotal,
        discount_total: reconciledTotals.discount_total,
        tax_total: reconciledTotals.tax_total,
        grand_total: reconciledTotals.grand_total,
        paid_total: reconciledTotals.paid_total,
        change_total: reconciledTotals.change_total,
        completed_at: completedAt
      });

      if (updatedCount !== 1) {
        throw new ScopeValidationError(`Failed to update sale ${currentSale.sale_id}`);
      }

      await db.sale_items.bulkAdd(itemRows);
      await db.payments.bulkAdd(paymentRows);

      const outboxJob = await enqueueOutboxJobInTransaction({ sale_id: currentSale.sale_id }, db, completedAt);

      return {
        sale_id: currentSale.sale_id,
        client_tx_id: clientTxId,
        status: "COMPLETED",
        outbox_job_id: outboxJob.job_id
      };
    });
  });
}
