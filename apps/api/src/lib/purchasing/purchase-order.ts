// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase Order API adapter — delegates to @jurnapod/modules-purchasing.
 *
 * This file is a delegate-only adapter. All business logic lives in
 * packages/modules/purchasing/src/services/purchase-order-service.ts.
 */

import { getDb } from "../../lib/db.js";
import type { KyselySchema } from "@jurnapod/db";
import {
  PurchaseOrderService,
  type POResponse,
  type ListPurchaseOrdersResult,
  VALID_TRANSITIONS,
  computeLineTotal,
  computeTotalAmount,
} from "@jurnapod/modules-purchasing";

// Re-export shared constants for backward compatibility
export { computeLineTotal, computeTotalAmount, VALID_TRANSITIONS };

// Build a service instance from the current request-scoped db
function buildService() {
  const db = getDb() as KyselySchema;
  return new PurchaseOrderService(db);
}

export async function listPurchaseOrders(input: {
  companyId: number;
  filters: {
    supplierId?: number;
    status?: number;
    dateFrom?: string;
    dateTo?: string;
  };
  limit: number;
  offset: number;
}): Promise<ListPurchaseOrdersResult> {
  const service = buildService();
  return service.listPurchaseOrders(input);
}

export async function getPurchaseOrderById(input: {
  companyId: number;
  orderId: number;
}): Promise<POResponse | null> {
  const service = buildService();
  return service.getPurchaseOrderById(input.companyId, input.orderId);
}

export async function createPurchaseOrder(input: {
  companyId: number;
  userId: number;
  idempotencyKey?: string | null;
  supplierId: number;
  orderDate: Date;
  expectedDate?: Date;
  notes?: string;
  currencyCode?: string;
  lines: Array<{
    item_id?: number;
    description?: string;
    qty: string;
    unit_price: string;
    tax_rate?: string;
  }>;
}): Promise<POResponse> {
  const service = buildService();
  const result = await service.createPurchaseOrder(input);
  return result.receipt;
}

export async function updatePurchaseOrder(input: {
  companyId: number;
  userId: number;
  orderId: number;
  notes?: string;
  expectedDate?: Date;
  lines?: Array<{
    item_id?: number;
    description?: string;
    qty: string;
    unit_price: string;
    tax_rate?: string;
  }>;
}): Promise<POResponse | null> {
  const service = buildService();
  const result = await service.updatePurchaseOrder(input);
  return result ? result.receipt : null;
}

export async function transitionPurchaseOrderStatus(input: {
  companyId: number;
  userId: number;
  orderId: number;
  newStatus: number;
}): Promise<POResponse | null> {
  const service = buildService();
  const result = await service.transitionPurchaseOrderStatus(input);
  return result ? result.receipt : null;
}
