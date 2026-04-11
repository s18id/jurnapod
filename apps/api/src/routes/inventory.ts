// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Routes
 *
 * Routes for inventory management:
 * - GET /inventory/items - List items with filtering
 * - GET /inventory/items/:id - Get single item
 * - POST /inventory/items - Create new item
 *
 * Required role: OWNER, ADMIN, ACCOUNTANT, or CASHIER (read operations)
 * 
 * Architecture: Thin HTTP adapter - all business logic delegated to @jurnapod/modules-inventory
 */

import { Hono } from "hono";
import { z } from "zod";
import { z as zodOpenApi, createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import {
  ItemCreateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext,
  type AuthenticatedRouteGuard
} from "../lib/auth-guard.js";
import { userHasOutletAccess } from "../lib/auth.js";
import { errorResponse, successResponse } from "../lib/response.js";
import { itemsAdapter } from "../lib/items/adapter.js";
import { itemPricesAdapter } from "../lib/item-prices/adapter.js";
import {
  DatabaseConflictError,
  DatabaseReferenceError,
  DatabaseForbiddenError
} from "../lib/master-data-errors.js";
import { itemGroupsAdapter } from "../lib/item-groups/adapter.js";
import { ItemGroupBulkConflictError, InventoryReferenceError, InventoryForbiddenError, InventoryConflictError } from "@jurnapod/modules-inventory";
import { checkUserAccess } from "../lib/auth.js";
import { canManageCompanyDefaults } from "../lib/auth/permissions.js";
import type { ModulePermission } from "@jurnapod/auth";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Request Schemas
// =============================================================================

const ItemPriceCreateSchema = z.object({
  item_id: z.number().int().positive(),
  outlet_id: z.number().int().positive().nullable(),
  variant_id: z.number().int().positive().nullable().optional(),
  price: z.number().positive(),
  is_active: z.boolean().optional().default(true)
});

const ItemPriceUpdateSchema = z.object({
  variant_id: z.number().int().positive().nullable().optional(),
  price: z.number().positive().optional(),
  is_active: z.boolean().optional()
});

// =============================================================================
// Helper Functions
// =============================================================================

function parseOptionalIsActive(value: string | null): boolean | undefined {
  if (value == null) {
    return undefined;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  return undefined;
}

/**
 * Creates a reusable access check guard for inventory module permissions.
 * Reduces repeated auth pattern in routes.
 * Uses resource-level permission check for inventory.items
 */
function requireInventoryAccess(permission: ModulePermission): AuthenticatedRouteGuard {
  return requireAccess({
    module: "inventory",
    resource: "items",
    permission
  });
}

/**
 * Check if user can access company defaults (global role check).
 */
async function canAccessCompanyDefaults(userId: number, companyId: number): Promise<boolean> {
  const access = await checkUserAccess({ userId, companyId });
  return access?.hasGlobalRole || access?.isSuperAdmin || false;
}

// =============================================================================
// Inventory Routes
// =============================================================================

const inventoryRoutes = new Hono();

// Auth middleware
inventoryRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /inventory/items - List items with filtering
inventoryRoutes.get("/items", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireInventoryAccess("read")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const url = new URL(c.req.raw.url);
    const companyIdRaw = url.searchParams.get("company_id");

    // Validate company_id if provided
    if (companyIdRaw != null) {
      const companyId = NumericIdSchema.parse(companyIdRaw);
      if (companyId !== auth.companyId) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
    }

    const isActive = parseOptionalIsActive(url.searchParams.get("is_active"));
    const items = await itemsAdapter.listItems(auth.companyId, { isActive });

    return successResponse(items);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
    }

    console.error("GET /inventory/items failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Items request failed", 500);
  }
});

// GET /inventory/variant-stats - Get variant statistics for multiple items
inventoryRoutes.get("/variant-stats", async (c) => {
  const auth = c.get("auth");
  
  // Check access permission using bitmask system
  const accessResult = await requireInventoryAccess("read")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const url = new URL(c.req.raw.url);
    const itemIdsParam = url.searchParams.get("item_ids");

    if (!itemIdsParam) {
      return errorResponse("INVALID_REQUEST", "item_ids parameter is required", 400);
    }

    // Parse comma-separated item IDs
    const itemIds: number[] = [];
    for (const id of itemIdsParam.split(",")) {
      const parsed = parseInt(id.trim(), 10);
      if (isNaN(parsed) || parsed <= 0) {
        return errorResponse("INVALID_REQUEST", `Invalid item ID: ${id}`, 400);
      }
      itemIds.push(parsed);
    }

    if (itemIds.length === 0) {
      return successResponse([]);
    }

    // Limit to prevent abuse
    if (itemIds.length > 100) {
      return errorResponse("INVALID_REQUEST", "Too many item IDs (max 100)", 400);
    }

    const stats = await itemsAdapter.getItemVariantStats(auth.companyId, itemIds);
    return successResponse(stats);
  } catch (error) {
    // Only unexpected errors reach here (invalid-ID is handled above with early return)
    console.error("GET /inventory/variant-stats failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch variant stats", 500);
  }
});

