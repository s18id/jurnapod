// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Variant Sale Processing
 * 
 * Handles variant-level sales from POS sync push.
 * These functions have zero HTTP knowledge.
 * 
 * Processing includes:
 * - Stock deduction for variant
 * - Revenue reporting
 * - COGS calculation
 */

import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { VariantSale, VariantSaleResult } from "@jurnapod/shared";
import { toMysqlDateTime } from "../../../lib/date-helpers.js";

interface VariantSaleProcessingContext {
  dbConnection: PoolConnection;
  companyId: number;
  outletId: number;
  correlationId: string;
  postingMode: string;
}

/**
 * Check if variant exists and belongs to company
 */
async function validateVariant(
  dbConnection: PoolConnection,
  companyId: number,
  variantId: number,
  itemId: number
): Promise<{ valid: boolean; itemCost: number | null; variantCost: number | null; message?: string }> {
  // Check variant exists and belongs to item
  const [variantRows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT iv.id, iv.item_id, iv.stock_quantity, iv.price_override
     FROM item_variants iv
     WHERE iv.id = ? AND iv.company_id = ? AND iv.is_active = TRUE
     LIMIT 1`,
    [variantId, companyId]
  );

  if (variantRows.length === 0) {
    return { valid: false, itemCost: null, variantCost: null, message: `Variant ${variantId} not found or inactive` };
  }

  // Verify variant belongs to the item
  if (Number(variantRows[0].item_id) !== itemId) {
    return { valid: false, itemCost: null, variantCost: null, message: `Variant ${variantId} does not belong to item ${itemId}` };
  }

  // Get item cost for COGS fallback
  const [itemRows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT cost FROM items WHERE id = ? AND company_id = ? LIMIT 1`,
    [itemId, companyId]
  );

  const itemCost = itemRows.length > 0 ? Number(itemRows[0].cost) : null;

  return { 
    valid: true, 
    itemCost, 
    variantCost: null 
  };
}

/**
 * Deduct stock for variant sale
 */
async function deductVariantSaleStock(
  dbConnection: PoolConnection,
  companyId: number,
  outletId: number,
  variantId: number,
  quantity: number
): Promise<{ success: boolean; newStock: number; message?: string }> {
  // First check if there's variant-specific stock in inventory_stock
  const [stockRows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT quantity, available_quantity 
     FROM inventory_stock 
     WHERE company_id = ? AND variant_id = ? AND outlet_id = ?
     LIMIT 1
     FOR UPDATE`,
    [companyId, variantId, outletId]
  );

  if (stockRows.length > 0) {
    const currentQty = Number(stockRows[0].quantity);
    const currentAvailable = Number(stockRows[0].available_quantity);
    const newQty = currentQty - quantity;
    const newAvailable = currentAvailable - quantity;

    if (newQty < 0) {
      return { success: false, newStock: currentQty, message: `Insufficient stock for variant ${variantId}: ${currentQty} < ${quantity}` };
    }

    // Update inventory_stock
    await dbConnection.execute(
      `UPDATE inventory_stock 
       SET quantity = ?, available_quantity = ?, updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ? AND variant_id = ? AND outlet_id = ?`,
      [newQty, newAvailable, companyId, variantId, outletId]
    );

    // Also update item_variants.stock_quantity as source of truth
    await dbConnection.execute(
      `UPDATE item_variants SET stock_quantity = ? WHERE id = ? AND company_id = ?`,
      [newQty, variantId, companyId]
    );

    return { success: true, newStock: newQty };
  }

  // Fallback to item_variants.stock_quantity
  const [variantRows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT stock_quantity FROM item_variants
     WHERE id = ? AND company_id = ? AND is_active = TRUE
     FOR UPDATE`,
    [variantId, companyId]
  );

  if (variantRows.length === 0) {
    return { success: false, newStock: 0, message: `Variant ${variantId} not found or inactive` };
  }

  const currentStock = Number(variantRows[0].stock_quantity);
  const newStock = currentStock - quantity;

  if (newStock < 0) {
    return { success: false, newStock: currentStock, message: `Insufficient stock for variant ${variantId}: ${currentStock} < ${quantity}` };
  }

  await dbConnection.execute(
    `UPDATE item_variants
     SET stock_quantity = ?
     WHERE id = ? AND company_id = ?`,
    [newStock, variantId, companyId]
  );

  // Also create inventory_stock record for future tracking
  await dbConnection.execute(
    `INSERT INTO inventory_stock (company_id, outlet_id, product_id, variant_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
     SELECT company_id, ?, item_id, id, stock_quantity, 0, stock_quantity, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     FROM item_variants WHERE id = ? AND company_id = ?
     ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), available_quantity = VALUES(available_quantity)`,
    [outletId, variantId, companyId]
  );

  return { success: true, newStock };
}

