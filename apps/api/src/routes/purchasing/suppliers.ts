// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchasing Supplier Routes
 *
 * Routes for supplier management under purchasing module:
 * - GET /purchasing/suppliers - List suppliers with pagination
 * - GET /purchasing/suppliers/:id - Get supplier details
 * - POST /purchasing/suppliers - Create new supplier
 * - PATCH /purchasing/suppliers/:id - Update supplier
 * - DELETE /purchasing/suppliers/:id - Soft delete supplier
 *
 * Required ACL: purchasing.suppliers resource with READ/CREATE/UPDATE/DELETE permissions
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  SupplierCreateSchema,
  SupplierUpdateSchema,
  SupplierListQuerySchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { requireAccess, authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import {
  listSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  softDeleteSupplier,
} from "../../lib/purchasing/supplier.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Supplier Routes
// =============================================================================

const supplierRoutes = new Hono();

// Auth middleware
supplierRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /purchasing/suppliers - List suppliers with pagination and filtering
supplierRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "suppliers",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const queryParams = {
      company_id: auth.companyId,
      is_active: url.searchParams.get("is_active") !== null
        ? url.searchParams.get("is_active") === "true"
        : undefined,
      search: url.searchParams.get("search") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0
    };

    const parsed = SupplierListQuerySchema.parse(queryParams);

    const result = await listSuppliers({
      companyId: auth.companyId,
      isActive: parsed.is_active,
      search: parsed.search,
      limit: parsed.limit,
      offset: parsed.offset,
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid query parameters", 400);
    }
    console.error("GET /purchasing/suppliers failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch suppliers", 500);
  }
});

// GET /purchasing/suppliers/:id - Get supplier by ID
supplierRoutes.get("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "suppliers",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const supplierId = NumericIdSchema.parse(c.req.param("id"));

    const supplier = await getSupplierById(auth.companyId, supplierId);

    if (!supplier) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    return successResponse(supplier);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid supplier ID", 400);
    }
    console.error("GET /purchasing/suppliers/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch supplier", 500);
  }
});

// POST /purchasing/suppliers - Create new supplier
supplierRoutes.post("/", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "suppliers",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    let input: z.infer<typeof SupplierCreateSchema>;

    try {
      const payload = await c.req.json();
      input = SupplierCreateSchema.parse(payload);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      if (e instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      throw e;
    }

    if (input.company_id !== auth.companyId) {
      return errorResponse("FORBIDDEN", "Cannot create supplier for another company", 403);
    }

    const supplier = await createSupplier({
      companyId: input.company_id,
      userId: auth.userId,
      payload: {
        code: input.code,
        name: input.name,
        email: input.email,
        phone: input.phone,
        address_line1: input.address_line1,
        address_line2: input.address_line2,
        city: input.city,
        postal_code: input.postal_code,
        country: input.country,
        currency: input.currency,
        credit_limit: input.credit_limit,
        payment_terms_days: input.payment_terms_days,
        notes: input.notes,
      },
    });

    return successResponse(supplier, 201);
  } catch (error) {
    if (typeof error === "object" && error !== null && "errno" in error) {
      const mysqlError = error as { errno: number };
      if (mysqlError.errno === 1062) {
        return errorResponse("CONFLICT", "Supplier with that code already exists", 409);
      }
    }
    console.error("POST /purchasing/suppliers failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create supplier", 500);
  }
});

// PATCH /purchasing/suppliers/:id - Update supplier
supplierRoutes.patch("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "suppliers",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const supplierId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = SupplierUpdateSchema.parse(payload);

    const supplier = await updateSupplier({
      companyId: auth.companyId,
      supplierId,
      userId: auth.userId,
      payload: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        address_line1: input.address_line1,
        address_line2: input.address_line2,
        city: input.city,
        postal_code: input.postal_code,
        country: input.country,
        currency: input.currency,
        credit_limit: input.credit_limit,
        payment_terms_days: input.payment_terms_days,
        notes: input.notes,
        is_active: input.is_active,
      },
    });

    if (!supplier) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    return successResponse(supplier);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (typeof error === "object" && error !== null && "code" in error) {
      const err = error as { code: string; message?: string };
      if (err.code === "SUPPLIER_HAS_OPEN_DOCUMENTS") {
        return errorResponse("CONFLICT", err.message ?? "Cannot deactivate supplier with open documents", 409);
      }
    }
    if (typeof error === "object" && error !== null && "errno" in error) {
      const mysqlError = error as { errno: number };
      if (mysqlError.errno === 1062) {
        return errorResponse("CONFLICT", "Supplier with that code already exists", 409);
      }
    }
    console.error("PATCH /purchasing/suppliers/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update supplier", 500);
  }
});

// DELETE /purchasing/suppliers/:id - Soft delete supplier (set is_active = 0)
supplierRoutes.delete("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "suppliers",
      permission: "delete"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const supplierId = NumericIdSchema.parse(c.req.param("id"));

    const deleted = await softDeleteSupplier({
      companyId: auth.companyId,
      supplierId,
      userId: auth.userId,
    });

    if (!deleted) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid supplier ID", 400);
    }
    if (typeof error === "object" && error !== null && "code" in error) {
      const err = error as { code: string; message?: string };
      if (err.code === "SUPPLIER_HAS_OPEN_DOCUMENTS") {
        return errorResponse("CONFLICT", err.message ?? "Cannot deactivate supplier with open documents", 409);
      }
      if (err.code === "FORBIDDEN") {
        return errorResponse("FORBIDDEN", err.message ?? "Forbidden", 403);
      }
    }
    if (typeof error === "object" && error !== null && "errno" in error) {
      const mysqlError = error as { errno: number };
      if (mysqlError.errno === 1062) {
        return errorResponse("CONFLICT", "Supplier with that code already exists", 409);
      }
    }
    console.error("DELETE /purchasing/suppliers/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete supplier", 500);
  }
});

export { supplierRoutes };
