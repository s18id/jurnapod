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
import {
  ItemCreateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import {
  createItem,
  listItems,
  DatabaseConflictError,
  DatabaseReferenceError
} from "../lib/master-data.js";

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

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...INVENTORY_ROLES_WRITE],
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

    // Verify outlet belongs to company
    const { listEffectiveItemPricesForOutlet } = await import("../lib/master-data.js");
    const prices = await listEffectiveItemPricesForOutlet(auth.companyId, outletIdNum, { isActive: true });

    return successResponse(prices);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
    }

    console.error("GET /inventory/item-prices/active failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Prices request failed", 500);
  }
});

export { inventoryRoutes };
