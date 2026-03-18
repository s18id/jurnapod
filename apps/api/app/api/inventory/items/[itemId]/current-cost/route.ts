// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
// Scope: Story 4.6 Task 5 - Auditability endpoints for current cost

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import { getDbPool } from "../../../../../../src/lib/db";
import {
  getItemCostSummaryExtended,
} from "../../../../../../src/lib/cost-tracking";
import type { InventoryCurrentCostResponse } from "@jurnapod/shared";

function parseItemId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  // Path: /api/inventory/items/[itemId]/current-cost
  const parts = pathname.split("/").filter(Boolean);
  // parts: ["api", "inventory", "items", "[itemId]", "current-cost"]
  const itemIdRaw = parts[3];
  return NumericIdSchema.parse(itemIdRaw);
}

/**
 * GET /api/inventory/items/[itemId]/current-cost
 * Returns current cost summary with method-specific breakdown
 * Company-scoped with strict tenant isolation
 */
export const GET = withAuth(
  async (request, auth): Promise<Response> => {
    const conn = await getDbPool().getConnection();

    try {
      const itemId = parseItemId(request);

      // Verify item exists and belongs to this company
      const [itemRows] = await conn.execute(
        `SELECT id, name FROM items WHERE id = ? AND company_id = ?`,
        [itemId, auth.companyId]
      );

      const item = (itemRows as any[])[0];
      if (!item) {
        return errorResponse("NOT_FOUND", "Item not found", 404);
      }

      // Get extended cost summary
      const summary = await getItemCostSummaryExtended(
        auth.companyId,
        itemId,
        conn
      );

      if (!summary) {
        // No cost data yet - return empty state
        const response: InventoryCurrentCostResponse = {
          success: true,
          data: {
            itemId,
            itemName: item.name,
            costingMethod: "AVG", // Default when not configured
            currentQuantity: 0,
            currentUnitCost: 0,
            currentTotalCost: 0,
            lastUpdated: new Date().toISOString(),
            methodSpecific: {
              avg: {
                weightedAverage: 0,
                totalValue: 0,
              },
            },
          },
        };
        return successResponse(response.data);
      }

      // Transform to shared schema format
      const response: InventoryCurrentCostResponse = {
        success: true,
        data: {
          itemId,
          itemName: item.name,
          costingMethod: summary.costingMethod,
          currentQuantity: summary.totalLayersQty,
          currentUnitCost: summary.currentAvgCost ?? 0,
          currentTotalCost: summary.totalLayersCost,
          lastUpdated: summary.lastUpdated,
          methodSpecific: summary.methodSpecific,
        },
      };

      return successResponse(response.data);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
      }

      console.error("GET /api/inventory/items/:id/current-cost failed", error);
      return errorResponse(
        "INTERNAL_ERROR",
        "Failed to retrieve current cost",
        500
      );
    } finally {
      conn.release();
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "inventory",
      permission: "read",
    }),
  ]
);
