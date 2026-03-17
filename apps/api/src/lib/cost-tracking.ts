// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Story: 4.6 Cost Tracking Methods
// Description: Cost tracking engine with AVG/FIFO/LIFO strategies

import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "@/lib/db";

// ============================================================================
// Types
// ============================================================================

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
    conn: PoolConnection
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
    conn: PoolConnection
  ): Promise<CostCalculationResult> {
    // Lock summary row to prevent concurrent updates
    const [summaryRows] = await conn.execute(
      `SELECT costing_method, current_avg_cost, total_layers_qty, total_layers_cost
       FROM inventory_item_costs
       WHERE company_id = ? AND item_id = ?
       FOR UPDATE`,
      [input.companyId, input.itemId]
    );

    const summary = (summaryRows as any[])[0];
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

    await conn.execute(
      `INSERT INTO inventory_item_costs
       (company_id, item_id, costing_method, current_avg_cost, total_layers_qty, total_layers_cost)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       costing_method = VALUES(costing_method),
       current_avg_cost = VALUES(current_avg_cost),
       total_layers_qty = VALUES(total_layers_qty),
       total_layers_cost = VALUES(total_layers_cost)`,
      [input.companyId, input.itemId, currentMethod, newAvg, newQty, newTotalCost]
    );

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
    conn: PoolConnection
  ): Promise<CostCalculationResult> {
    if (!input.transactionId) {
      throw new CostTrackingError(
        "transactionId is required for FIFO/LIFO costing"
      );
    }

    // Lock available layers in chronological order
    const [layerRows] = await conn.execute(
      `SELECT id, remaining_qty, unit_cost
       FROM inventory_cost_layers
       WHERE company_id = ? AND item_id = ? AND remaining_qty > 0
       ORDER BY acquired_at ASC, id ASC
       FOR UPDATE`,
      [input.companyId, input.itemId]
    );

    const layers = layerRows as any[];

    // PRE-CHECK: Calculate total available BEFORE any mutations
    const totalAvailable = layers.reduce(
      (sum, layer) => sum + Number(layer.remaining_qty),
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
      await conn.execute(
        `UPDATE inventory_cost_layers 
         SET remaining_qty = remaining_qty - ?
         WHERE id = ?`,
        [consumeFromLayer, layer.id]
      );

      // Record consumption trace
      const layerTotalCost = consumeFromLayer * layerUnitCost;
      await conn.execute(
        `INSERT INTO cost_layer_consumption 
         (company_id, layer_id, transaction_id, consumed_qty, unit_cost, total_cost)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          input.companyId,
          layer.id,
          input.transactionId,
          consumeFromLayer,
          layerUnitCost,
          layerTotalCost,
        ]
      );

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
    conn: PoolConnection
  ): Promise<CostCalculationResult> {
    if (!input.transactionId) {
      throw new CostTrackingError(
        "transactionId is required for FIFO/LIFO costing"
      );
    }

    // Lock available layers in reverse chronological order (newest first)
    const [layerRows] = await conn.execute(
      `SELECT id, remaining_qty, unit_cost
       FROM inventory_cost_layers
       WHERE company_id = ? AND item_id = ? AND remaining_qty > 0
       ORDER BY acquired_at DESC, id DESC
       FOR UPDATE`,
      [input.companyId, input.itemId]
    );

    const layers = layerRows as any[];

    // PRE-CHECK: Calculate total available BEFORE any mutations
    const totalAvailable = layers.reduce(
      (sum, layer) => sum + Number(layer.remaining_qty),
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
      await conn.execute(
        `UPDATE inventory_cost_layers 
         SET remaining_qty = remaining_qty - ?
         WHERE id = ?`,
        [consumeFromLayer, layer.id]
      );

      // Record consumption trace
      const layerTotalCost = consumeFromLayer * layerUnitCost;
      await conn.execute(
        `INSERT INTO cost_layer_consumption 
         (company_id, layer_id, transaction_id, consumed_qty, unit_cost, total_cost)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          input.companyId,
          layer.id,
          input.transactionId,
          consumeFromLayer,
          layerUnitCost,
          layerTotalCost,
        ]
      );

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
  conn?: PoolConnection
): Promise<CostingMethod> {
  const shouldReleaseConn = !conn;
  const connection = conn ?? (await getDbPool().getConnection());

  try {
    // Read costing method from company_settings
    // Key: 'inventory_costing_method'
    // Value: 'AVG' | 'FIFO' | 'LIFO' (stored in value_json)
    // Default: 'AVG'
    const [rows] = await connection.execute(
      `SELECT value_json, value_type 
       FROM company_settings 
       WHERE company_id = ? AND \`key\` = ? AND outlet_id IS NULL
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [companyId, "inventory_costing_method"]
    );

    const setting = (rows as any[])[0];
    
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
  } finally {
    if (shouldReleaseConn) {
      connection.release();
    }
  }
}

export async function calculateCost(
  input: CostCalculationInput,
  conn: PoolConnection
): Promise<CostCalculationResult> {
  // Validate input before any operations
  validateInput(input);

  const method = await getCompanyCostingMethod(input.companyId, conn);
  const strategy = getCostingStrategy(method);
  return strategy.calculateCost(input, conn);
}

export async function createCostLayer(
  params: {
    companyId: number;
    itemId: number;
    transactionId: number;
    unitCost: number;
    quantity: number;
  },
  conn: PoolConnection
): Promise<CostLayer> {
  // Insert cost layer
  const [result] = await conn.execute(
    `INSERT INTO inventory_cost_layers 
     (company_id, item_id, transaction_id, unit_cost, original_qty, remaining_qty, acquired_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      params.companyId,
      params.itemId,
      params.transactionId,
      params.unitCost,
      params.quantity,
      params.quantity,
    ]
  );

  const insertId = (result as any).insertId;

  // Update summary table for AVG calculation
  const [existingSummary] = await conn.execute(
    `SELECT costing_method, total_layers_qty, total_layers_cost 
     FROM inventory_item_costs 
     WHERE company_id = ? AND item_id = ?
     FOR UPDATE`,
    [params.companyId, params.itemId]
  );

  const summary = (existingSummary as any[])[0];
  const summaryMethod = summary?.costing_method ? String(summary.costing_method) : null;
  const currentMethod: CostingMethod =
    summaryMethod === "AVG" || summaryMethod === "FIFO" || summaryMethod === "LIFO"
      ? summaryMethod
      : await getCompanyCostingMethod(params.companyId, conn);

  const existingQty = Number(summary?.total_layers_qty ?? 0);
  const existingCost = Number(summary?.total_layers_cost ?? 0);
  const newQty = existingQty + params.quantity;
  const newCost = existingCost + params.quantity * params.unitCost;
  const newAvg = newQty > 0 ? newCost / newQty : 0;

  await conn.execute(
     `INSERT INTO inventory_item_costs 
     (company_id, item_id, costing_method, current_avg_cost, total_layers_qty, total_layers_cost)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
     current_avg_cost = VALUES(current_avg_cost),
     total_layers_qty = VALUES(total_layers_qty),
     total_layers_cost = VALUES(total_layers_cost)`,
    [params.companyId, params.itemId, currentMethod, newAvg, newQty, newCost]
  );

  // Return created layer
  const [layerRows] = await conn.execute(
    `SELECT * FROM inventory_cost_layers WHERE id = ?`,
    [insertId]
  );

  const layer = (layerRows as any[])[0];
  return {
    id: layer.id,
    companyId: layer.company_id,
    itemId: layer.item_id,
    transactionId: layer.transaction_id,
    unitCost: layer.unit_cost,
    originalQty: layer.original_qty,
    remainingQty: layer.remaining_qty,
    acquiredAt: layer.acquired_at,
  };
}

export async function getItemCostLayers(
  companyId: number,
  itemId: number,
  conn?: PoolConnection
): Promise<CostLayer[]> {
  const shouldReleaseConn = !conn;
  const connection = conn ?? (await getDbPool().getConnection());

  try {
    const [rows] = await connection.execute(
      `SELECT * FROM inventory_cost_layers 
       WHERE company_id = ? AND item_id = ?
       ORDER BY acquired_at ASC, id ASC`,
      [companyId, itemId]
    );

    return (rows as any[]).map((layer) => ({
      id: layer.id,
      companyId: layer.company_id,
      itemId: layer.item_id,
      transactionId: layer.transaction_id,
      unitCost: layer.unit_cost,
      originalQty: layer.original_qty,
      remainingQty: layer.remaining_qty,
      acquiredAt: layer.acquired_at,
    }));
  } finally {
    if (shouldReleaseConn) {
      connection.release();
    }
  }
}

export async function getItemCostSummary(
  companyId: number,
  itemId: number,
  conn?: PoolConnection
): Promise<ItemCostSummary | null> {
  const shouldReleaseConn = !conn;
  const connection = conn ?? (await getDbPool().getConnection());

  try {
    const [rows] = await connection.execute(
      `SELECT * FROM inventory_item_costs 
       WHERE company_id = ? AND item_id = ?`,
      [companyId, itemId]
    );

    const summary = (rows as any[])[0];
    if (!summary) return null;

    return {
      companyId: summary.company_id,
      itemId: summary.item_id,
      costingMethod: summary.costing_method,
      currentAvgCost: Number(summary.current_avg_cost),
      totalLayersQty: Number(summary.total_layers_qty),
      totalLayersCost: Number(summary.total_layers_cost),
    };
  } finally {
    if (shouldReleaseConn) {
      connection.release();
    }
  }
}

export { getCostingStrategy, toMinorUnits, fromMinorUnits };
