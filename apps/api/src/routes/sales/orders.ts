// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Order Routes
 *
 * Routes for sales order operations.
 * GET /sales/orders - List orders with filtering
 * POST /sales/orders - Create new order
 * 
 * Uses modules-sales package via adapter layer.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  SalesOrderCreateRequestSchema,
  SalesOrderListQuerySchema
} from "@jurnapod/shared";
import {
  createOrderService as getOrderService,
  type OrderService,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError
} from "@jurnapod/modules-sales";
import { listUserOutletIds, userHasOutletAccess } from "@/lib/auth";
import { requireAccess } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import type { AuthContext } from "@/lib/auth-guard";
import { createApiSalesDb } from "@/lib/modules-sales/sales-db";
import { getAccessScopeChecker } from "@/lib/modules-sales/access-scope-checker";
import { getCompanyService } from "@/lib/companies";

const orderRoutes = new Hono();

// Create order service instance using the adapter layer
const db = createApiSalesDb();
const accessScopeChecker = getAccessScopeChecker();
const orderService: OrderService = getOrderService({
  db,
  accessScopeChecker
});

const numberingTemplateConflictMessage =
  "No numbering template configured. Please configure document numbering in settings.";

// Company service for fetching company details (e.g., timezone)
const companyService = getCompanyService();

// ============================================================================
// GET /sales/orders - List orders with filtering
// ============================================================================

orderRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const accessResult = await requireAccess({
      module: "sales",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const parsed = SalesOrderListQuerySchema.parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined
    });

    let outletIds: number[];
    if (typeof parsed.outlet_id === "number") {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      outletIds = [parsed.outlet_id];
    } else {
      outletIds = await listUserOutletIds(auth.userId, auth.companyId);
    }

    // Get company timezone for date boundary conversion
    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? 'UTC';

    const result = await orderService.listOrders(auth.companyId, {
      outletIds,
      status: parsed.status,
      dateFrom: parsed.date_from,
      dateTo: parsed.date_to,
      limit: parsed.limit,
      offset: parsed.offset,
      timezone
    });

    return successResponse({
      total: result.total,
      orders: result.orders
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    console.error("GET /sales/orders failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Orders request failed", 500);
  }
});

// ============================================================================
// POST /sales/orders - Create new order
// ============================================================================

orderRoutes.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const accessResult = await requireAccess({
      module: "sales",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    let input;
    try {
      input = SalesOrderCreateRequestSchema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      throw error;
    }

    // Validate outlet access before creating order
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const order = await orderService.createOrder(auth.companyId, input, {
      userId: auth.userId
    });

    return successResponse(order, 201);
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    if (error instanceof DatabaseReferenceError) {
      if (error.message === "Numbering template not configured") {
        return errorResponse("CONFLICT", numberingTemplateConflictMessage, 409);
      }
      return errorResponse("NOT_FOUND", "Outlet not found", 404);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    console.error("POST /sales/orders failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Order creation failed", 500);
  }
});

export { orderRoutes };
