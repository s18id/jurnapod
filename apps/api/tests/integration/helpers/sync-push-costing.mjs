// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Integration Test Costing/COGS Helpers
 *
 * Inventory, cost layers, COGS accounts, and C7 assertions.
 */

import { randomUUID } from "node:crypto";
import { POS_SALE_DOC_TYPE } from "./sync-push-db.mjs";

/**
 * Cleanup inventory transactions and cost artifacts for a client_tx_id
 * Extends cleanupSyncPushPersistedArtifacts for Scope C
 */
export async function cleanupInventoryAndCostArtifacts(db, clientTxId) {
  // Get transaction IDs first for cleanup queries
  const [txRows] = await db.execute(
    `SELECT id FROM inventory_transactions WHERE reference_id = ?`,
    [clientTxId]
  );
  const transactionIds = txRows.map((row) => row.id);

  if (transactionIds.length > 0) {
    const placeholders = transactionIds.map(() => "?").join(", ");

    // Restore remaining_qty on cost layers BEFORE deleting consumption records
    await db.execute(
      `UPDATE inventory_cost_layers cl
       INNER JOIN cost_layer_consumption clc ON clc.layer_id = cl.id
       SET cl.remaining_qty = cl.remaining_qty + clc.consumed_qty
       WHERE clc.transaction_id IN (${placeholders})`,
      transactionIds
    );

    // Delete cost layer consumption records (FK to inventory_transactions)
    await db.execute(
      `DELETE FROM cost_layer_consumption WHERE transaction_id IN (${placeholders})`,
      transactionIds
    );

    // Note: We intentionally DON'T delete cost layers or item costs here
    // because they may be shared across multiple tests. The test-specific
    // item cleanup should handle those.
  }

  // Delete inventory transactions
  await db.execute(
    `DELETE FROM inventory_transactions WHERE reference_id = ?`,
    [clientTxId]
  );
}

/**
 * Setup test item with stock tracking and cost basis
 * Returns the created item ID
 */
export async function setupTrackedItemWithCost(db, companyId, outletId, itemSuffix) {
  const itemCode = `COGS_TEST_${itemSuffix}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;

  // Create tracked item
  const [itemResult] = await db.execute(
    `INSERT INTO items (company_id, sku, name, item_type, is_active, track_stock, created_at, updated_at)
     VALUES (?, ?, ?, 'PRODUCT', 1, 1, NOW(), NOW())`,
    [companyId, itemCode, `COGS Test Item ${itemSuffix}`]
  );
  const itemId = Number(itemResult.insertId);

  // Set up stock for the item
  await db.execute(
    `INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
     VALUES (?, ?, ?, 100.0000, 0.0000, 100.0000, NOW(), NOW())
     ON DUPLICATE KEY UPDATE quantity = 100.0000, available_quantity = 100.0000`,
    [companyId, outletId, itemId]
  );

  // Set up cost basis (create inbound receipt transaction + cost layer)
  const [receiptTx] = await db.execute(
    `INSERT INTO inventory_transactions 
     (company_id, outlet_id, product_id, transaction_type, quantity_delta, reference_type, reference_id, created_at)
     VALUES (?, ?, ?, 6, 100.0000, 'RECEIPT', ?, NOW())`,
    [companyId, outletId, itemId, `cogs-setup-${itemSuffix}`]
  );

  await db.execute(
    `INSERT INTO inventory_cost_layers 
     (company_id, item_id, transaction_id, unit_cost, original_qty, remaining_qty, acquired_at)
     VALUES (?, ?, ?, 10.00, 100.0000, 100.0000, NOW())`,
    [companyId, itemId, receiptTx.insertId]
  );

  // Update cost summary
  await db.execute(
    `INSERT INTO inventory_item_costs
     (company_id, item_id, costing_method, current_avg_cost, total_layers_qty, total_layers_cost)
     VALUES (?, ?, 'FIFO', 10.00, 100.0000, 1000.00)
     ON DUPLICATE KEY UPDATE
     current_avg_cost = 10.00, total_layers_qty = 100.0000, total_layers_cost = 1000.00`,
    [companyId, itemId]
  );

  // Set company costing method to FIFO so calculateCost uses FIFOCostingStrategy,
  // which records cost_layer_consumption entries (AVG strategy does not).
  await db.execute(
    `INSERT INTO company_settings (company_id, outlet_id, \`key\`, value_type, value_json, created_at, updated_at)
     VALUES (?, NULL, 'inventory.costing_method', 'STRING', '"FIFO"', NOW(), NOW())
     ON DUPLICATE KEY UPDATE value_json = '"FIFO"'`,
    [companyId]
  );

  return itemId;
}