// GET /inventory/items/:id - Get single item
inventoryRoutes.get("/items/:id", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireInventoryAccess("read")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const itemId = NumericIdSchema.parse(c.req.param("id"));

    // Get item by ID with company scoping - delegated to itemsAdapter
    const item = await itemsAdapter.findItemById(auth.companyId, itemId);

    if (!item) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

    return successResponse(item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
    }

    console.error("GET /inventory/items/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item request failed", 500);
  }
});

// POST /inventory/items - Create new item
inventoryRoutes.post("/items", async (c) => {
  const auth = c.get("auth");

  // Check access permission using bitmask system
  const accessResult = await requireInventoryAccess("create")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = ItemCreateRequestSchema.parse(payload);

    const item = await itemsAdapter.createItem(auth.companyId, {
      sku: input.sku,
      name: input.name,
      type: input.type,
      item_group_id: input.item_group_id,
      cogs_account_id: input.cogs_account_id,
      inventory_asset_account_id: input.inventory_asset_account_id,
      is_active: input.is_active
    }, {
      userId: auth.userId
    });

    return successResponse(item, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof InventoryConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", "Item conflict", 409);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Item group not found", 404);
    }

    console.error("POST /inventory/items failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Items request failed", 500);
  }
});

// PATCH /inventory/items/:id - Update item
inventoryRoutes.patch("/items/:id", async (c) => {
  const auth = c.get("auth");

  // Check access permission using bitmask system
  const accessResult = await requireInventoryAccess("update")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const itemId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();

    // Check if item exists
    const existingItem = await itemsAdapter.findItemById(auth.companyId, itemId);
    if (!existingItem) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

    const updatedItem = await itemsAdapter.updateItem(auth.companyId, itemId, payload, {
      userId: auth.userId
    });

    return successResponse(updatedItem);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof Error && error.message === "No fields to update") {
      return errorResponse("INVALID_REQUEST", "No fields to update", 400);
    }

    if (error instanceof InventoryConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", "Item conflict", 409);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Referenced resource not found", 404);
    }

    console.error("PATCH /inventory/items/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item update failed", 500);
  }
});

// DELETE /inventory/items/:id - Delete item
inventoryRoutes.delete("/items/:id", async (c) => {
  const auth = c.get("auth");

  // Check access permission using bitmask system
  const accessResult = await requireInventoryAccess("delete")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const itemId = NumericIdSchema.parse(c.req.param("id"));

    // Check if item exists
    const existingItem = await itemsAdapter.findItemById(auth.companyId, itemId);
    if (!existingItem) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

    await itemsAdapter.deleteItem(auth.companyId, itemId, {
      userId: auth.userId
    });

    return successResponse({
      id: itemId,
      deleted: true
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

    console.error("DELETE /inventory/items/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item deletion failed", 500);
  }
});

// GET /inventory/item-groups - List item groups
inventoryRoutes.get("/item-groups", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireInventoryAccess("read")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    // Delegated to itemGroupsAdapter - no legacy lib imports
    const groups = await itemGroupsAdapter.listItemGroups(auth.companyId);
    return successResponse(groups);
  } catch (error) {
    console.error("GET /inventory/item-groups failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item groups request failed", 500);
  }
});

// GET /inventory/item-groups/:id - Get single item group
inventoryRoutes.get("/item-groups/:id", async (c) => {
  const auth = c.get("auth");

  // Check access permission using bitmask
  const accessResult = await requireInventoryAccess("read")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const groupId = NumericIdSchema.parse(c.req.param("id"));
    // Delegated to itemGroupsAdapter - no legacy lib imports
    const group = await itemGroupsAdapter.findItemGroupById(auth.companyId, groupId);

    if (!group) {
      return errorResponse("NOT_FOUND", "Item group not found", 404);
    }

    return successResponse(group);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid item group ID", 400);
    }

    console.error("GET /inventory/item-groups/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item group not found", 500);
  }
});

