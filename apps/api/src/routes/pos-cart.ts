// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * POS Cart Routes
 * 
 * POST /api/pos/cart/line - Add or update a cart line with optional variant
 * 
 * This endpoint supports:
 * - Adding items without variants
 * - Adding items with specific variant_id
 * - Updating quantity of existing lines
 * - Resolving variant-specific pricing
 */

import { Hono } from "hono";
import { z } from "zod";
import { z as zodOpenApi, createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import { NumericIdSchema } from "@jurnapod/shared";
import { authenticateRequest, type AuthContext } from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import { resolvePrice } from "../lib/pricing/variant-price-resolver.js";
import { getVariantById } from "../lib/item-variants.js";
import { checkVariantStockAvailability, type VariantStockCheckResult } from "../lib/inventory/variant-stock.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const addCartLineSchema = z.object({
  item_id: NumericIdSchema,
  variant_id: NumericIdSchema.optional(),
  qty: z.number().int().positive().default(1),
  outlet_id: NumericIdSchema.optional(),
  discount_amount: z.number().finite().min(0).optional()
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _updateCartLineSchema = z.object({
  qty: z.number().int().nonnegative().optional(),
  discount_amount: z.number().finite().min(0).optional()
});

const posCartRoutes = new Hono();

// Auth middleware
posCartRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// POST /api/pos/cart/line - Add or update a cart line
posCartRoutes.post("/line", async (c) => {
  const auth = c.get("auth");

  // Parse and validate request body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Invalid JSON body", 400);
  }

  const parseResult = addCartLineSchema.safeParse(body);
  if (!parseResult.success) {
    return errorResponse("VALIDATION_ERROR", parseResult.error.message, 400);
  }

  const { item_id, variant_id, qty, outlet_id, discount_amount } = parseResult.data;

  try {
    // Resolve the effective price using variant price resolver
    const resolved = await resolvePrice(
      auth.companyId,
      item_id,
      variant_id ?? null,
      outlet_id ?? null
    );

    // Get variant details if variant_id provided
    let variantDetails: {
      sku: string | null;
      variant_name: string;
      barcode: string | null;
      stock_quantity: number | null;
    } | null = null;
    let stockCheck: VariantStockCheckResult | null = null;

    if (variant_id !== undefined) {
      const variant = await getVariantById(auth.companyId, variant_id);
      if (!variant) {
        return errorResponse("NOT_FOUND", "Variant not found", 404);
      }
      if (variant.item_id !== item_id) {
        return errorResponse("INVALID_REQUEST", "Variant does not belong to the specified item", 400);
      }
      if (!variant.is_active) {
        return errorResponse("INVALID_REQUEST", "Variant is not active", 400);
      }

      // Check variant stock availability if outlet_id provided
      let availableQty: number | null = null;
      if (outlet_id) {
        stockCheck = await checkVariantStockAvailability(
          auth.companyId,
          outlet_id,
          variant_id,
          qty
        );
        availableQty = stockCheck.available_quantity;
      }

      variantDetails = {
        sku: variant.sku,
        variant_name: variant.variant_name,
        barcode: variant.barcode,
        stock_quantity: availableQty
      };
    }

    // Check if stock is insufficient
    if (stockCheck && !stockCheck.available) {
      return errorResponse(
        "INSUFFICIENT_STOCK",
        `Insufficient stock for variant. Requested: ${qty}, Available: ${stockCheck.available_quantity}`,
        409
      );
    }

    // Return the resolved cart line
    return successResponse({
      item_id,
      variant_id: variant_id ?? null,
      qty,
      unit_price: resolved.price,
      price_id: resolved.price_id,
      is_variant_specific: resolved.is_variant_specific,
      source: resolved.source,
      discount_amount: discount_amount ?? 0,
      line_total: resolved.price * qty - (discount_amount ?? 0),
      sku_snapshot: variantDetails?.sku ?? null,
      variant_name_snapshot: variantDetails?.variant_name ?? null,
      barcode: variantDetails?.barcode ?? null,
      stock_quantity: variantDetails?.stock_quantity ?? null,
      is_valid: true
    });
  } catch (error) {
    console.error("POST /api/pos/cart/line failed", {
      company_id: auth.companyId,
      item_id,
      variant_id,
      error
    });

    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to add cart line", 500);
  }
});