/**
 * Get variant cost for COGS calculation
 */
async function getVariantCost(
  dbConnection: PoolConnection,
  companyId: number,
  variantId: number,
  itemId: number
): Promise<number> {
  // First try to get variant-specific cost (if we add cost field to item_variants)
  // For now, fall back to item cost
  const [itemRows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT cost FROM items WHERE id = ? AND company_id = ? LIMIT 1`,
    [itemId, companyId]
  );

  if (itemRows.length > 0 && itemRows[0].cost !== null) {
    return Number(itemRows[0].cost);
  }

  return 0;
}

/**
 * Check for duplicate variant sale (idempotency)
 */
async function checkDuplicateVariantSale(
  dbConnection: PoolConnection,
  companyId: number,
  outletId: number,
  clientTxId: string
): Promise<{ isDuplicate: boolean; existingId?: number }> {
  const [rows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT id FROM variant_sales 
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
 * Process a single variant sale
 */
export async function processVariantSale(
  context: VariantSaleProcessingContext,
  sale: VariantSale
): Promise<VariantSaleResult> {
  const { dbConnection, companyId, outletId, correlationId, postingMode } = context;

  try {
    // Validate company_id matches
    if (sale.company_id !== companyId) {
      return {
        client_tx_id: sale.client_tx_id,
        result: "ERROR",
        message: "company_id mismatch"
      };
    }

    // Validate outlet_id matches
    if (sale.outlet_id !== outletId) {
      return {
        client_tx_id: sale.client_tx_id,
        result: "ERROR",
        message: "outlet_id mismatch"
      };
    }

    // Check for duplicate (idempotency)
    const duplicateCheck = await checkDuplicateVariantSale(dbConnection, companyId, outletId, sale.client_tx_id);
    if (duplicateCheck.isDuplicate) {
      return {
        client_tx_id: sale.client_tx_id,
        result: "DUPLICATE"
      };
    }

    // Validate variant exists and belongs to item
    const validation = await validateVariant(dbConnection, companyId, sale.variant_id, sale.item_id);
    if (!validation.valid) {
      return {
        client_tx_id: sale.client_tx_id,
        result: "ERROR",
        message: validation.message
      };
    }

    // Validate stock availability
    const stockResult = await deductVariantSaleStock(dbConnection, companyId, outletId, sale.variant_id, sale.qty);
    if (!stockResult.success) {
      return {
        client_tx_id: sale.client_tx_id,
        result: "ERROR",
        message: stockResult.message
      };
    }

    // Insert variant sale record
    const trxAtCanonical = toMysqlDateTime(sale.trx_at);
    await dbConnection.execute(
      `INSERT INTO variant_sales (
         company_id,
         outlet_id,
         client_tx_id,
         variant_id,
         item_id,
         qty,
         unit_price,
         total_amount,
         trx_at,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        companyId,
        outletId,
        sale.client_tx_id,
        sale.variant_id,
        sale.item_id,
        sale.qty,
        sale.unit_price,
        sale.total_amount,
        trxAtCanonical
      ]
    );

    // Post COGS if enabled
    if (postingMode === "active") {
      const isCogsEnabled = await isCogsFeatureEnabled(dbConnection, companyId);
      if (isCogsEnabled) {
        const unitCost = await getVariantCost(dbConnection, companyId, sale.variant_id, sale.item_id);
        if (unitCost > 0) {
          await postCogsForVariantSale(
            dbConnection,
            companyId,
            outletId,
            sale.variant_id,
            sale.item_id,
            sale.qty,
            unitCost,
            sale.total_amount,
            trxAtCanonical
          );
        }
      }
    }

    console.info("Variant sale processed", {
      correlation_id: correlationId,
      client_tx_id: sale.client_tx_id,
      variant_id: sale.variant_id,
      qty: sale.qty,
      new_stock: stockResult.newStock
    });

    return {
      client_tx_id: sale.client_tx_id,
      result: "OK"
    };
  } catch (error) {
    console.error("Variant sale processing failed", {
      correlation_id: correlationId,
      client_tx_id: sale.client_tx_id,
      error
    });

    return {
      client_tx_id: sale.client_tx_id,
      result: "ERROR",
      message: error instanceof Error ? error.message : "Processing failed"
    };
  }
}

