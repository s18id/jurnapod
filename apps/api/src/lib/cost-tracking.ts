// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Story: 4.6 Cost Tracking Methods
// Description: Cost tracking engine with AVG/FIFO/LIFO strategies

import { getDb, type KyselySchema } from "@/lib/db";
import { sql } from "kysely";

async function withExecutorTransaction<T>(
  db: KyselySchema,
  callback: (executor: KyselySchema) => Promise<T>
): Promise<T> {
  if (db.isTransaction) {
    return callback(db);
  }

  return db.transaction().execute(async (trx) => callback(trx as unknown as KyselySchema));
}

// ============================================================================
// Types
// ============================================================================

// Database Row Types for type-safe query results
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

interface SettingRow {
  value_json: string;
  value_type: string;
  key: string;
}

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

export type CostingMethod = "AVG" | "FIFO" | "LIFO";

export interface CostCalculationInput {
  companyId: number;
  itemId: number;
  quantity: number;
  transactionId?: number; // Required for FIFO/LIFO to record consumption
}

export interface ConsumedLayer {
  layerId: number;
  consumedQty: number;
  unitCost: number;
}

export interface CostCalculationResult {
  totalCost: number;
  consumedLayers: ConsumedLayer[];
}

export interface CostLayer {
  id: number;
  companyId: number;
  itemId: number;
  transactionId: number;
  unitCost: number;
  originalQty: number;
  remainingQty: number;
  acquiredAt: Date;
}

export interface ItemCostSummary {
  companyId: number;
  itemId: number;
  costingMethod: CostingMethod;
  currentAvgCost: number | null;
  totalLayersQty: number;
  totalLayersCost: number;
}

// ============================================================================
// Error Classes
// ============================================================================

export class CostTrackingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostTrackingError";
  }
}

export class InsufficientInventoryError extends CostTrackingError {
  constructor(needed: number, available: number) {
    super(`Insufficient inventory: need ${needed}, have ${available}`);
    this.name = "InsufficientInventoryError";
  }
}

export class InvalidCostingMethodError extends CostTrackingError {
  constructor(method: string) {
    super(`Invalid costing method: ${method}`);
    this.name = "InvalidCostingMethodError";
  }
}

// ============================================================================
// Money Helpers (deterministic minor-unit math)
// ============================================================================

const MONEY_PRECISION = 4; // 4 decimal places for unit costs
const MONEY_MULTIPLIER = 10 ** MONEY_PRECISION;

function toMinorUnits(value: number): number {
  return Math.round(value * MONEY_MULTIPLIER);
}

function fromMinorUnits(value: number): number {
  return value / MONEY_MULTIPLIER;
}

// ============================================================================
// Costing Strategy Interface
// ============================================================================

interface CostingStrategy {
  calculateCost(
    input: CostCalculationInput,
    db: KyselySchema
  ): Promise<CostCalculationResult>;
}

// ============================================================================
// Input Validation
// ============================================================================

function validateInput(input: CostCalculationInput): void {
  if (input.quantity <= 0) {
    throw new CostTrackingError(`Invalid quantity: ${input.quantity}. Must be positive.`);
  }
}

// ============================================================================
// AVG Strategy Implementation
// ============================================================================

