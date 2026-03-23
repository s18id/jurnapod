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
 */

import { Hono } from "hono";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import {
  ItemCreateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { userHasOutletAccess, MODULE_PERMISSION_BITS } from "../lib/auth.js";
import { errorResponse, successResponse } from "../lib/response.js";
import { getDbPool } from "../lib/db.js";
import {
  createItem,
  updateItem,
  deleteItem,
  listItems,
  getItemVariantStats,
  createItemPrice,
  updateItemPrice,
  deleteItemPrice,
  findItemPriceById,
  findItemById,
  listItemPrices,
  DatabaseConflictError,
  DatabaseReferenceError,
  DatabaseForbiddenError
} from "../lib/master-data.js";
import { checkUserAccess } from "../lib/auth.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

const INVENTORY_ROLES_READ = ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT", "CASHIER"] as const;
const INVENTORY_ROLES_WRITE = ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"] as const;

type AccessCheckRow = RowDataPacket & {
  id: number;
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if user can manage company defaults using bitmask permission system.
 * Company defaults require:
 * 1. A global role assignment (outlet_id IS NULL)
 * 2. The appropriate permission bit set in module_roles.permission_mask
 * 
 * @param userId - User ID
 * @param companyId - Company ID
 * @param permission - Required permission (create, read, update, delete)
 * @returns true if user can manage company defaults
 */
async function canManageCompanyDefaults(
  userId: number,
  companyId: number,
  permission: "create" | "read" | "update" | "delete" = "create"
): Promise<boolean> {
  const pool = getDbPool();
  const permissionBit = MODULE_PERMISSION_BITS[permission];

  const [rows] = await pool.execute<AccessCheckRow[]>(
    `SELECT 1
     FROM user_role_assignments ura
     INNER JOIN roles r ON r.id = ura.role_id
     INNER JOIN module_roles mr ON mr.role_id = r.id
     WHERE ura.user_id = ?
       AND r.is_global = 1
       AND ura.outlet_id IS NULL
       AND mr.module = 'inventory'
       AND mr.company_id = ?
       AND (mr.permission_mask & ?) <> 0
     LIMIT 1`,
    [userId, companyId, permissionBit]
  );

  return rows.length > 0;
}

// =============================================================================
// Request Schemas
// =============================================================================

const ItemPriceCreateSchema = z.object({
  item_id: z.number().int().positive(),
  outlet_id: z.number().int().positive().nullable(),
  price: z.number().positive(),
  is_active: z.boolean().optional().default(true)
});

const ItemPriceUpdateSchema = z.object({
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
  const accessResult = await requireAccess({
    roles: [...INVENTORY_ROLES_READ],
    module: "inventory",
    permission: "read"
  })(c.req.raw, auth);

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
    const items = await listItems(auth.companyId, { isActive });

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
  try {
    const auth = c.get("auth");
    
  // Check access permission using bitmask system
  const accessResult = await requireAccess({
    module: "inventory",
    permission: "read"
  })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const itemIdsParam = url.searchParams.get("item_ids");

    if (!itemIdsParam) {
      return errorResponse("INVALID_REQUEST", "item_ids parameter is required", 400);
    }

    // Parse comma-separated item IDs
    const itemIds = itemIdsParam.split(",").map(id => {
      const parsed = parseInt(id.trim(), 10);
      if (isNaN(parsed) || parsed <= 0) {
        throw new Error(`Invalid item ID: ${id}`);
      }
      return parsed;
    });

    if (itemIds.length === 0) {
      return successResponse([]);
    }

    // Limit to prevent abuse
    if (itemIds.length > 100) {
      return errorResponse("INVALID_REQUEST", "Too many item IDs (max 100)", 400);
    }

    const stats = await getItemVariantStats(auth.companyId, itemIds);
    return successResponse(stats);
  } catch (error) {
    console.error("GET /inventory/variant-stats failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch variant stats", 500);
  }
});

// GET /inventory/items/:id - Get single item
inventoryRoutes.get("/items/:id", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...INVENTORY_ROLES_READ],
    module: "inventory",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const itemId = NumericIdSchema.parse(c.req.param("id"));

    // Get item by ID with company scoping
    const { getItemById } = await import("../lib/item-variants.js");
    const item = await getItemById(itemId, auth.companyId);

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
  const accessResult = await requireAccess({
    module: "inventory",
    permission: "create"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = ItemCreateRequestSchema.parse(payload);

    const item = await createItem(auth.companyId, {
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
  const accessResult = await requireAccess({
    module: "inventory",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const itemId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();

    // Check if item exists
    const existingItem = await findItemById(auth.companyId, itemId);
    if (!existingItem) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

    const updatedItem = await updateItem(auth.companyId, itemId, payload, {
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
  const accessResult = await requireAccess({
    module: "inventory",
    permission: "delete"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const itemId = NumericIdSchema.parse(c.req.param("id"));

    // Check if item exists
    const existingItem = await findItemById(auth.companyId, itemId);
    if (!existingItem) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

    await deleteItem(auth.companyId, itemId, {
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
  const accessResult = await requireAccess({
    roles: [...INVENTORY_ROLES_READ],
    module: "inventory",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const { listItemGroups } = await import("../lib/master-data.js");
    const groups = await listItemGroups(auth.companyId);
    return successResponse(groups);
  } catch (error) {
    console.error("GET /inventory/item-groups failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item groups request failed", 500);
  }
});

// GET /inventory/item-prices/active - Get active prices for outlet
inventoryRoutes.get("/item-prices/active", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...INVENTORY_ROLES_READ],
    module: "inventory",
    permission: "read"
  })(c.req.raw, auth);

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
      "read"
    );

    // List effective prices
    const { listEffectiveItemPricesForOutlet } = await import("../lib/master-data.js");
    const prices = await listEffectiveItemPricesForOutlet(auth.companyId, outletIdNum, { isActive: true });

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

    console.error("GET /inventory/item-prices/active failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Prices request failed", 500);
  }
});

// POST /inventory/item-prices - Create new item price
inventoryRoutes.post("/item-prices", async (c) => {
  try {
    const auth = c.get("auth");
    
  // Check access permission using bitmask system
  const accessResult = await requireAccess({
    module: "inventory",
    permission: "create"
  })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = ItemPriceCreateSchema.parse(payload);

    // Check if user can manage company defaults using bitmask permission
    const userCanManageCompanyDefaults = await canManageCompanyDefaults(
      auth.userId,
      auth.companyId,
      "create"
    );

    // If creating a company default (outlet_id is null), check permission
    if (input.outlet_id === null && !userCanManageCompanyDefaults) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const price = await createItemPrice(auth.companyId, {
      item_id: input.item_id,
      outlet_id: input.outlet_id,
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
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "inventory",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const outletIdParam = url.searchParams.get("outlet_id");
    
    // Check if user can access company defaults
    const access = await checkUserAccess({
      userId: auth.userId,
      companyId: auth.companyId
    });
    const canAccessCompanyDefaults = access?.hasGlobalRole || access?.isSuperAdmin || false;

    let itemPrices;
    if (outletIdParam) {
      const outletId = NumericIdSchema.parse(outletIdParam);
      // When filtering by outlet, only include company defaults if user has access
      itemPrices = await listItemPrices(auth.companyId, {
        outletId,
        includeDefaults: canAccessCompanyDefaults
      });
    } else {
      itemPrices = await listItemPrices(auth.companyId);
    }

    return successResponse(itemPrices);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
    }

    console.error("GET /inventory/item-prices failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item prices request failed", 500);
  }
});

// GET /inventory/item-prices/:id - Get item price by ID
inventoryRoutes.get("/item-prices/:id", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "inventory",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const priceId = NumericIdSchema.parse(c.req.param("id"));

    const itemPrice = await findItemPriceById(auth.companyId, priceId);
    if (!itemPrice) {
      return errorResponse("NOT_FOUND", "Item price not found", 404);
    }

    // Check if this is a company default price (outlet_id is null)
    if (itemPrice.outlet_id === null) {
      // Check if user has global role to access company defaults
      const access = await checkUserAccess({
        userId: auth.userId,
        companyId: auth.companyId
      });
      const canManageCompanyDefaults = access?.hasGlobalRole || access?.isSuperAdmin || false;
      if (!canManageCompanyDefaults) {
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

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Item price not found", 404);
    }

    console.error("GET /inventory/item-prices/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Item price request failed", 500);
  }
});

// PATCH /inventory/item-prices/:id - Update item price
inventoryRoutes.patch("/item-prices/:id", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "inventory",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const priceId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = ItemPriceUpdateSchema.parse(payload);

    // Check if item price exists and validate outlet access
    const existingPrice = await findItemPriceById(auth.companyId, priceId);
    if (!existingPrice) {
      return errorResponse("NOT_FOUND", "Item price not found", 404);
    }

    // Check if user has global role (for company defaults)
    const access = await checkUserAccess({
      userId: auth.userId,
      companyId: auth.companyId
    });
    const canManageCompanyDefaults = access?.hasGlobalRole || access?.isSuperAdmin || false;

    // Validate outlet access if the price is outlet-specific
    if (existingPrice.outlet_id) {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingPrice.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
    } else if (!canManageCompanyDefaults) {
      // Company default price requires global role
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const updatedItemPrice = await updateItemPrice(auth.companyId, priceId, {
      price: input.price,
      is_active: input.is_active
    }, {
      userId: auth.userId,
      canManageCompanyDefaults
    });

    return successResponse(updatedItemPrice);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

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
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "inventory",
      permission: "delete"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const priceId = NumericIdSchema.parse(c.req.param("id"));

    // Check if user has global role (for company defaults) before calling delete
    const access = await checkUserAccess({
      userId: auth.userId,
      companyId: auth.companyId
    });

    await deleteItemPrice(auth.companyId, priceId, {
      userId: auth.userId,
      canManageCompanyDefaults: access?.hasGlobalRole || access?.isSuperAdmin || false
    });

    return successResponse({
      id: priceId,
      deleted: true
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid price ID", 400);
    }

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

export { inventoryRoutes };
