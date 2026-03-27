// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Variant Stock Adjustment Processing
 * 
 * Handles variant-level stock adjustments from POS sync push.
 * These functions have zero HTTP knowledge.
 */

import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { VariantStockAdjustment, VariantStockAdjustmentResult } from "@jurnapod/shared";
import { toMysqlDateTime } from "../../../lib/date-helpers.js";

interface VariantStockAdjustmentContext {
  dbConnection: PoolConnection;
  companyId: number;
  outletId: number;
  correlationId: string;
}

/**
 * Validate variant exists and belongs to company
 */
async function validateVariantForAdjustment(
  dbConnection: PoolConnection,
  companyId: number,
  variantId: number
): Promise<{ valid: boolean; currentStock: number; message?: string }> {
  const [variantRows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT iv.id, iv.stock_quantity, iv.item_id
     FROM item_variants iv
     WHERE iv.id = ? AND iv.company_id = ? AND iv.is_active = TRUE
     LIMIT 1`,
    [variantId, companyId]
  );

  if (variantRows.length === 0) {
    return { valid: false, currentStock: 0, message: `Variant ${variantId} not found or inactive` };
  }

  return { 
    valid: true, 
    currentStock: Number(variantRows[0].stock_quantity)
  };
}

/**
 * Check for duplicate adjustment (idempotency)
 */
async function checkDuplicateAdjustment(
  dbConnection: PoolConnection,
  companyId: number,
  outletId: number,
  clientTxId: string
): Promise<{ isDuplicate: boolean; existingId?: number }> {
  const [rows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT id FROM variant_stock_adjustments 
     WHERE company_id = ? AND outlet_id = ? AND client_tx_id = ?
     LIMIT 1`,
    [companyId, outletId, clientTxId]
  );

  if (rows.length > 0) {
    return { isDuplicate: true, existingId: Number(rows[0].id) };
  }

  return { isDuplicate: false };
}

/**
 * Apply stock adjustment to variant
 */
async function applyStockAdjustment(
  dbConnection: PoolConnection,
  companyId: number,
  variantId: number,
  adjustmentType: "INCREASE" | "DECREASE" | "SET",
  quantity: number,
  currentStock: number
): Promise<{ success: boolean; newStock: number; message?: string }> {
  let newStock: number;

  switch (adjustmentType) {
    case "INCREASE":
      newStock = currentStock + quantity;
      break;
    case "DECREASE":
      newStock = currentStock - quantity;
      if (newStock < 0) {
        return { 
          success: false, 
          newStock: currentStock, 
          message: `Insufficient stock for variant ${variantId}: ${currentStock} < ${quantity}` 
        };
      }
      break;
    case "SET":
      newStock = quantity;
      break;
    default:
      return { 
        success: false, 
        newStock: currentStock, 
        message: `Invalid adjustment type: ${adjustmentType}` 
      };
  }

  // Update item_variants.stock_quantity
  await dbConnection.execute(
    `UPDATE item_variants 
     SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND company_id = ?`,
    [newStock, variantId, companyId]
  );

  // Sync to inventory_stock if exists
  await dbConnection.execute(
    `UPDATE inventory_stock 
     SET quantity = ?, available_quantity = ?, updated_at = CURRENT_TIMESTAMP
     WHERE company_id = ? AND variant_id = ?`,
    [newStock, newStock, companyId, variantId]
  );

  return { success: true, newStock };
}

/**
 * Process a single variant stock adjustment
 */
export async function processVariantStockAdjustment(
  context: VariantStockAdjustmentContext,
  adjustment: VariantStockAdjustment
): Promise<VariantStockAdjustmentResult> {
  const { dbConnection, companyId, outletId, correlationId } = context;

  try {
    // Validate company_id matches
    if (adjustment.company_id !== companyId) {
      return {
        client_tx_id: adjustment.client_tx_id,
        result: "ERROR",
        message: "company_id mismatch"
      };
    }

    // Validate outlet_id matches
    if (adjustment.outlet_id !== outletId) {
      return {
        client_tx_id: adjustment.client_tx_id,
        result: "ERROR",
        message: "outlet_id mismatch"
      };
    }

    // Validate adjustment_type
    if (!["INCREASE", "DECREASE", "SET"].includes(adjustment.adjustment_type)) {
      return {
        client_tx_id: adjustment.client_tx_id,
        result: "ERROR",
        message: "Invalid adjustment_type"
      };
    }

    // Check for duplicate (idempotency)
    const duplicateCheck = await checkDuplicateAdjustment(dbConnection, companyId, outletId, adjustment.client_tx_id);
    if (duplicateCheck.isDuplicate) {
      return {
        client_tx_id: adjustment.client_tx_id,
        result: "DUPLICATE"
      };
    }

    // Validate variant exists
    const validation = await validateVariantForAdjustment(dbConnection, companyId, adjustment.variant_id);
    if (!validation.valid) {
      return {
        client_tx_id: adjustment.client_tx_id,
        result: "ERROR",
        message: validation.message
      };
    }

    // Apply stock adjustment
    const adjustmentResult = await applyStockAdjustment(
      dbConnection,
      companyId,
      adjustment.variant_id,
      adjustment.adjustment_type,
      adjustment.quantity,
      validation.currentStock
    );

    if (!adjustmentResult.success) {
      return {
        client_tx_id: adjustment.client_tx_id,
        result: "ERROR",
        message: adjustmentResult.message
      };
    }

    // Insert stock adjustment record
    const adjustedAtCanonical = toMysqlDateTime(adjustment.adjusted_at);
    await dbConnection.execute(
      `INSERT INTO variant_stock_adjustments (
         company_id,
         outlet_id,
         client_tx_id,
         variant_id,
         adjustment_type,
         quantity,
         previous_stock,
         new_stock,
         reason,
         reference,
         adjusted_at,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        companyId,
        outletId,
        adjustment.client_tx_id,
        adjustment.variant_id,
        adjustment.adjustment_type,
        adjustment.quantity,
        validation.currentStock,
        adjustmentResult.newStock,
        adjustment.reason,
        adjustment.reference ?? null,
        adjustedAtCanonical
      ]
    );

    console.info("Variant stock adjustment processed", {
      correlation_id: correlationId,
      client_tx_id: adjustment.client_tx_id,
      variant_id: adjustment.variant_id,
      adjustment_type: adjustment.adjustment_type,
      quantity: adjustment.quantity,
      previous_stock: validation.currentStock,
      new_stock: adjustmentResult.newStock
    });

    return {
      client_tx_id: adjustment.client_tx_id,
      result: "OK"
    };
  } catch (error) {
    console.error("Variant stock adjustment processing failed", {
      correlation_id: correlationId,
      client_tx_id: adjustment.client_tx_id,
      error
    });

    return {
      client_tx_id: adjustment.client_tx_id,
      result: "ERROR",
      message: error instanceof Error ? error.message : "Processing failed"
    };
  }
}

/**
 * Process multiple variant stock adjustments
 */
export async function processVariantStockAdjustments(
  context: VariantStockAdjustmentContext,
  adjustments: VariantStockAdjustment[]
): Promise<VariantStockAdjustmentResult[]> {
  const results: VariantStockAdjustmentResult[] = [];

  for (const adjustment of adjustments) {
    const result = await processVariantStockAdjustment(context, adjustment);
    results.push(result);
  }

  return results;
}