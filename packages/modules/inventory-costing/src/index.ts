// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * @jurnapod/modules-inventory-costing
 * 
 * Inventory costing engine supporting AVG, FIFO, and LIFO cost methods.
 * 
 * ## Public API Summary
 * 
 * **Cost Layer Management:**
 * - `createCostLayer(params, db)` - Creates a new cost layer for acquired inventory
 * - `getItemCostLayers(companyId, itemId, db)` - Returns all cost layers for an item
 * - `getItemCostLayersWithConsumption(companyId, itemId, db)` - Returns layers with consumption history for audit
 * 
 * **Cost Calculation:**
 * - `calculateCost(input, db)` - Calculates cost for consuming inventory (routes to AVG/FIFO/LIFO)
 * - `getCompanyCostingMethod(companyId, db)` - Returns the configured costing method for a company
 * 
 * **Cost Summary:**
 * - `getItemCostSummary(companyId, itemId, db)` - Returns cost summary (avg cost, total qty, total value)
 * - `getItemCostSummaryExtended(companyId, itemId, db)` - Returns extended summary with method-specific details
 * 
 * **Primary Contract (COGS-aware deduction):**
 * - `deductWithCost(companyId, items, db)` - Atomically deducts inventory with cost calculation
 * 
 * **Types:** `CostingMethod`, `CostLayer`, `CostCalculationInput`, `CostCalculationResult`, `DeductionResult`, etc.
 * **Errors:** `CostTrackingError`, `InsufficientInventoryError`, `InvalidCostingMethodError`
 * 
 * ## Dependency Direction
 * 
 * This package is at the boundary between `modules-inventory` and `modules-accounting`:
 * - modules-inventory → modules-inventory-costing (for cost-aware stock deduction)
 * - modules-accounting → modules-inventory-costing (for COGS calculation during posting)
 * 
 * Database-agnostic: accepts a Kysely DB executor injected from the caller.
 */

import { sql } from "kysely"; // Still used for cost layer queries
import type { KyselySchema } from "@jurnapod/db";
import { nowUTC, toUtcIso } from "@jurnapod/shared";

import {
  CostingMethod,
  CostLayer,
  CostCalculationInput,
  CostCalculationResult,
  ConsumedLayer,
  ItemCostSummary,
  DeductionInput,
  DeductionResult,
  ItemCostResult,
  CostLayerWithConsumption,
  ItemCostSummaryExtended,
  CostTrackingError,
  InsufficientInventoryError,
  InvalidCostingMethodError,
  toMinorUnits,
  fromMinorUnits,
} from "./types/costing.js";

import { KyselySettingsAdapter, type SettingsPort } from "@jurnapod/modules-platform/settings";

// -----------------------------------------------------------------------------
// Internal Row Types
// -----------------------------------------------------------------------------

interface CostSummaryRow {
  costing_method: string;
  current_avg_cost: string | null;
  total_layers_qty: number;
  total_layers_cost: number;
}

interface InventoryLayerRow {
  id: number;
  remaining_qty: string;
  unit_cost: string;
  company_id: number;
  item_id: number;
  transaction_id: number;
  original_qty: string;
  acquired_at: Date;
  transaction_reference_id?: number | null;
}

// -----------------------------------------------------------------------------
// Transaction Helper
// -----------------------------------------------------------------------------

async function withExecutorTransaction<T>(
  db: KyselySchema,
  callback: (executor: KyselySchema) => Promise<T>
): Promise<T> {
  if (db.isTransaction) {
    return callback(db);
  }

  return db.transaction().execute(async (trx) => callback(trx as unknown as KyselySchema));
}

// -----------------------------------------------------------------------------
// Costing Strategy Interface
// -----------------------------------------------------------------------------

interface CostingStrategy {
  calculateCost(
    input: CostCalculationInput,
    db: KyselySchema
  ): Promise<CostCalculationResult>;
}

// -----------------------------------------------------------------------------
// Input Validation
// -----------------------------------------------------------------------------

function validateInput(input: CostCalculationInput): void {
  if (input.quantity <= 0) {
    throw new CostTrackingError(`Invalid quantity: ${input.quantity}. Must be positive.`);
  }
}

// -----------------------------------------------------------------------------
// AVG Strategy Implementation
// -----------------------------------------------------------------------------