// POST /inventory/item-groups - Create item group
inventoryRoutes.post("/item-groups", async (c) => {
  const auth = c.get("auth");

  // Check access permission using bitmask
  const accessResult = await requireInventoryAccess("create")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = z.object({
      code: z.string().max(32).optional(),
      name: z.string().min(1).max(100),
      parent_id: NumericIdSchema.optional().nullable(),
      is_active: z.boolean().optional().default(true)
    }).parse(payload);

    const group = await itemGroupsAdapter.createItemGroup(auth.companyId, {
      code: input.code,
      name: input.name,
      parent_id: input.parent_id,
      is_active: input.is_active
    });

    return successResponse(group, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof InventoryReferenceError) {
      return errorResponse("NOT_FOUND", "Parent item group not found", 404);
    }

    if (error instanceof InventoryConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Parent item group not found", 404);
    }

    console.error("POST /inventory/item-groups failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item group creation failed", 500);
  }
});

// POST /inventory/item-groups/bulk - Bulk create item groups
inventoryRoutes.post("/item-groups/bulk", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireInventoryAccess("create")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = z.object({
      rows: z.array(
        z.object({
          code: z.string().max(32).nullish(),
          name: z.string().min(1).max(100),
          parent_code: z.string().max(32).nullish(),
          is_active: z.boolean().optional().default(true)
        })
      ).min(1)
    }).parse(payload);

    // Transform to match ItemGroupBulkRow type
    const rows = input.rows.map((r) => ({
      code: r.code ?? null,
      name: r.name,
      parent_code: r.parent_code ?? null,
      is_active: r.is_active
    }));

    const result = await itemGroupsAdapter.createItemGroupsBulk(auth.companyId, rows, {
      userId: auth.userId
    });

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof ItemGroupBulkConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    console.error("POST /inventory/item-groups/bulk failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Bulk item group creation failed", 500);
  }
});

// PATCH /inventory/item-groups/:id - Update item group
inventoryRoutes.patch("/item-groups/:id", async (c) => {
  const auth = c.get("auth");

  // Check access permission using bitmask
  const accessResult = await requireInventoryAccess("update")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const groupId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = z.object({
      code: z.string().max(32).optional().nullable(),
      name: z.string().min(1).max(100).optional(),
      parent_id: NumericIdSchema.optional().nullable(),
      is_active: z.boolean().optional()
    }).parse(payload);

    const group = await itemGroupsAdapter.updateItemGroup(auth.companyId, groupId, {
      code: input.code,
      name: input.name,
      parent_id: input.parent_id,
      is_active: input.is_active
    });

    if (!group) {
      return errorResponse("NOT_FOUND", "Item group not found", 404);
    }

    return successResponse(group);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof InventoryReferenceError) {
      return errorResponse("NOT_FOUND", "Parent item group not found", 404);
    }

    if (error instanceof InventoryConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Parent item group not found", 404);
    }

    console.error("PATCH /inventory/item-groups/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item group update failed", 500);
  }
});

// DELETE /inventory/item-groups/:id - Delete item group
inventoryRoutes.delete("/item-groups/:id", async (c) => {
  const auth = c.get("auth");

  // Check access permission using bitmask
  const accessResult = await requireInventoryAccess("delete")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const groupId = NumericIdSchema.parse(c.req.param("id"));

    const deleted = await itemGroupsAdapter.deleteItemGroup(auth.companyId, groupId);

    if (!deleted) {
      return errorResponse("NOT_FOUND", "Item group not found", 404);
    }

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid item group ID", 400);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Item group not found", 404);
    }

    console.error("DELETE /inventory/item-groups/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item group deletion failed", 500);
  }
});

