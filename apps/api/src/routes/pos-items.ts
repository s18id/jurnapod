// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * POS Item Variants Routes
 * 
 * GET /api/pos/items/:id/variants - List variants for an item (with current prices)
 * 
 * This endpoint is used by the POS cart when adding items with variants.
 * Returns variant details including effective price, stock, and attributes.
 */

import { Hono } from "hono";
import { z } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";
import { authenticateRequest, type AuthContext } from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import { getItemVariants } from "../lib/item-variants.js";
import { getVariantEffectivePrice } from "../lib/item-variants.js";
import { resolvePrice } from "../lib/pricing/variant-price-resolver.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const posItemVariantsRoutes = new Hono();

// Auth middleware
posItemVariantsRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /api/pos/items/:id/variants - List variants for item
posItemVariantsRoutes.get("/:id/variants", async (c) => {
  const auth = c.get("auth");

  // Parse item ID from params
  const itemIdStr = c.req.param("id");
  const itemIdParse = NumericIdSchema.safeParse(itemIdStr);
  if (!itemIdParse.success) {
    return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
  }
  const itemId = itemIdParse.data;

  try {
    // Optional outlet_id query param for outlet-specific pricing
    const outletIdStr = c.req.query("outlet_id");
    const outletId = outletIdStr ? Number(outletIdStr) : undefined;

    // Get all variants for this item
    const variants = await getItemVariants(auth.companyId, itemId);

    // Filter to active variants only
    const activeVariants = variants.filter((v) => v.is_active);

    // Enrich each variant with effective price (variant price > item price)
    const enrichedVariants = await Promise.all(
      activeVariants.map(async (variant) => {
        // Use variant price resolution for accuracy
        const resolved = await resolvePrice(
          auth.companyId,
          itemId,
          variant.id,
          outletId ?? null
        );

        return {
          id: variant.id,
          item_id: variant.item_id,
          sku: variant.sku,
          variant_name: variant.variant_name,
          price: resolved.price,
          price_id: resolved.price_id,
          is_variant_specific: resolved.is_variant_specific,
          source: resolved.source,
          stock_quantity: variant.stock_quantity,
          barcode: variant.barcode,
          is_active: variant.is_active,
          attributes: variant.attributes
        };
      })
    );

    return successResponse({
      item_id: itemId,
      variants: enrichedVariants,
      count: enrichedVariants.length
    });
  } catch (error) {
    console.error("GET /api/pos/items/:id/variants failed", {
      company_id: auth.companyId,
      item_id: itemId,
      error
    });

    if (error instanceof Error && error.name === "ItemNotFoundError") {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch item variants", 500);
  }
});

export { posItemVariantsRoutes };