/**
 * Setup COGS accounts for company
 * Returns account IDs needed for COGS posting
 */
export async function setupCogsAccounts(db, companyId) {
  // Create COGS expense account
  const [cogsAccountResult] = await db.execute(
    `INSERT INTO accounts (company_id, code, name, account_type_id, created_at, updated_at)
     SELECT ?, ?, ?, at.id, NOW(), NOW()
     FROM account_types at WHERE at.name = 'EXPENSE'
     LIMIT 1`,
    [companyId, `COGS_${randomUUID().replace(/-/g, "").slice(0, 8)}`, 'COGS Test Account']
  );
  const cogsAccountId = Number(cogsAccountResult.insertId);

  // Create inventory asset account
  const [invAccountResult] = await db.execute(
    `INSERT INTO accounts (company_id, code, name, account_type_id, created_at, updated_at)
     SELECT ?, ?, ?, at.id, NOW(), NOW()
     FROM account_types at WHERE at.name = 'ASSET'
     LIMIT 1`,
    [companyId, `INV_${randomUUID().replace(/-/g, "").slice(0, 8)}`, 'Inventory Asset Test Account']
  );
  const inventoryAssetAccountId = Number(invAccountResult.insertId);

  // Set company defaults
  await db.execute(
    `INSERT INTO company_account_mappings (company_id, mapping_key, account_id, created_at, updated_at)
     VALUES (?, 'COGS_DEFAULT', ?, NOW(), NOW()),
            (?, 'INVENTORY_ASSET_DEFAULT', ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE account_id = VALUES(account_id)`,
    [companyId, cogsAccountId, companyId, inventoryAssetAccountId]
  );

  return { cogsAccountId, inventoryAssetAccountId };
}

/**
 * Enable COGS feature for company
 */
export async function enableCogsFeature(db, companyId) {
  // Ensure inventory module exists and is enabled with cogs_enabled
  await db.execute(
    `INSERT INTO modules (code, name, description, created_at, updated_at)
     VALUES ('inventory', 'Inventory', 'Inventory management', NOW(), NOW())
     ON DUPLICATE KEY UPDATE name = 'Inventory'`
  );

  const [moduleRows] = await db.execute(`SELECT id FROM modules WHERE code = 'inventory'`);
  const moduleId = moduleRows[0]?.id;

  if (!moduleId) {
    throw new Error('Inventory module not found');
  }

  await db.execute(
    `INSERT INTO company_modules (company_id, module_id, enabled, config_json, created_at, updated_at)
     VALUES (?, ?, 1, '{"cogs_enabled": true}', NOW(), NOW())
     ON DUPLICATE KEY UPDATE 
     enabled = 1, 
     config_json = '{"cogs_enabled": true}'`,
    [companyId, moduleId]
  );
}

/**
 * Disable COGS feature for company
 */
export async function disableCogsFeature(db, companyId) {
  const [moduleRows] = await db.execute(`SELECT id FROM modules WHERE code = 'inventory'`);
  const moduleId = moduleRows[0]?.id;

  if (!moduleId) {
    return;
  }

  await db.execute(
    `UPDATE company_modules 
     SET config_json = '{"cogs_enabled": false}'
     WHERE company_id = ? AND module_id = ?`,
    [companyId, moduleId]
  );
}

/**
 * Cleanup test accounts created for COGS
 */
export async function cleanupCogsAccounts(db, companyId) {
  await db.execute(
    `DELETE FROM company_account_mappings
     WHERE company_id = ? AND mapping_key IN ('COGS_DEFAULT', 'INVENTORY_ASSET_DEFAULT')`,
    [companyId]
  );

  // Only delete test accounts that have no journal lines referencing them
  // (journal_lines are immutable by DB trigger and cannot be deleted)
  await db.execute(
    `DELETE FROM accounts
     WHERE company_id = ?
       AND name IN ('COGS Test Account', 'Inventory Asset Test Account')
       AND id NOT IN (SELECT DISTINCT account_id FROM journal_lines WHERE account_id IS NOT NULL)`,
    [companyId]
  );
}

/**
 * Cleanup tracked items and their cost artifacts
 */