// GET /inventory/item-prices/active - Get active prices for outlet
inventoryRoutes.get("/item-prices/active", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireInventoryAccess("read")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const url = new URL(c.req.raw.url);
    const outletId = url.searchParams.get("outlet_id");

    if (!outletId) {
      return errorResponse("INVALID_REQUEST", "outlet_id is required", 400);
    }

    const outletIdNum = NumericIdSchema.parse(outletId);

    // Check if user can access company defaults (requires global role)
    const userCanSeeCompanyDefaults = await canManageCompanyDefaults(
      auth.userId,
      auth.companyId,
      "inventory",
      "read"
    );

    // List effective prices
    const prices = await itemPricesAdapter.listEffectiveItemPricesForOutlet(auth.companyId, outletIdNum, { isActive: true });

    // Filter out company defaults if user doesn't have access to them
    // Company defaults have is_override = false
    const filteredPrices = userCanSeeCompanyDefaults 
      ? prices 
      : prices.filter(price => price.is_override);

    return successResponse(filteredPrices);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
    }
    
    if (error instanceof InventoryReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    
    if (error instanceof InventoryForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
    
    if (error instanceof InventoryConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    console.error("GET /inventory/item-prices/active failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Prices request failed", 500);
  }
});

// POST /inventory/item-prices - Create new item price
inventoryRoutes.post("/item-prices", async (c) => {
  const auth = c.get("auth");
  
  // Check access permission using bitmask system
  const accessResult = await requireInventoryAccess("create")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = ItemPriceCreateSchema.parse(payload);

    // Check if user can manage company defaults using bitmask permission
    const userCanManageCompanyDefaults = await canManageCompanyDefaults(
      auth.userId,
      auth.companyId,
      "inventory",
      "create"
    );

    // If creating a company default (outlet_id is null), check permission
    if (input.outlet_id === null && !userCanManageCompanyDefaults) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const price = await itemPricesAdapter.createItemPrice(auth.companyId, {
      item_id: input.item_id,
      outlet_id: input.outlet_id,
      variant_id: input.variant_id ?? null,
      price: input.price,
      is_active: input.is_active
    }, {
      userId: auth.userId,
      canManageCompanyDefaults: userCanManageCompanyDefaults
    });

    return successResponse(price, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof InventoryReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof InventoryConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof InventoryForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    // Keep legacy error types for backwards compatibility
    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", "Item price conflict", 409);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Item or outlet not found", 404);
    }

    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    console.error("POST /inventory/item-prices failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item price creation failed", 500);
  }
});

// GET /inventory/item-prices - List item prices
inventoryRoutes.get("/item-prices", async (c) => {
  const auth = c.get("auth");
  
  // Check access permission using bitmask system
  const accessResult = await requireInventoryAccess("read")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const url = new URL(c.req.raw.url);
    const outletIdParam = url.searchParams.get("outlet_id");
    
    // Check if user can access company defaults
    const canAccessDefaults = await canAccessCompanyDefaults(auth.userId, auth.companyId);

    let itemPrices;
    if (outletIdParam) {
      const outletId = NumericIdSchema.parse(outletIdParam);
      // When filtering by outlet, only include company defaults if user has access
      itemPrices = await itemPricesAdapter.listItemPrices(auth.companyId, {
        outletId,
        includeDefaults: canAccessDefaults
      });
    } else {
      itemPrices = await itemPricesAdapter.listItemPrices(auth.companyId);
    }

    return successResponse(itemPrices);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
    }
    
    if (error instanceof InventoryReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    
    if (error instanceof InventoryForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
    
    if (error instanceof InventoryConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    console.error("GET /inventory/item-prices failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item prices request failed", 500);
  }
});

// GET /inventory/item-prices/:id - Get item price by ID
inventoryRoutes.get("/item-prices/:id", async (c) => {
  const auth = c.get("auth");
  
  // Check access permission using bitmask system
  const accessResult = await requireInventoryAccess("read")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const priceId = NumericIdSchema.parse(c.req.param("id"));

    const itemPrice = await itemPricesAdapter.findItemPriceById(auth.companyId, priceId);
    if (!itemPrice) {
      return errorResponse("NOT_FOUND", "Item price not found", 404);
    }

    // Check if this is a company default price (outlet_id is null)
    if (itemPrice.outlet_id === null) {
      // Check if user has global role to access company defaults
      const canManageDefaults = await canAccessCompanyDefaults(auth.userId, auth.companyId);
      if (!canManageDefaults) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
    } else {
      // For outlet-specific prices, check outlet access
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, itemPrice.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
    }

    return successResponse(itemPrice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid price ID", 400);
    }

    if (error instanceof InventoryReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Item price not found", 404);
    }

    console.error("GET /inventory/item-prices/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item price request failed", 500);
  }
});