class AVGCostingStrategy implements CostingStrategy {
  async calculateCost(
    input: CostCalculationInput,
    db: KyselySchema
  ): Promise<CostCalculationResult> {
    // Note: Caller manages transaction (stock.ts functions use top-level transactions)
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

// ============================================================================
// FIFO Strategy Implementation
// ============================================================================

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

    // Note: Caller manages transaction (stock.ts functions use top-level transactions)
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

// ============================================================================
// LIFO Strategy Implementation
// ============================================================================

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

    // Note: Caller manages transaction (stock.ts functions use top-level transactions)
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

// ============================================================================
// Strategy Factory
// ============================================================================

function getCostingStrategy(method: CostingMethod): CostingStrategy {
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

// ============================================================================
// Public API
// ============================================================================

export async function getCompanyCostingMethod(
  companyId: number,
  db?: KyselySchema
): Promise<CostingMethod> {
  const database = db ?? getDb();

  // Read costing method from company_settings
  // Priority:
  // 1. 'inventory.costing_method' (canonical key used by settings system)
  // 2. 'inventory_costing_method' (legacy key for backward compatibility)
  // Default: 'AVG'
  const rows = await sql<SettingRow>`
    SELECT value_json, value_type, \`key\`
    FROM company_settings 
    WHERE company_id = ${companyId} AND \`key\` IN ('inventory.costing_method', 'inventory_costing_method') AND outlet_id IS NULL
    ORDER BY FIELD(\`key\`, 'inventory.costing_method', 'inventory_costing_method'), updated_at DESC, id DESC
    LIMIT 1
  `.execute(database);

  const setting = rows.rows[0];
  
  if (!setting) {
    return "AVG"; // Default when not configured
  }

  // Parse JSON value
  let method: string;
  try {
    const parsed = JSON.parse(setting.value_json);
    method = typeof parsed === 'string' ? parsed : String(parsed);
  } catch {
    // If not valid JSON, treat as string directly
    method = String(setting.value_json).replace(/^"|"$/g, '');
  }
  
  // Validate method is one of allowed values
  if (method !== "AVG" && method !== "FIFO" && method !== "LIFO") {
    throw new InvalidCostingMethodError(method);
  }

  return method as CostingMethod;
}

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

export async function getItemCostLayers(
  companyId: number,
  itemId: number,
  db?: KyselySchema
): Promise<CostLayer[]> {
  const database = db ?? getDb();

  const rows = await sql<InventoryLayerRow>`
    SELECT * FROM inventory_cost_layers 
    WHERE company_id = ${companyId} AND item_id = ${itemId}
    ORDER BY acquired_at ASC, id ASC
  `.execute(database);

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

export async function getItemCostSummary(
  companyId: number,
  itemId: number,
  db?: KyselySchema
): Promise<ItemCostSummary | null> {
  const database = db ?? getDb();

  const rows = await sql<CostSummaryRow & { company_id: number; item_id: number }>`
    SELECT * FROM inventory_item_costs 
    WHERE company_id = ${companyId} AND item_id = ${itemId}
  `.execute(database);

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

/**
 * Extended cost layer with consumption history for auditability
 */
export interface CostLayerWithConsumption extends CostLayer {
  reference?: string | null;
  consumedBy?: Array<{
    transactionId: number;
    quantity: number;
    consumedAt: string;
  }>;
}

/**
 * Extended cost summary with method-specific breakdown
 */
export interface ItemCostSummaryExtended extends ItemCostSummary {
  lastUpdated: string;
  methodSpecific?: {
    avg?: {
      weightedAverage: number;
      totalValue: number;
    };
    fifo?: {
      oldestLayerCost: number;
      layerCount: number;
    };
    lifo?: {
      newestLayerCost: number;
      layerCount: number;
    };
  };
}

/**
 * Get cost layers with consumption history for auditability
 * Company-scoped with strict tenant isolation
 */
export async function getItemCostLayersWithConsumption(
  companyId: number,
  itemId: number,
  db?: KyselySchema
): Promise<CostLayerWithConsumption[]> {
  const database = db ?? getDb();

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
  `.execute(database);

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
  `.execute(database);

  const consumptionMap = new Map<number, Array<{ transactionId: number; quantity: number; consumedAt: string }>>();
  consumptionRows.rows.forEach((c: ConsumptionRow) => {
    const list = consumptionMap.get(c.layer_id) ?? [];
    list.push({
      transactionId: c.transaction_id,
      quantity: Number(c.consumed_qty),
      consumedAt: c.consumed_at instanceof Date ? c.consumed_at.toISOString() : String(c.consumed_at),
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
 * Get extended cost summary with method-specific details
 */
export async function getItemCostSummaryExtended(
  companyId: number,
  itemId: number,
  db?: KyselySchema
): Promise<ItemCostSummaryExtended | null> {
  const database = db ?? getDb();

  // Get base summary
  const summary = await getItemCostSummary(companyId, itemId, database);
  if (!summary) return null;

  // Get costing method
  const method = await getCompanyCostingMethod(companyId, database);

  // Get layer statistics
  const layerStatsRows = await sql<LayerStatsRow>`
    SELECT 
      COUNT(*) as layer_count,
      MIN(acquired_at) as oldest_acquired,
      MAX(acquired_at) as newest_acquired
    FROM inventory_cost_layers
    WHERE company_id = ${companyId} AND item_id = ${itemId} AND remaining_qty > 0
  `.execute(database);

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
      `.execute(database);
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
      `.execute(database);
      const newest = newestRows.rows[0];
      methodSpecific.lifo = {
        newestLayerCost: Number(newest?.unit_cost ?? 0),
        layerCount,
      };
    }
  }

  return {
    ...summary,
    lastUpdated: new Date().toISOString(),
    methodSpecific,
  };
}

export { getCostingStrategy, toMinorUnits, fromMinorUnits };