// POST /api/pos/cart/validate - Validate adding an item to cart (price + stock check)
posCartRoutes.post("/validate", async (c) => {
  const auth = c.get("auth");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Invalid JSON body", 400);
  }

  const parseResult = addCartLineSchema.extend({
    qty: z.number().int().positive()
  }).safeParse(body);

  if (!parseResult.success) {
    return errorResponse("VALIDATION_ERROR", parseResult.error.message, 400);
  }

  const { item_id, variant_id, qty, outlet_id } = parseResult.data;

  try {
    // Check if variant exists and belongs to item
    let stockCheck: VariantStockCheckResult | null = null;
    
    if (variant_id !== undefined) {
      const variant = await getVariantById(auth.companyId, variant_id);
      if (!variant) {
        return errorResponse("NOT_FOUND", "Variant not found", 404);
      }
      if (variant.item_id !== item_id) {
        return errorResponse("INVALID_REQUEST", "Variant does not belong to the specified item", 400);
      }
      if (!variant.is_active) {
        return errorResponse("INVALID_REQUEST", "Variant is not active", 400);
      }

      // Check variant stock if outlet_id provided
      if (outlet_id) {
        stockCheck = await checkVariantStockAvailability(
          auth.companyId,
          outlet_id,
          variant_id,
          qty
        );
      }
    }

    // Resolve price
    const resolved = await resolvePrice(
      auth.companyId,
      item_id,
      variant_id ?? null,
      outlet_id ?? null
    );

    // Return validation result with stock info
    return successResponse({
      valid: stockCheck ? stockCheck.available : true,
      item_id,
      variant_id: variant_id ?? null,
      unit_price: resolved.price,
      is_variant_specific: resolved.is_variant_specific,
      source: resolved.source,
      stock_available: stockCheck?.available_quantity ?? null,
      stock_sufficient: stockCheck?.available ?? null
    });
  } catch (error) {
    console.error("POST /api/pos/cart/validate failed", {
      company_id: auth.companyId,
      item_id,
      variant_id,
      error
    });

    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to validate cart line", 500);
  }
});

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Add cart line request schema
 */
const AddCartLineRequestSchema = zodOpenApi
  .object({
    item_id: NumericIdSchema.openapi({ description: "Item ID" }),
    variant_id: NumericIdSchema.optional().openapi({ description: "Optional variant ID" }),
    qty: zodOpenApi.number().int().positive().default(1).openapi({ description: "Quantity" }),
    outlet_id: NumericIdSchema.optional().openapi({ description: "Optional outlet ID" }),
    discount_amount: zodOpenApi.number().min(0).optional().openapi({ description: "Optional discount amount" }),
  })
  .openapi("AddCartLineRequest");

/**
 * Cart line response schema
 */
const CartLineResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(true).openapi({ example: true }),
    data: zodOpenApi.object({
      item_id: NumericIdSchema.openapi({ description: "Item ID" }),
      variant_id: zodOpenApi.number().nullable().openapi({ description: "Variant ID" }),
      qty: zodOpenApi.number().int().openapi({ description: "Quantity" }),
      unit_price: zodOpenApi.number().openapi({ description: "Unit price" }),
      price_id: zodOpenApi.number().nullable().openapi({ description: "Price ID" }),
      is_variant_specific: zodOpenApi.boolean().openapi({ description: "Is variant specific" }),
      source: zodOpenApi.string().openapi({ description: "Price source" }),
      discount_amount: zodOpenApi.number().openapi({ description: "Discount amount" }),
      line_total: zodOpenApi.number().openapi({ description: "Line total" }),
      sku_snapshot: zodOpenApi.string().nullable().openapi({ description: "SKU snapshot" }),
      variant_name_snapshot: zodOpenApi.string().nullable().openapi({ description: "Variant name snapshot" }),
      barcode: zodOpenApi.string().nullable().openapi({ description: "Barcode" }),
      stock_quantity: zodOpenApi.number().nullable().openapi({ description: "Stock quantity" }),
      is_valid: zodOpenApi.boolean().openapi({ description: "Is valid" }),
    }),
  })
  .openapi("CartLineResponse");