class AVGCostingStrategy implements CostingStrategy {
  async calculateCost(
    input: CostCalculationInput,
    db: KyselySchema
  ): Promise<CostCalculationResult> {
    // Lock summary row to prevent concurrent updates
    const summaryRows = await sql<CostSummaryRow>`
      SELECT costing_method, current_avg_cost, total_layers_qty, total_layers_cost
      FROM inventory_item_costs
      WHERE company_id = ${input.companyId} AND item_id = ${input.itemId}
      FOR UPDATE
    `.execute(db);

    const summary = summaryRows.rows[0];
    const avgCost = Number(summary?.current_avg_cost ?? 0);
    const availableQty = Number(summary?.total_layers_qty ?? 0);
    const totalLayersCost = Number(summary?.total_layers_cost ?? 0);

    // Validate sufficient inventory
    if (availableQty < input.quantity) {
      throw new InsufficientInventoryError(input.quantity, availableQty);
    }

    // Calculate total cost using minor-unit math
    const totalCostMinor = toMinorUnits(avgCost) * input.quantity;
    const totalCost = fromMinorUnits(totalCostMinor);

    // Update summary state: reduce available quantity and total cost
    const newQty = availableQty - input.quantity;
    const newTotalCost = totalLayersCost - totalCost;
    const newAvg = newQty > 0 ? newTotalCost / newQty : 0;

    // Preserve existing costing_method or default to AVG
    const summaryMethod = summary?.costing_method ? String(summary.costing_method) : null;
    const currentMethod: CostingMethod =
      summaryMethod === "AVG" || summaryMethod === "FIFO" || summaryMethod === "LIFO"
        ? summaryMethod
        : "AVG";

    await sql`
      INSERT INTO inventory_item_costs
      (company_id, item_id, costing_method, current_avg_cost, total_layers_qty, total_layers_cost)
      VALUES (${input.companyId}, ${input.itemId}, ${currentMethod}, ${newAvg}, ${newQty}, ${newTotalCost})
      ON DUPLICATE KEY UPDATE
      costing_method = VALUES(costing_method),
      current_avg_cost = VALUES(current_avg_cost),
      total_layers_qty = VALUES(total_layers_qty),
      total_layers_cost = VALUES(total_layers_cost)
    `.execute(db);

    // AVG method doesn't track specific layers consumed
    return {
      totalCost,
      consumedLayers: [],
    };
  }
}

// -----------------------------------------------------------------------------
// FIFO Strategy Implementation
// -----------------------------------------------------------------------------

class FIFOCostingStrategy implements CostingStrategy {
  async calculateCost(
    input: CostCalculationInput,
    db: KyselySchema
  ): Promise<CostCalculationResult> {
    if (!input.transactionId) {
      throw new CostTrackingError(
        "transactionId is required for FIFO/LIFO costing"
      );
    }

    // Lock available layers in chronological order
    const layerRows = await sql<InventoryLayerRow>`
      SELECT id, remaining_qty, unit_cost
      FROM inventory_cost_layers
      WHERE company_id = ${input.companyId} AND item_id = ${input.itemId} AND remaining_qty > 0
      ORDER BY acquired_at ASC, id ASC
      FOR UPDATE
    `.execute(db);

    const layers = layerRows.rows;

    // PRE-CHECK: Calculate total available BEFORE any mutations
    const totalAvailable = layers.reduce(
      (sum: number, layer: InventoryLayerRow) => sum + Number(layer.remaining_qty),
      0
    );

    if (totalAvailable < input.quantity) {
      throw new InsufficientInventoryError(input.quantity, totalAvailable);
    }

    // Only proceed with mutations if sufficient inventory confirmed
    let remainingToConsume = input.quantity;
    const consumedLayers: ConsumedLayer[] = [];
    let totalCost = 0;

    for (const layer of layers) {
      if (remainingToConsume <= 0) break;

      const layerRemainingQty = Number(layer.remaining_qty);
      const layerUnitCost = Number(layer.unit_cost);
      const consumeFromLayer = Math.min(remainingToConsume, layerRemainingQty);

      // Update layer remaining quantity
      await sql`
        UPDATE inventory_cost_layers 
        SET remaining_qty = remaining_qty - ${consumeFromLayer}
        WHERE id = ${layer.id}
      `.execute(db);

      // Record consumption trace
      const layerTotalCost = consumeFromLayer * layerUnitCost;
      await sql`
        INSERT INTO cost_layer_consumption 
        (company_id, layer_id, transaction_id, consumed_qty, unit_cost, total_cost)
        VALUES (${input.companyId}, ${layer.id}, ${input.transactionId}, ${consumeFromLayer}, ${layerUnitCost}, ${layerTotalCost})
      `.execute(db);

      consumedLayers.push({
        layerId: layer.id,
        consumedQty: consumeFromLayer,
        unitCost: layerUnitCost,
      });

      totalCost += layerTotalCost;
      remainingToConsume -= consumeFromLayer;
    }

    return { totalCost, consumedLayers };
  }
}