export async function cleanupTrackedItems(db, companyId, itemIds) {
  if (!itemIds || itemIds.length === 0) {
    return;
  }

  const placeholders = itemIds.map(() => "?").join(", ");

  // Delete cost layer consumption records for these items
  await db.execute(
    `DELETE clc FROM cost_layer_consumption clc
     INNER JOIN inventory_transactions it ON it.id = clc.transaction_id
     WHERE it.product_id IN (${placeholders})`,
    itemIds
  );

  // Delete cost layers
  await db.execute(
    `DELETE FROM inventory_cost_layers WHERE company_id = ? AND item_id IN (${placeholders})`,
    [companyId, ...itemIds]
  );

  // Delete cost summary
  await db.execute(
    `DELETE FROM inventory_item_costs WHERE company_id = ? AND item_id IN (${placeholders})`,
    [companyId, ...itemIds]
  );

  // Delete inventory transactions
  await db.execute(
    `DELETE FROM inventory_transactions WHERE company_id = ? AND product_id IN (${placeholders})`,
    [companyId, ...itemIds]
  );

  // Delete stock records
  await db.execute(
    `DELETE FROM inventory_stock WHERE company_id = ? AND product_id IN (${placeholders})`,
    [companyId, ...itemIds]
  );

  // Delete items
  await db.execute(
    `DELETE FROM items WHERE company_id = ? AND id IN (${placeholders})`,
    [companyId, ...itemIds]
  );

  // Remove FIFO costing method setting inserted by setupTrackedItemWithCost
  await db.execute(
    `DELETE FROM company_settings
     WHERE company_id = ? AND outlet_id IS NULL AND \`key\` = 'inventory.costing_method'`,
    [companyId]
  );
}

/**
 * Count COGS journal entries for a client_tx_id
 */
export async function countCogsJournalRows(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT
       (SELECT COUNT(*) FROM journal_batches jb
        INNER JOIN pos_transactions pt ON pt.id = jb.doc_id
        WHERE jb.doc_type = 'COGS'
          AND pt.client_tx_id = ?) AS cogs_batch_total,
       (SELECT COUNT(*) FROM journal_lines jl
        INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
        INNER JOIN pos_transactions pt ON pt.id = jb.doc_id
        WHERE jb.doc_type = 'COGS'
          AND pt.client_tx_id = ?) AS cogs_line_total`,
    [clientTxId, clientTxId]
  );

  return {
    batch_total: Number(rows[0].cogs_batch_total),
    line_total: Number(rows[0].cogs_line_total)
  };
}

/**
 * Get stock quantity for a product
 */
export async function getProductStockQuantity(db, companyId, outletId, productId) {
  const [rows] = await db.execute(
    `SELECT quantity FROM inventory_stock
     WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
    [companyId, outletId, productId]
  );

  return rows.length > 0 ? Number(rows[0].quantity) : null;
}

/**
 * Get inventory transactions for a client_tx_id
 */
export async function getInventoryTransactions(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT id, product_id, quantity_delta, transaction_type, journal_batch_id
     FROM inventory_transactions
     WHERE reference_id = ?
     ORDER BY id`,
    [clientTxId]
  );

  return rows;
}

/**
 * Get cost layer consumption for a transaction ID
 */
export async function getCostLayerConsumption(db, transactionId) {
  const [rows] = await db.execute(
    `SELECT id, layer_id, consumed_qty, unit_cost
     FROM cost_layer_consumption
     WHERE transaction_id = ?`,
    [transactionId]
  );

  return rows;
}

/**
 * Verify COGS journal balance
 */
export async function verifyCogsJournalBalance(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN jl.debit > 0 THEN jl.debit ELSE 0 END), 0) AS total_debits,
       COALESCE(SUM(CASE WHEN jl.credit > 0 THEN jl.credit ELSE 0 END), 0) AS total_credits
     FROM journal_lines jl
     INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
     INNER JOIN pos_transactions pt ON pt.id = jb.doc_id
     WHERE jb.doc_type = 'COGS'
       AND pt.client_tx_id = ?`,
    [clientTxId]
  );

  const totalDebits = Number(rows[0].total_debits);
  const totalCredits = Number(rows[0].total_credits);

  return {
    balanced: Math.abs(totalDebits - totalCredits) < 0.01, // Allow small rounding differences
    totalDebits,
    totalCredits
  };
}

/**
 * Build sync transaction with specific items
 * Override the default items in buildSyncTransaction
 */
export function buildSyncTransactionWithItems({ clientTxId, companyId, outletId, cashierUserId, trxAt, items, payments }) {
  return {
    client_tx_id: clientTxId,
    company_id: companyId,
    outlet_id: outletId,
    cashier_user_id: cashierUserId,
    status: "COMPLETED",
    trx_at: trxAt,
    items: items.map((item, index) => ({
      item_id: item.itemId,
      qty: item.qty,
      price_snapshot: item.price ?? 12500,
      name_snapshot: item.name ?? `Test Item ${index + 1}`
    })),
    payments: payments ?? [
      {
        method: "CASH",
        amount: items.reduce((sum, item) => sum + (item.price ?? 12500) * item.qty, 0)
      }
    ]
  };
}