/**
 * Cart validation response schema
 */
const CartValidationResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(true).openapi({ example: true }),
    data: zodOpenApi.object({
      valid: zodOpenApi.boolean().openapi({ description: "Is valid" }),
      item_id: NumericIdSchema.openapi({ description: "Item ID" }),
      variant_id: zodOpenApi.number().nullable().openapi({ description: "Variant ID" }),
      unit_price: zodOpenApi.number().openapi({ description: "Unit price" }),
      is_variant_specific: zodOpenApi.boolean().openapi({ description: "Is variant specific" }),
      source: zodOpenApi.string().openapi({ description: "Price source" }),
      stock_available: zodOpenApi.number().nullable().openapi({ description: "Available stock" }),
      stock_sufficient: zodOpenApi.boolean().nullable().openapi({ description: "Is stock sufficient" }),
    }),
  })
  .openapi("CartValidationResponse");

/**
 * POS cart error response schema
 */
const PosCartErrorResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(false).openapi({ example: false }),
    error: zodOpenApi.object({
      code: zodOpenApi.string().openapi({ description: "Error code" }),
      message: zodOpenApi.string().openapi({ description: "Error message" }),
    }),
  })
  .openapi("PosCartErrorResponse");

/**
 * Registers POS cart routes with an OpenAPIHono instance.
 */
