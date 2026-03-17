// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
// Description: Shared Zod schemas for inventory cost tracking auditability endpoints

import { z } from "zod";
import { NumericIdSchema, MoneySchema } from "./common";

/**
 * Costing method enum - matches database values
 */
export const CostingMethodSchema = z.enum(["AVG", "FIFO", "LIFO"]);

/**
 * Single cost layer representation
 * Represents an inbound inventory transaction with auditable cost data
 */
export const InventoryCostLayerSchema = z.object({
  id: NumericIdSchema.describe("Cost layer ID (inventory_cost_layers table)"),
  itemId: NumericIdSchema.describe("Item/product ID"),
  transactionId: NumericIdSchema.describe("Reference to inventory transaction"),
  unitCost: MoneySchema.describe("Unit cost at acquisition (minor units)"),
  quantity: z.number().int().positive().describe("Original quantity received"),
  remainingQuantity: z.number().int().min(0).describe("Remaining unconsumed quantity"),
  acquiredAt: z.string().datetime().describe("ISO timestamp when layer was created"),
  reference: z.string().nullable().describe("Purchase order reference or source document"),
  consumedBy: z
    .array(
      z.object({
        transactionId: NumericIdSchema,
        quantity: z.number().int().positive(),
        consumedAt: z.string().datetime(),
      })
    )
    .optional()
    .describe("Consumption history for this layer (FIFO/LIFO)"),
});

/**
 * Response schema for cost layers list endpoint
 */
export const InventoryCostLayersResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    itemId: NumericIdSchema,
    itemName: z.string(),
    costingMethod: CostingMethodSchema,
    layers: z.array(InventoryCostLayerSchema),
    totalLayers: z.number().int().nonnegative(),
    totalRemainingQuantity: z.number().int().nonnegative(),
    averageUnitCost: MoneySchema.describe("Weighted average across all remaining layers"),
  }),
});

/**
 * Current cost summary for an item
 */
export const InventoryCurrentCostSchema = z.object({
  itemId: NumericIdSchema,
  itemName: z.string(),
  costingMethod: CostingMethodSchema.describe("Company's configured costing method"),
  currentQuantity: z.number().int().describe("Total quantity on hand"),
  currentUnitCost: MoneySchema.describe("Current unit cost (method-specific calculation)"),
  currentTotalCost: MoneySchema.describe("Total inventory value"),
  lastUpdated: z.string().datetime().describe("When cost was last calculated/updated"),
  methodSpecific: z
    .object({
      avg: z
        .object({
          weightedAverage: MoneySchema,
          totalValue: MoneySchema,
        })
        .optional(),
      fifo: z
        .object({
          oldestLayerCost: MoneySchema.describe("Cost of oldest unconsumed layer"),
          layerCount: z.number().int(),
        })
        .optional(),
      lifo: z
        .object({
          newestLayerCost: MoneySchema.describe("Cost of newest unconsumed layer"),
          layerCount: z.number().int(),
        })
        .optional(),
    })
    .optional()
    .describe("Method-specific cost breakdown"),
});

/**
 * Response schema for current cost endpoint
 */
export const InventoryCurrentCostResponseSchema = z.object({
  success: z.literal(true),
  data: InventoryCurrentCostSchema,
});

/**
 * Error response for cost endpoints
 */
export const InventoryCostErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.enum(["NOT_FOUND", "UNAUTHORIZED", "INVALID_ITEM", "NO_COST_DATA", "INTERNAL_ERROR"]),
    message: z.string(),
  }),
});

// Type exports
export type CostingMethod = z.infer<typeof CostingMethodSchema>;
export type InventoryCostLayer = z.infer<typeof InventoryCostLayerSchema>;
export type InventoryCostLayersResponse = z.infer<typeof InventoryCostLayersResponseSchema>;
export type InventoryCurrentCost = z.infer<typeof InventoryCurrentCostSchema>;
export type InventoryCurrentCostResponse = z.infer<typeof InventoryCurrentCostResponseSchema>;
export type InventoryCostErrorResponse = z.infer<typeof InventoryCostErrorResponseSchema>;