// PATCH /inventory/item-prices/:id - Update item price
inventoryRoutes.patch("/item-prices/:id", async (c) => {
  const auth = c.get("auth");
  
  // Check access permission using bitmask system
  const accessResult = await requireInventoryAccess("update")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const priceId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = ItemPriceUpdateSchema.parse(payload);

    // Check if item price exists and validate outlet access
    const existingPrice = await itemPricesAdapter.findItemPriceById(auth.companyId, priceId);
    if (!existingPrice) {
      return errorResponse("NOT_FOUND", "Item price not found", 404);
    }

    // Check if user has global role (for company defaults)
    const canManageDefaults = await canAccessCompanyDefaults(auth.userId, auth.companyId);

    // Validate outlet access if the price is outlet-specific
    if (existingPrice.outlet_id) {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingPrice.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
    } else if (!canManageDefaults) {
      // Company default price requires global role
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const updatedItemPrice = await itemPricesAdapter.updateItemPrice(auth.companyId, priceId, {
      variant_id: input.variant_id,
      price: input.price,
      is_active: input.is_active
    }, {
      userId: auth.userId,
      canManageCompanyDefaults: canManageDefaults
    });

    return successResponse(updatedItemPrice);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    if (error instanceof InventoryReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof InventoryConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof InventoryForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    // Keep legacy error types for backwards compatibility
    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Item price not found", 404);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", "Item price conflict", 409);
    }

    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    console.error("PATCH /inventory/item-prices/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item price update failed", 500);
  }
});

// DELETE /inventory/item-prices/:id - Delete item price
inventoryRoutes.delete("/item-prices/:id", async (c) => {
  const auth = c.get("auth");
  
  // Check access permission using bitmask system
  const accessResult = await requireInventoryAccess("delete")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const priceId = NumericIdSchema.parse(c.req.param("id"));

    // Check if user has global role (for company defaults) before calling delete
    const canManageDefaults = await canAccessCompanyDefaults(auth.userId, auth.companyId);

    const deleted = await itemPricesAdapter.deleteItemPrice(auth.companyId, priceId, {
      userId: auth.userId,
      canManageCompanyDefaults: canManageDefaults
    });

    if (!deleted) {
      return errorResponse("NOT_FOUND", "Item price not found", 404);
    }

    return successResponse({
      id: priceId,
      deleted: true
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid price ID", 400);
    }

    if (error instanceof InventoryReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof InventoryForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    // Keep legacy error types for backwards compatibility
    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Item price not found", 404);
    }

    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    console.error("DELETE /inventory/item-prices/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item price deletion failed", 500);
  }
});