export function registerPosCartRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  // POST /pos/cart/line - Add or update a cart line
  const cartLineRoute = createRoute({
    path: "/pos/cart/line",
    method: "post",
    tags: ["POS"],
    summary: "Add or update cart line",
    description: "Add or update a cart line with optional variant",
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: AddCartLineRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: CartLineResponseSchema } },
        description: "Cart line added",
      },
      400: {
        content: { "application/json": { schema: PosCartErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: PosCartErrorResponseSchema } },
        description: "Unauthorized",
      },
      404: {
        content: { "application/json": { schema: PosCartErrorResponseSchema } },
        description: "Variant not found",
      },
      409: {
        content: { "application/json": { schema: PosCartErrorResponseSchema } },
        description: "Insufficient stock",
      },
      500: {
        content: { "application/json": { schema: PosCartErrorResponseSchema } },
        description: "Internal server error",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(cartLineRoute, (async (c: any) => {
    const auth = c.get("auth");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid JSON body", 400);
    }

    const parseResult = addCartLineSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse("VALIDATION_ERROR", parseResult.error.message, 400);
    }

    const { item_id, variant_id, qty, outlet_id, discount_amount } = parseResult.data;

    try {
      const resolved = await resolvePrice(
        auth.companyId,
        item_id,
        variant_id ?? null,
        outlet_id ?? null
      );

      let variantDetails: {
        sku: string | null;
        variant_name: string;
        barcode: string | null;
        stock_quantity: number | null;
      } | null = null;
      let stockCheck: VariantStockCheckResult | null = null;

      if (variant_id !== undefined) {
        const variant = await getVariantById(auth.companyId, variant_id);
        if (!variant) {
          return errorResponse("NOT_FOUND", "Variant not found", 404);
        }
        if (variant.item_id !== item_id) {
          return errorResponse("INVALID_REQUEST", "Variant does not belong to the specified item", 400);
        }
        if (!variant.is_active) {
          return errorResponse("INVALID_REQUEST", "Variant is not active", 400);
        }

        let availableQty: number | null = null;
        if (outlet_id) {
          stockCheck = await checkVariantStockAvailability(
            auth.companyId,
            outlet_id,
            variant_id,
            qty
          );
          availableQty = stockCheck.available_quantity;
        }

        variantDetails = {
          sku: variant.sku,
          variant_name: variant.variant_name,
          barcode: variant.barcode,
          stock_quantity: availableQty
        };
      }

      if (stockCheck && !stockCheck.available) {
        return errorResponse(
          "INSUFFICIENT_STOCK",
          `Insufficient stock for variant. Requested: ${qty}, Available: ${stockCheck.available_quantity}`,
          409
        );
      }

      return successResponse({
        item_id,
        variant_id: variant_id ?? null,
        qty,
        unit_price: resolved.price,
        price_id: resolved.price_id,
        is_variant_specific: resolved.is_variant_specific,
        source: resolved.source,
        discount_amount: discount_amount ?? 0,
        line_total: resolved.price * qty - (discount_amount ?? 0),
        sku_snapshot: variantDetails?.sku ?? null,
        variant_name_snapshot: variantDetails?.variant_name ?? null,
        barcode: variantDetails?.barcode ?? null,
        stock_quantity: variantDetails?.stock_quantity ?? null,
        is_valid: true
      });
    } catch (error) {
      console.error("POST /api/pos/cart/line failed", {
        company_id: auth.companyId,
        item_id,
        variant_id,
        error
      });

      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to add cart line", 500);
    }
  }) as any);

  // POST /pos/cart/validate - Validate adding an item to cart
  const cartValidateRoute = createRoute({
    path: "/pos/cart/validate",
    method: "post",
    tags: ["POS"],
    summary: "Validate cart line",
    description: "Validate adding an item to cart (price + stock check)",
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: AddCartLineRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: CartValidationResponseSchema } },
        description: "Validation result",
      },
      400: {
        content: { "application/json": { schema: PosCartErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: PosCartErrorResponseSchema } },
        description: "Unauthorized",
      },
      404: {
        content: { "application/json": { schema: PosCartErrorResponseSchema } },
        description: "Variant not found",
      },
      500: {
        content: { "application/json": { schema: PosCartErrorResponseSchema } },
        description: "Internal server error",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(cartValidateRoute, (async (c: any) => {
    const auth = c.get("auth");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid JSON body", 400);
    }

    const parseResult = addCartLineSchema.extend({
      qty: z.number().int().positive()
    }).safeParse(body);

    if (!parseResult.success) {
      return errorResponse("VALIDATION_ERROR", parseResult.error.message, 400);
    }

    const { item_id, variant_id, qty, outlet_id } = parseResult.data;

    try {
      let stockCheck: VariantStockCheckResult | null = null;

      if (variant_id !== undefined) {
        const variant = await getVariantById(auth.companyId, variant_id);
        if (!variant) {
          return errorResponse("NOT_FOUND", "Variant not found", 404);
        }
        if (variant.item_id !== item_id) {
          return errorResponse("INVALID_REQUEST", "Variant does not belong to the specified item", 400);
        }
        if (!variant.is_active) {
          return errorResponse("INVALID_REQUEST", "Variant is not active", 400);
        }

        if (outlet_id) {
          stockCheck = await checkVariantStockAvailability(
            auth.companyId,
            outlet_id,
            variant_id,
            qty
          );
        }
      }

      const resolved = await resolvePrice(
        auth.companyId,
        item_id,
        variant_id ?? null,
        outlet_id ?? null
      );

      return successResponse({
        valid: stockCheck ? stockCheck.available : true,
        item_id,
        variant_id: variant_id ?? null,
        unit_price: resolved.price,
        is_variant_specific: resolved.is_variant_specific,
        source: resolved.source,
        stock_available: stockCheck?.available_quantity ?? null,
        stock_sufficient: stockCheck?.available ?? null
      });
    } catch (error) {
      console.error("POST /api/pos/cart/validate failed", {
        company_id: auth.companyId,
        item_id,
        variant_id,
        error
      });

      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to validate cart line", 500);
    }
  }) as any);
}

export { posCartRoutes };