/**
 * Check if COGS feature is enabled for company
 */
async function isCogsFeatureEnabled(
  dbConnection: PoolConnection,
  companyId: number
): Promise<boolean> {
  const [rows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT cm.enabled, cm.config_json
     FROM company_modules cm
     INNER JOIN modules m ON m.id = cm.module_id
     WHERE cm.company_id = ?
       AND m.code = 'inventory'
     LIMIT 1`,
    [companyId]
  );

  const moduleRow = rows[0];
  if (!moduleRow || Number(moduleRow.enabled) !== 1) {
    return false;
  }

  if (typeof moduleRow.config_json !== "string" || moduleRow.config_json.trim().length === 0) {
    return false;
  }

  try {
    const parsed = JSON.parse(moduleRow.config_json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }

    const cogsEnabled = (parsed as Record<string, unknown>).cogs_enabled;
    return cogsEnabled === true || cogsEnabled === 1 || cogsEnabled === "1" || cogsEnabled === "true";
  } catch {
    return false;
  }
}

/**
 * Post COGS for variant sale
 */
async function postCogsForVariantSale(
  dbConnection: PoolConnection,
  companyId: number,
  outletId: number,
  variantId: number,
  itemId: number,
  quantity: number,
  unitCost: number,
  totalAmount: number,
  saleDate: string
): Promise<void> {
  const totalCost = quantity * unitCost;

  // Get COGS and inventory account IDs
  const [accountRows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT id FROM accounts 
     WHERE company_id = ? AND type = 'EXPENSE' AND code IN ('COGS', 'COGS_EXPENSE')
     LIMIT 1`,
    [companyId]
  );

  const [inventoryRows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT id FROM accounts 
     WHERE company_id = ? AND type = 'ASSET' AND code IN ('INVENTORY', 'INVENTORY_ASSET')
     LIMIT 1`,
    [companyId]
  );

  if (accountRows.length === 0 || inventoryRows.length === 0) {
    console.warn("COGS accounts not found, skipping COGS posting", { companyId });
    return;
  }

  const cogsAccountId = Number(accountRows[0].id);
  const inventoryAccountId = Number(inventoryRows[0].id);

  // Create journal entry for COGS
  await dbConnection.execute(
    `INSERT INTO journal_entries (
       company_id,
       outlet_id,
       doc_type,
       doc_id,
       entry_no,
       account_id,
       debit,
       credit,
       memo,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      companyId,
      outletId,
      "VARIANT_SALE",
      variantId,
      1, // debit entry
      cogsAccountId,
      totalCost,
      0,
      `Variant ${variantId} COGS`
    ]
  );

  await dbConnection.execute(
    `INSERT INTO journal_entries (
       company_id,
       outlet_id,
       doc_type,
       doc_id,
       entry_no,
       account_id,
       debit,
       credit,
       memo,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      companyId,
      outletId,
      "VARIANT_SALE",
      variantId,
      2, // credit entry
      inventoryAccountId,
      0,
      totalCost,
      `Variant ${variantId} inventory reduction`
    ]
  );
}

/**
 * Process multiple variant sales
 */
export async function processVariantSales(
  context: VariantSaleProcessingContext,
  sales: VariantSale[]
): Promise<VariantSaleResult[]> {
  const results: VariantSaleResult[] = [];

  for (const sale of sales) {
    const result = await processVariantSale(context, sale);
    results.push(result);
  }

  return results;
}