// GET /inventory/items/:id/variants/:variantId/prices - List variant-specific prices
inventoryRoutes.get("/items/:id/variants/:variantId/prices", async (c) => {
  const auth = c.get("auth");
  
  // Check access permission
  const accessResult = await requireInventoryAccess("read")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const itemId = NumericIdSchema.parse(c.req.param("id"));
    const variantId = NumericIdSchema.parse(c.req.param("variantId"));

    const url = new URL(c.req.raw.url);
    const outletIdParam = url.searchParams.get("outlet_id");
    
    // Check if user can access company defaults
    const canAccessDefaults = await canAccessCompanyDefaults(auth.userId, auth.companyId);

    let variantPrices;
    if (outletIdParam) {
      const outletId = NumericIdSchema.parse(outletIdParam);
      variantPrices = await itemPricesAdapter.listItemPrices(auth.companyId, {
        itemId,
        outletId,
        variantId,
        includeDefaults: canAccessDefaults
      });
    } else {
      variantPrices = await itemPricesAdapter.listItemPrices(auth.companyId, {
        itemId,
        variantId
      });
    }

    return successResponse(variantPrices);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
    }
    
    if (error instanceof InventoryReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    
    if (error instanceof InventoryForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
    
    if (error instanceof InventoryConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    console.error("GET /inventory/items/:id/variants/:variantId/prices failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Variant prices request failed", 500);
  }
});

// GET /inventory/items/:id/prices - List all prices for an item (including variant prices)
inventoryRoutes.get("/items/:id/prices", async (c) => {
  const auth = c.get("auth");
  
  // Check access permission
  const accessResult = await requireInventoryAccess("read")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const itemId = NumericIdSchema.parse(c.req.param("id"));

    const url = new URL(c.req.raw.url);
    const outletIdParam = url.searchParams.get("outlet_id");
    
    // Check if user can access company defaults
    const canAccessDefaults = await canAccessCompanyDefaults(auth.userId, auth.companyId);

    let itemPrices;
    if (outletIdParam) {
      const outletId = NumericIdSchema.parse(outletIdParam);
      // Filter at package level using itemId - no post-filtering in route
      itemPrices = await itemPricesAdapter.listItemPrices(auth.companyId, {
        outletId,
        itemId,
        includeDefaults: canAccessDefaults
      });
    } else {
      // Filter at package level using itemId - no post-filtering in route
      itemPrices = await itemPricesAdapter.listItemPrices(auth.companyId, {
        itemId
      });
    }

    return successResponse(itemPrices);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
    }
    
    if (error instanceof InventoryReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    
    if (error instanceof InventoryForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
    
    if (error instanceof InventoryConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    console.error("GET /inventory/items/:id/prices failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item prices request failed", 500);
  }
});

// ============================================================================
// OpenAPI Route Registration (for use with OpenAPIHono)
// ============================================================================

/**
 * Registers inventory routes with an OpenAPIHono instance.
 * This enables auto-generated OpenAPI specs for the inventory endpoints.
 */
export function registerInventoryRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  // GET /inventory/items - List items
  const listItemsRoute = createRoute({
    path: "/inventory/items",
    method: "get",
    tags: ["Inventory"],
    summary: "List items",
    description: "List inventory items with optional filtering",
    security: [{ BearerAuth: [] }],
    request: {
      query: z.object({
        company_id: NumericIdSchema.optional(),
        is_active: z.string().optional(),
      }),
    },
    responses: {
      200: { description: "List of items" },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(listItemsRoute, (async (c: any) => {
    const auth = c.get("auth");
    const query = c.req.valid("query") || {};
    
    if (query.company_id && query.company_id !== auth.companyId) {
      return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid request" } }, 400);
    }

    const isActive = query.is_active === "true" ? true : query.is_active === "false" ? false : undefined;
    const items = await itemsAdapter.listItems(auth.companyId, { isActive });

    return c.json({ success: true, data: items });
  }) as any);

  // GET /inventory/items/:id - Get single item
  const getItemRoute = createRoute({
    path: "/inventory/items/{id}",
    method: "get",
    tags: ["Inventory"],
    summary: "Get item",
    description: "Get a single inventory item by ID",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: NumericIdSchema,
      }),
    },
    responses: {
      200: { description: "Item details" },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      404: { description: "Item not found" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(getItemRoute, (async (c: any) => {
    const auth = c.get("auth");
    const { id } = c.req.valid("param");
    const itemId = NumericIdSchema.parse(id);

    const item = await itemsAdapter.findItemById(auth.companyId, itemId);
    if (!item) {
      return c.json({ success: false, error: { code: "NOT_FOUND", message: "Item not found" } }, 404);
    }

    return c.json({ success: true, data: item });
  }) as any);

  // POST /inventory/items - Create item
  const createItemRoute = createRoute({
    path: "/inventory/items",
    method: "post",
    tags: ["Inventory"],
    summary: "Create item",
    description: "Create a new inventory item",
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: ItemCreateRequestSchema,
          },
        },
      },
    },
    responses: {
      201: { description: "Item created" },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      409: { description: "Item conflict" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(createItemRoute, (async (c: any) => {
    const auth = c.get("auth");
    const payload = await c.req.json();
    const input = ItemCreateRequestSchema.parse(payload);

    const item = await itemsAdapter.createItem(auth.companyId, {
      sku: input.sku,
      name: input.name,
      type: input.type,
      item_group_id: input.item_group_id,
      cogs_account_id: input.cogs_account_id,
      inventory_asset_account_id: input.inventory_asset_account_id,
      is_active: input.is_active
    }, { userId: auth.userId });

    return c.json({ success: true, data: item }, 201);
  }) as any);

  // GET /inventory/item-groups - List item groups
  const listItemGroupsRoute = createRoute({
    path: "/inventory/item-groups",
    method: "get",
    tags: ["Inventory"],
    summary: "List item groups",
    description: "List inventory item groups",
    security: [{ BearerAuth: [] }],
    responses: {
      200: { description: "List of item groups" },
      401: { description: "Unauthorized" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(listItemGroupsRoute, (async (c: any) => {
    const auth = c.get("auth");
    const groups = await itemGroupsAdapter.listItemGroups(auth.companyId);
    return c.json({ success: true, data: groups });
  }) as any);
}

export { inventoryRoutes };
