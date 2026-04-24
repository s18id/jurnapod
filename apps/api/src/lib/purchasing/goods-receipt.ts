// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Goods Receipt API adapter — delegates to @jurnapod/modules-purchasing.
 *
 * This file is a delegate-only adapter. All business logic lives in
 * packages/modules/purchasing/src/services/goods-receipt-service.ts.
 */

import { getDb } from "../db.js";
import type { KyselySchema } from "@jurnapod/db";
import {
  GoodsReceiptService,
  type GoodsReceiptResult,
  type ListGoodsReceiptsParams,
  type ListGoodsReceiptsResult,
  type CreateGoodsReceiptResult,
} from "@jurnapod/modules-purchasing";
import type { GoodsReceiptCreate } from "@jurnapod/shared";

// Build a service instance from the current request-scoped db
function buildService() {
  const db = getDb() as KyselySchema;
  return new GoodsReceiptService(db);
}

export async function listGoodsReceipts(
  params: ListGoodsReceiptsParams
): Promise<ListGoodsReceiptsResult> {
  const service = buildService();
  return service.listGoodsReceipts(params);
}

export async function getGoodsReceiptById(
  companyId: number,
  receiptId: number
): Promise<GoodsReceiptResult | null> {
  const service = buildService();
  return service.getGoodsReceiptById(companyId, receiptId);
}

export async function createGoodsReceipt(
  companyId: number,
  userId: number,
  input: GoodsReceiptCreate
): Promise<CreateGoodsReceiptResult> {
  const service = buildService();
  return service.createGoodsReceipt(companyId, userId, input);
}
