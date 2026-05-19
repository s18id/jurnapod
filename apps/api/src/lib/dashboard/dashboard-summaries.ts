// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Temporal } from "@js-temporal/polyfill";
import { sql } from "kysely";
import { PURCHASE_INVOICE_STATUS, PURCHASE_ORDER_STATUS } from "@jurnapod/shared";

import { getDb } from "@/lib/db";

const AP_EXCEPTION_STATUS_OPEN = 1;
const AP_EXCEPTION_STATUS_ASSIGNED = 2;

export interface InventoryDashboardSummary {
  totalItems: number;
  activeItems: number;
  lowStockAlerts: number;
  outletScoped: boolean;
  recentStockMovements: { apiGap: true; message: string };
}

export type DashboardApiGap = { apiGap: true; message: string };

export interface AccountingDashboardSummary {
  pendingReconciliations: DashboardApiGap;
  openFiscalYears: number;
  closedFiscalYears: number;
  journalEntryCount: number;
}

export interface PurchasingDashboardSummary {
  overdueInvoices: number;
  openPurchaseOrders: number;
  pendingApprovals: { apiGap: true; message: string };
}

export interface PendingExceptionsSummary {
  total: number;
  apExceptions: number;
  reconciliationMismatches: DashboardApiGap;
  syncErrors: number;
}

function toCount(value: unknown): number {
  return Number(value ?? 0);
}

export async function getInventoryDashboardSummary(companyId: number, outletId?: number): Promise<InventoryDashboardSummary> {
  const db = getDb();

  let lowStockQuery = db
    .selectFrom("items")
    .innerJoin("inventory_stock", (join) =>
      join
        .onRef("inventory_stock.product_id", "=", "items.id")
        .onRef("inventory_stock.company_id", "=", "items.company_id"),
    )
    .where("items.company_id", "=", companyId)
    .where("items.is_active", "=", 1)
    .where("items.track_stock", "=", 1)
    .where("items.low_stock_threshold", "is not", null)
    .whereRef("inventory_stock.available_quantity", "<=", "items.low_stock_threshold");

  if (outletId !== undefined) {
    lowStockQuery = lowStockQuery.where("inventory_stock.outlet_id", "=", outletId);
  }

  const [totalItemsRow, activeItemsRow, lowStockRow] = await Promise.all([
    db
      .selectFrom("items")
      .where("company_id", "=", companyId)
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .executeTakeFirst(),
    db
      .selectFrom("items")
      .where("company_id", "=", companyId)
      .where("is_active", "=", 1)
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .executeTakeFirst(),
    lowStockQuery
      .select((eb) => eb.fn.count<number>("items.id").distinct().as("count"))
      .executeTakeFirst(),
  ]);

  return {
    totalItems: toCount(totalItemsRow?.count),
    activeItems: toCount(activeItemsRow?.count),
    lowStockAlerts: toCount(lowStockRow?.count),
    outletScoped: outletId !== undefined,
    recentStockMovements: {
      apiGap: true,
      message: "Recent stock movement source is not available for this dashboard yet.",
    },
  };
}

export async function getAccountingDashboardSummary(companyId: number): Promise<AccountingDashboardSummary> {
  const db = getDb();

  const [openFiscalYearsRow, closedFiscalYearsRow, journalEntryCount] = await Promise.all([
    db
      .selectFrom("fiscal_years")
      .where("company_id", "=", companyId)
      .where("status", "=", "OPEN")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .executeTakeFirst(),
    db
      .selectFrom("fiscal_years")
      .where("company_id", "=", companyId)
      .where("status", "=", "CLOSED")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .executeTakeFirst(),
    db
      .selectFrom("journal_batches")
      .where("company_id", "=", companyId)
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .executeTakeFirst(),
  ]);

  return {
    pendingReconciliations: {
      apiGap: true,
      message: "Reconciliation task source is not available for this dashboard yet.",
    },
    openFiscalYears: toCount(openFiscalYearsRow?.count),
    closedFiscalYears: toCount(closedFiscalYearsRow?.count),
    journalEntryCount: toCount(journalEntryCount?.count),
  };
}

export async function getPurchasingDashboardSummary(companyId: number): Promise<PurchasingDashboardSummary> {
  const db = getDb();
  // Dashboard AP due-date counts use UTC as the documented fallback because this
  // company-level count has no outlet context and only compares date-only values.
  const todayUtc = Temporal.Now.plainDateISO("UTC").toString();

  const [overdueInvoicesRow, openPurchaseOrdersRow] = await Promise.all([
    db
      .selectFrom("purchase_invoices")
      .where("company_id", "=", companyId)
      .where("status", "=", PURCHASE_INVOICE_STATUS.POSTED)
      .where("due_date", "is not", null)
      .where("due_date", "<", sql<Date>`${todayUtc}`)
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .executeTakeFirst(),
    db
      .selectFrom("purchase_orders")
      .where("company_id", "=", companyId)
      .where("status", "in", [
        PURCHASE_ORDER_STATUS.DRAFT,
        PURCHASE_ORDER_STATUS.SENT,
        PURCHASE_ORDER_STATUS.PARTIAL_RECEIVED,
      ])
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .executeTakeFirst(),
  ]);

  return {
    overdueInvoices: toCount(overdueInvoicesRow?.count),
    openPurchaseOrders: toCount(openPurchaseOrdersRow?.count),
    pendingApprovals: {
      apiGap: true,
      message: "Approvals workflow not available yet.",
    },
  };
}

export async function getPendingExceptionsSummary(companyId: number): Promise<PendingExceptionsSummary> {
  const db = getDb();

  const [apExceptionsRow, syncErrorsRow] = await Promise.all([
    db
      .selectFrom("ap_exceptions")
      .where("company_id", "=", companyId)
      .where("status", "in", [AP_EXCEPTION_STATUS_OPEN, AP_EXCEPTION_STATUS_ASSIGNED])
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .executeTakeFirst(),
    db
      .selectFrom("operation_progress")
      .where("company_id", "=", companyId)
      .where("status", "=", "failed")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .executeTakeFirst(),
  ]);

  const apExceptions = toCount(apExceptionsRow?.count);
  const syncErrors = toCount(syncErrorsRow?.count);

  return {
    total: apExceptions + syncErrors,
    apExceptions,
    reconciliationMismatches: {
      apiGap: true,
      message: "Reconciliation mismatch source is not available for this dashboard yet.",
    },
    syncErrors,
  };
}