// -----------------------------------------------------------------------------
// LIFO Strategy Implementation
// -----------------------------------------------------------------------------

class LIFOCostingStrategy implements CostingStrategy {
  async calculateCost(
    input: CostCalculationInput,
    db: KyselySchema
  ): Promise<CostCalculationResult> {
    if (!input.transactionId) {
      throw new CostTrackingError(
        "transactionId is required for FIFO/LIFO costing"
      );
    }

    // Lock available layers in reverse chronological order (newest first)
    const layerRows = await sql<InventoryLayerRow>`
      SELECT id, remaining_qty, unit_cost
      FROM inventory_cost_layers
      WHERE company_id = ${input.companyId} AND item_id = ${input.itemId} AND remaining_qty > 0
      ORDER BY acquired_at DESC, id DESC
      FOR UPDATE
    `.execute(db);

    const layers = layerRows.rows;

    // PRE-CHECK: Calculate total available BEFORE any mutations
    const totalAvailable = layers.reduce(
      (sum: number, layer: InventoryLayerRow) => sum + Number(layer.remaining_qty),
      0
    );

    if (totalAvailable < input.quantity) {
      throw new InsufficientInventoryError(input.quantity, totalAvailable);
    }

    // Only proceed with mutations if sufficient inventory confirmed
    let remainingToConsume = input.quantity;
    const consumedLayers: ConsumedLayer[] = [];
    let totalCost = 0;

    for (const layer of layers) {
      if (remainingToConsume <= 0) break;

      const layerRemainingQty = Number(layer.remaining_qty);
      const layerUnitCost = Number(layer.unit_cost);
      const consumeFromLayer = Math.min(remainingToConsume, layerRemainingQty);

      // Update layer remaining quantity
      await sql`
        UPDATE inventory_cost_layers 
        SET remaining_qty = remaining_qty - ${consumeFromLayer}
        WHERE id = ${layer.id}
      `.execute(db);

      // Record consumption trace
      const layerTotalCost = consumeFromLayer * layerUnitCost;
      await sql`
        INSERT INTO cost_layer_consumption 
        (company_id, layer_id, transaction_id, consumed_qty, unit_cost, total_cost)
        VALUES (${input.companyId}, ${layer.id}, ${input.transactionId}, ${consumeFromLayer}, ${layerUnitCost}, ${layerTotalCost})
      `.execute(db);

      consumedLayers.push({
        layerId: layer.id,
        consumedQty: consumeFromLayer,
        unitCost: layerUnitCost,
      });

      totalCost += layerTotalCost;
      remainingToConsume -= consumeFromLayer;
    }

    return { totalCost, consumedLayers };
  }
}

// -----------------------------------------------------------------------------
// Strategy Factory
// -----------------------------------------------------------------------------

