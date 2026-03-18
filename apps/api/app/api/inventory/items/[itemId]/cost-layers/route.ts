// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
// Scope: Story 4.6 Task 5 - Auditability endpoints for cost layers

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import { getDbPool } from "../../../../../../src/lib/db";
import {
  getCompanyCostingMethod,
  getItemCostLayersWithConsumption,
} from "../../../../../../src/lib/cost-tracking";
import type { InventoryCostLayersResponse } from "@jurnapod/shared";

function parseItemId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  // Path: /api/inventory/items/[itemId]/cost-layers
  const parts = pathname.split("/").filter(Boolean);
  // parts: ["api", "inventory", "items", "[itemId]", "cost-layers"]
  const itemIdRaw = parts[3];
  return NumericIdSchema.parse(itemIdRaw);
}

/**
 * GET /api/inventory/items/[itemId]/cost-layers
 * Returns auditable cost layers with consumption history
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

      // Get costing method for the company
      const costingMethod = await getCompanyCostingMethod(auth.companyId, conn);

      // Get cost layers with consumption history
      const layers = await getItemCostLayersWithConsumption(
        auth.companyId,
        itemId,
        conn
      );

      // Calculate summary statistics
      const totalLayers = layers.length;
      const totalRemainingQuantity = layers.reduce(
        (sum, layer) => sum + layer.remainingQty,
        0
      );
      const totalCost = layers.reduce(
        (sum, layer) => sum + layer.remainingQty * layer.unitCost,
        0
      );
      const averageUnitCost =
        totalRemainingQuantity > 0 ? totalCost / totalRemainingQuantity : 0;

      // Transform to shared schema format
      const response: InventoryCostLayersResponse = {
        success: true,
        data: {
          itemId,
          itemName: item.name,
          costingMethod,
          layers: layers.map((layer) => ({
            id: layer.id,
            itemId: layer.itemId,
            transactionId: layer.transactionId,
            unitCost: layer.unitCost,
            quantity: layer.originalQty,
            remainingQuantity: layer.remainingQty,
            acquiredAt: layer.acquiredAt.toISOString(),
            reference: layer.reference ?? null,
            consumedBy: layer.consumedBy,
          })),
          totalLayers,
          totalRemainingQuantity,
          averageUnitCost,
        },
      };

      return successResponse(response.data);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
      }

      console.error("GET /api/inventory/items/:id/cost-layers failed", error);
      return errorResponse(
        "INTERNAL_ERROR",
        "Failed to retrieve cost layers",
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
