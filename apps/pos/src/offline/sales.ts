// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { type PosOfflineDb, posDb } from "@jurnapod/offline-db/dexie";
import { enqueueOutboxJobInTransaction } from "./outbox.js";
import { getRecoveryService } from "../services/recovery-service.js";
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
} from "@jurnapod/offline-db/dexie";
import { validateStockForItems, reserveStock, releaseStock } from "../services/stock.js";

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

function reconcileSaleTotals(
  itemRows: readonly SaleItemRow[],
  paymentRows: readonly PaymentRow[],
  transactionDiscounts: { discount_percent: number; discount_fixed: number; discount_code: string | null } = { discount_percent: 0, discount_fixed: 0, discount_code: null }
): CompleteSaleTotalsInput {
  const subtotal = sumMoney(itemRows.map((line) => normalizeMoney(line.qty * line.unit_price_snapshot)));
  const lineDiscountTotal = sumMoney(itemRows.map((line) => line.discount_amount));
  const afterLineDiscounts = normalizeMoney(subtotal - lineDiscountTotal);
  
  const discountPercent = transactionDiscounts.discount_percent ?? 0;
  const discountFixed = transactionDiscounts.discount_fixed ?? 0;
  const percentDiscount = normalizeMoney(afterLineDiscounts * (discountPercent / 100));
  const afterPercent = normalizeMoney(afterLineDiscounts - percentDiscount);
  const fixedDiscount = normalizeMoney(Math.min(discountFixed, afterPercent));
  
  const totalDiscount = normalizeMoney(lineDiscountTotal + percentDiscount + fixedDiscount);
  const grandTotal = normalizeMoney(Math.max(0, subtotal - totalDiscount));
  
  const taxTotal = normalizeMoney(grandTotal - normalizeMoney(subtotal - lineDiscountTotal));
  const paidTotal = sumMoney(paymentRows.map((payment) => payment.amount));
  const changeTotal = normalizeMoney(paidTotal - grandTotal);

  return {
    subtotal,
    discount_total: totalDiscount,
    discount_percent: discountPercent,
    discount_fixed: discountFixed,
    discount_code: transactionDiscounts.discount_code,
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

async function readVariantSnapshot(
  db: PosOfflineDb,
  companyId: number,
  outletId: number,
  variantId: number
): Promise<import("@jurnapod/offline-db/dexie").VariantCacheRow | null> {
  const snapshot = await db.variants_cache
    .where("[company_id+outlet_id+variant_id]")
    .equals([companyId, outletId, variantId])
    .first();

  return snapshot ?? null;
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
    service_type: input.service_type ?? "TAKEAWAY",
    table_id: input.table_id ?? null,
    reservation_id: input.reservation_id ?? null,
    guest_count: input.guest_count ?? null,
    order_status: input.order_status ?? "OPEN",
    opened_at: openedAt,
    closed_at: null,
    notes: input.notes ?? null,
    status: "DRAFT",
    sync_status: "LOCAL_ONLY",
    trx_at: openedAt,
    subtotal: 0,
    discount_total: 0,
    discount_percent: 0,
    discount_fixed: 0,
    discount_code: null,
    tax_total: 0,
    grand_total: 0,
    paid_total: 0,
    change_total: 0,
    data_version: null,
    created_at: openedAt,
    completed_at: null,
    stock_checked: false
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
    // Validate stock availability before transaction
    const currentSale = await db.sales.get(input.sale_id);
    if (!currentSale) {
      throw new RecordNotFoundError("sale", input.sale_id);
    }

    if (currentSale.status !== "DRAFT") {
      throw new InvalidSaleTransitionError(currentSale.sale_id, currentSale.status, "COMPLETED");
    }

    // Check stock availability before proceeding
    await validateStockForItems(
      {
        items: input.items.map((item) => ({ itemId: item.item_id, variantId: item.variant_id, quantity: item.qty })),
        companyId: currentSale.company_id,
        outletId: currentSale.outlet_id
      },
      db
    );

    const result = await db.transaction("rw", [db.sales, db.products_cache, db.variants_cache, db.sale_items, db.payments, db.outbox_jobs, db.inventory_stock, db.stock_reservations], async () => {
      const completedAt = nowIso();
      const clientTxId = crypto.randomUUID();
      const trxAt = input.trx_at ?? completedAt;
      const orderStatus = input.order_status ?? "COMPLETED";

      const itemRows: SaleItemRow[] = [];
      for (const line of input.items) {
        const productSnapshot = await readProductSnapshot(db, currentSale.company_id, currentSale.outlet_id, line.item_id);
        const variantSnapshot = line.variant_id
          ? await readVariantSnapshot(db, currentSale.company_id, currentSale.outlet_id, line.variant_id)
          : null;
        const discountAmount = line.discount_amount ?? 0;
        // Use variant price if available, otherwise product price
        const unitPrice = variantSnapshot?.price ?? productSnapshot.price_snapshot;
        const lineTotal = normalizeMoney(line.qty * unitPrice - discountAmount);
        if (lineTotal < 0) {
          throw new ScopeValidationError("line_total must be non-negative");
        }

        itemRows.push({
          line_id: crypto.randomUUID(),
          sale_id: currentSale.sale_id,
          company_id: currentSale.company_id,
          outlet_id: currentSale.outlet_id,
          item_id: line.item_id,
          variant_id: line.variant_id,
          variant_name_snapshot: variantSnapshot?.variant_name ?? null,
          name_snapshot: productSnapshot.name,
          sku_snapshot: variantSnapshot?.sku ?? productSnapshot.sku,
          item_type_snapshot: productSnapshot.item_type,
          qty: line.qty,
          unit_price_snapshot: unitPrice,
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

      const reconciledTotals = reconcileSaleTotals(itemRows, paymentRows, {
        discount_percent: input.totals.discount_percent,
        discount_fixed: input.totals.discount_fixed,
        discount_code: input.totals.discount_code
      });
      if (reconciledTotals.paid_total < reconciledTotals.grand_total) {
        throw new ScopeValidationError("paid_total must be >= grand_total");
      }

      assertCallerTotalsMatch(input.totals, reconciledTotals);

      // Reserve stock for the completed sale
      await reserveStock(
        {
          saleId: currentSale.sale_id,
          items: input.items.map((item) => ({ itemId: item.item_id, variantId: item.variant_id, quantity: item.qty })),
          companyId: currentSale.company_id,
          outletId: currentSale.outlet_id
        },
        db
      );

      const updatedCount = await db.sales.update(currentSale.sale_id, {
        client_tx_id: clientTxId,
        service_type: input.service_type ?? currentSale.service_type ?? "TAKEAWAY",
        table_id: input.table_id ?? currentSale.table_id ?? null,
        reservation_id: input.reservation_id ?? currentSale.reservation_id ?? null,
        guest_count: input.guest_count ?? currentSale.guest_count ?? null,
        order_status: orderStatus,
        opened_at: input.opened_at ?? currentSale.opened_at ?? currentSale.created_at,
        closed_at: input.closed_at ?? completedAt,
        notes: input.notes ?? currentSale.notes ?? null,
        status: "COMPLETED",
        sync_status: "PENDING",
        trx_at: trxAt,
        subtotal: reconciledTotals.subtotal,
        discount_total: reconciledTotals.discount_total,
        discount_percent: reconciledTotals.discount_percent,
        discount_fixed: reconciledTotals.discount_fixed,
        discount_code: reconciledTotals.discount_code,
        tax_total: reconciledTotals.tax_total,
        grand_total: reconciledTotals.grand_total,
        paid_total: reconciledTotals.paid_total,
        change_total: reconciledTotals.change_total,
        completed_at: completedAt,
        stock_checked: true
      });

      if (updatedCount !== 1) {
        throw new ScopeValidationError(`Failed to update sale ${currentSale.sale_id}`);
      }

      await db.sale_items.bulkAdd(itemRows);
      await db.payments.bulkAdd(paymentRows);

      const outboxJob = await enqueueOutboxJobInTransaction({ sale_id: currentSale.sale_id }, db, completedAt);

      const result = {
        sale_id: currentSale.sale_id,
        client_tx_id: clientTxId,
        status: "COMPLETED" as const,
        outbox_job_id: outboxJob.job_id
      };

      return result;
    });
    
    // Enhanced durability: Verify transaction state after commit
    // This addresses AC2 requirement for durable local commit with client_tx_id
    // Called outside the transaction block to avoid PrematureCommitError
    try {
      const recoveryService = getRecoveryService();
      const transactionState = await recoveryService.getTransactionState(result.sale_id);
      if (!transactionState || transactionState.state !== "COMPLETED") {
        // Log integrity issue but don't fail the transaction (it's already committed)
        console.warn(`Unexpected transaction state for ${result.sale_id}:`, transactionState?.state || "NOT_FOUND");
      }
    } catch (verificationError) {
      // Don't fail the transaction for verification errors
      console.warn(`Transaction state verification error for ${result.sale_id}:`, verificationError);
    }

    return result;
  });
}

export interface VoidSaleInput {
  sale_id: string;
  reason?: string;
}

export interface VoidSaleResult {
  sale_id: string;
  status: "VOID";
}

export async function voidSale(input: VoidSaleInput, db: PosOfflineDb = posDb): Promise<VoidSaleResult> {
  if (!input.sale_id) {
    throw new ScopeValidationError("sale_id is required");
  }

  return withSaleCompletionLock(db, input.sale_id, async () => {
    return db.transaction("rw", [db.sales, db.inventory_stock, db.stock_reservations], async () => {
      const currentSale = await db.sales.get(input.sale_id);
      if (!currentSale) {
        throw new RecordNotFoundError("sale", input.sale_id);
      }

      // Only DRAFT or COMPLETED sales can be voided
      if (currentSale.status !== "DRAFT" && currentSale.status !== "COMPLETED") {
        throw new InvalidSaleTransitionError(currentSale.sale_id, currentSale.status, "VOID");
      }

      // Release any stock reservations
      await releaseStock({ saleId: currentSale.sale_id }, db);

      const voidedAt = nowIso();
      const notes = input.reason
        ? `${currentSale.notes ?? ""} [VOIDED: ${input.reason}]`.trim()
        : currentSale.notes;

      const updatedCount = await db.sales.update(currentSale.sale_id, {
        status: "VOID",
        sync_status: currentSale.sync_status === "SENT" ? "PENDING" : currentSale.sync_status,
        closed_at: voidedAt,
        notes: notes ?? null
      });

      if (updatedCount !== 1) {
        throw new ScopeValidationError(`Failed to void sale ${currentSale.sale_id}`);
      }

      return {
        sale_id: currentSale.sale_id,
        status: "VOID"
      };
    });
  });
}