export function getCostingStrategy(method: CostingMethod): CostingStrategy {
  switch (method) {
    case "AVG":
      return new AVGCostingStrategy();
    case "FIFO":
      return new FIFOCostingStrategy();
    case "LIFO":
      return new LIFOCostingStrategy();
    default:
      throw new InvalidCostingMethodError(method);
  }
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Get the costing method configured for a company.
 * Uses SettingsPort with typed settings tables only.
 * 
 * Canonical key: 'inventory.costing_method'
 * Default: 'AVG'
 */
export async function getCompanyCostingMethod(
  companyId: number,
  db: KyselySchema
): Promise<CostingMethod> {
  const settingsPort = new KyselySettingsAdapter(db);

  // Use canonical key via SettingsPort (typed tables only, no legacy fallback)
  const method = await settingsPort.resolve<string>(companyId, "inventory.costing_method", {
    defaultValue: "AVG"
  });

  // Validate method is one of allowed values
  if (method !== "AVG" && method !== "FIFO" && method !== "LIFO") {
    throw new InvalidCostingMethodError(method);
  }

  return method as CostingMethod;
}

/**
 * Calculate cost for consuming inventory.
 * Routes to AVG, FIFO, or LIFO strategy based on company configuration.
 */
export async function calculateCost(
  input: CostCalculationInput,
  db: KyselySchema
): Promise<CostCalculationResult> {
  return withExecutorTransaction(db, async (executor) => {
    // Validate input before any operations
    validateInput(input);

    const method = await getCompanyCostingMethod(input.companyId, executor);
    const strategy = getCostingStrategy(method);
    return strategy.calculateCost(input, executor);
  });
}

/**
 * Create a new cost layer for acquired inventory.
 */
export async function createCostLayer(
  params: {
    companyId: number;
    itemId: number;
    transactionId: number;
    unitCost: number;
    quantity: number;
  },
  db: KyselySchema
): Promise<CostLayer> {
  return withExecutorTransaction(db, async (executor) => {
    // Insert cost layer
    const result = await sql`
      INSERT INTO inventory_cost_layers 
      (company_id, item_id, transaction_id, unit_cost, original_qty, remaining_qty, acquired_at)
      VALUES (${params.companyId}, ${params.itemId}, ${params.transactionId}, ${params.unitCost}, ${params.quantity}, ${params.quantity}, NOW())
    `.execute(executor);

    const insertId = result.insertId;

    // Update summary table for AVG calculation
    const existingSummaryRows = await sql<CostSummaryRow>`
      SELECT costing_method, total_layers_qty, total_layers_cost 
      FROM inventory_item_costs 
      WHERE company_id = ${params.companyId} AND item_id = ${params.itemId}
      FOR UPDATE
    `.execute(executor);

    const summary = existingSummaryRows.rows[0];
    const summaryMethod = summary?.costing_method ? String(summary.costing_method) : null;
    const currentMethod: CostingMethod =
      summaryMethod === "AVG" || summaryMethod === "FIFO" || summaryMethod === "LIFO"
        ? summaryMethod
        : await getCompanyCostingMethod(params.companyId, executor);

    const existingQty = Number(summary?.total_layers_qty ?? 0);
    const existingCost = Number(summary?.total_layers_cost ?? 0);
    const newQty = existingQty + params.quantity;
    const newCost = existingCost + params.quantity * params.unitCost;
    const newAvg = newQty > 0 ? newCost / newQty : 0;

    await sql`
      INSERT INTO inventory_item_costs 
      (company_id, item_id, costing_method, current_avg_cost, total_layers_qty, total_layers_cost)
      VALUES (${params.companyId}, ${params.itemId}, ${currentMethod}, ${newAvg}, ${newQty}, ${newCost})
      ON DUPLICATE KEY UPDATE
      current_avg_cost = VALUES(current_avg_cost),
      total_layers_qty = VALUES(total_layers_qty),
      total_layers_cost = VALUES(total_layers_cost)
    `.execute(executor);

    // Return created layer
    const layerRows = await sql<InventoryLayerRow>`
      SELECT * FROM inventory_cost_layers WHERE id = ${insertId}
    `.execute(executor);

    const layer = layerRows.rows[0];
    return {
      id: layer.id,
      companyId: layer.company_id,
      itemId: layer.item_id,
      transactionId: layer.transaction_id,
      unitCost: Number(layer.unit_cost),
      originalQty: Number(layer.original_qty),
      remainingQty: Number(layer.remaining_qty),
      acquiredAt: layer.acquired_at,
    };
  });
}

/**
 * Get all cost layers for an item.
 */
export async function getItemCostLayers(
  companyId: number,
  itemId: number,
  db: KyselySchema
): Promise<CostLayer[]> {
  const rows = await sql<InventoryLayerRow>`
    SELECT * FROM inventory_cost_layers 
    WHERE company_id = ${companyId} AND item_id = ${itemId}
    ORDER BY acquired_at ASC, id ASC
  `.execute(db);

  return rows.rows.map((layer: InventoryLayerRow) => ({
    id: layer.id,
    companyId: layer.company_id,
    itemId: layer.item_id,
    transactionId: layer.transaction_id,
    unitCost: Number(layer.unit_cost),
    originalQty: Number(layer.original_qty),
    remainingQty: Number(layer.remaining_qty),
    acquiredAt: layer.acquired_at,
  }));
}

/**
 * Get cost summary for an item.
 */
export async function getItemCostSummary(
  companyId: number,
  itemId: number,
  db: KyselySchema
): Promise<ItemCostSummary | null> {
  const rows = await sql<CostSummaryRow & { company_id: number; item_id: number }>`
    SELECT * FROM inventory_item_costs 
    WHERE company_id = ${companyId} AND item_id = ${itemId}
  `.execute(db);

  const summary = rows.rows[0];
  if (!summary) return null;

  return {
    companyId: summary.company_id,
    itemId: summary.item_id,
    costingMethod: summary.costing_method as CostingMethod,
    currentAvgCost: Number(summary.current_avg_cost),
    totalLayersQty: Number(summary.total_layers_qty),
    totalLayersCost: Number(summary.total_layers_cost),
  };
}

// -----------------------------------------------------------------------------
// Extended Functions for Auditability
// -----------------------------------------------------------------------------

interface ConsumptionRow {
  layer_id: number;
  transaction_id: number;
  consumed_qty: string;
  consumed_at: Date;
}

interface LayerStatsRow {
  layer_count: number;
  oldest_acquired: Date | null;
  newest_acquired: Date | null;
}

interface LayerCostRow {
  unit_cost: string;
}

/**
 * Get cost layers with consumption history for auditability.
 * Company-scoped with strict tenant isolation.
 */
export async function getItemCostLayersWithConsumption(
  companyId: number,
  itemId: number,
  db: KyselySchema
): Promise<CostLayerWithConsumption[]> {
  // Get layers ordered by acquisition (FIFO order)
  const layerRows = await sql<InventoryLayerRow & { transaction_reference_id: number | null }>`
    SELECT
      l.id, l.company_id, l.item_id, l.transaction_id,
      l.unit_cost, l.original_qty, l.remaining_qty,
      l.acquired_at,
      t.reference_type as transaction_reference_type,
      t.reference_id as transaction_reference_id
    FROM inventory_cost_layers l
    LEFT JOIN inventory_transactions t ON l.transaction_id = t.id
    WHERE l.company_id = ${companyId} AND l.item_id = ${itemId}
    ORDER BY l.acquired_at ASC, l.id ASC
  `.execute(db);

  const layers = layerRows.rows;
  if (layers.length === 0) return [];

  // Get consumption history for FIFO/LIFO layers
  const layerIds = layers.map((l: InventoryLayerRow) => l.id);
  const consumptionRows = await sql<ConsumptionRow>`
    SELECT
      layer_id, transaction_id, consumed_qty, consumed_at
    FROM cost_layer_consumption
    WHERE layer_id IN (${sql.join(layerIds.map(id => sql`${id}`), sql`, `)})
    ORDER BY consumed_at ASC
  `.execute(db);

  const consumptionMap = new Map<number, Array<{ transactionId: number; quantity: number; consumedAt: string }>>();
  consumptionRows.rows.forEach((c: ConsumptionRow) => {
    const list = consumptionMap.get(c.layer_id) ?? [];
    list.push({
      transactionId: c.transaction_id,
      quantity: Number(c.consumed_qty),
      consumedAt: toUtcIso.dateLike(c.consumed_at)!,
    });
    consumptionMap.set(c.layer_id, list);
  });

  return layers.map((layer: InventoryLayerRow & { transaction_reference_id: number | null }) => ({
    id: layer.id,
    companyId: layer.company_id,
    itemId: layer.item_id,
    transactionId: layer.transaction_id,
    unitCost: Number(layer.unit_cost),
    originalQty: Number(layer.original_qty),
    remainingQty: Number(layer.remaining_qty),
    acquiredAt: layer.acquired_at,
    reference: layer.transaction_reference_id?.toString() ?? null,
    consumedBy: consumptionMap.get(layer.id),
  }));
}

/**
 * Get extended cost summary with method-specific details.
 */
export async function getItemCostSummaryExtended(
  companyId: number,
  itemId: number,
  db: KyselySchema
): Promise<ItemCostSummaryExtended | null> {
  // Get base summary
  const summary = await getItemCostSummary(companyId, itemId, db);
  if (!summary) return null;

  // Get costing method
  const method = await getCompanyCostingMethod(companyId, db);

  // Get layer statistics
  const layerStatsRows = await sql<LayerStatsRow>`
    SELECT 
      COUNT(*) as layer_count,
      MIN(acquired_at) as oldest_acquired,
      MAX(acquired_at) as newest_acquired
    FROM inventory_cost_layers
    WHERE company_id = ${companyId} AND item_id = ${itemId} AND remaining_qty > 0
  `.execute(db);

  const stats = layerStatsRows.rows[0];
  const layerCount = Number(stats?.layer_count ?? 0);

  // Build method-specific breakdown
  const methodSpecific: ItemCostSummaryExtended["methodSpecific"] = {};

  if (method === "AVG") {
    methodSpecific.avg = {
      weightedAverage: summary.currentAvgCost ?? 0,
      totalValue: summary.totalLayersCost,
    };
  } else if (layerCount > 0) {
    // Get edge layer costs for FIFO/LIFO
    if (method === "FIFO" && stats?.oldest_acquired) {
      const oldestRows = await sql<LayerCostRow>`
        SELECT unit_cost 
        FROM inventory_cost_layers
        WHERE company_id = ${companyId} AND item_id = ${itemId} AND remaining_qty > 0
        ORDER BY acquired_at ASC, id ASC
        LIMIT 1
      `.execute(db);
      const oldest = oldestRows.rows[0];
      methodSpecific.fifo = {
        oldestLayerCost: Number(oldest?.unit_cost ?? 0),
        layerCount,
      };
    } else if (method === "LIFO" && stats?.newest_acquired) {
      const newestRows = await sql<LayerCostRow>`
        SELECT unit_cost 
        FROM inventory_cost_layers
        WHERE company_id = ${companyId} AND item_id = ${itemId} AND remaining_qty > 0
        ORDER BY acquired_at DESC, id DESC
        LIMIT 1
      `.execute(db);
      const newest = newestRows.rows[0];
      methodSpecific.lifo = {
        newestLayerCost: Number(newest?.unit_cost ?? 0),
        layerCount,
      };
    }
  }

  return {
    ...summary,
    lastUpdated: nowUTC(),
    methodSpecific,
  };
}

// -----------------------------------------------------------------------------
// DeductWithCost Contract
// -----------------------------------------------------------------------------

/**
 * Deduct inventory with cost calculation.
 * 
 * This is the primary contract for COGS-aware stock deduction.
 * It calculates costs for multiple items atomically and returns stock transaction IDs
 * along with the cost breakdown.
 * 
 * ATOMICITY: This function executes the entire batch atomically within a single
 * transaction. If any item fails (e.g., insufficient inventory), the entire operation
 * rolls back - no partial commits occur.
 * 
 * @param companyId - Company performing the deduction
 * @param items - Items to deduct with quantities and pre-created stock transaction IDs
 * @param db - Database executor
 * @returns Deduction result with stock transaction IDs and item costs
 */
export async function deductWithCost(
  companyId: number,
  items: Array<{ itemId: number; qty: number; stockTxId: number }>,
  db: KyselySchema
): Promise<DeductionResult> {
  return withExecutorTransaction(db, async (executor) => {
    const stockTxIds: number[] = [];
    const itemCosts: ItemCostResult[] = [];

    for (const item of items) {
      const result = await calculateCost(
        {
          companyId,
          itemId: item.itemId,
          quantity: item.qty,
          transactionId: item.stockTxId,
        },
        executor
      );

      stockTxIds.push(item.stockTxId);

      // Calculate unit cost from total
      const unitCost = item.qty > 0 ? result.totalCost / item.qty : 0;

      itemCosts.push({
        itemId: item.itemId,
        qty: item.qty,
        unitCost,
        totalCost: result.totalCost,
        stockTxId: item.stockTxId,
      });
    }

    return { stockTxIds, itemCosts };
  });
}

// -----------------------------------------------------------------------------
// Re-exports from types
// -----------------------------------------------------------------------------

export {
  CostTrackingError,
  InsufficientInventoryError,
  InvalidCostingMethodError,
  toMinorUnits,
  fromMinorUnits,
} from "./types/costing.js";

export type {
  CostingMethod,
  CostLayer,
  CostCalculationInput,
  CostCalculationResult,
  ConsumedLayer,
  ItemCostSummary,
  DeductionInput,
  DeductionResult,
  ItemCostResult,
  CostLayerWithConsumption,
  ItemCostSummaryExtended,
} from "./types/costing.js";
