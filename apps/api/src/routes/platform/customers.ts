// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Platform Customer Routes
 *
 * Routes for customer management under platform module:
 * - GET /platform/customers - List customers with pagination
 * - GET /platform/customers/:id - Get customer details
 * - POST /platform/customers - Create new customer
 * - PATCH /platform/customers/:id - Update customer
 * - DELETE /platform/customers/:id - Soft delete customer
 *
 * Required ACL: platform.customers resource with READ/CREATE/UPDATE/DELETE permissions
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  CustomerCreateRequestSchema,
  CustomerUpdateRequestSchema,
  CustomerListQuerySchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { requireAccess, authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";
import { getCustomerService, CustomerNotFoundError, CustomerCodeConflictError, CustomerValidationError } from "../../lib/customers.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import { readClientIp } from "../../lib/request-meta.js";
import { isMysqlError, mysqlDuplicateErrorCode } from "../../lib/shared/master-data-utils.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Customer Routes
// =============================================================================

const customerRoutes = new Hono();

// Auth middleware
customerRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /platform/customers - List customers with pagination and filtering
customerRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission
    const accessResult = await requireAccess({
      module: "platform",
      resource: "customers",
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
      type: url.searchParams.get("type") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0
    };

    const parsed = CustomerListQuerySchema.parse(queryParams);

    const service = getCustomerService();
    const result = await service.listCustomers({
      companyId: auth.companyId,
      filters: {
        isActive: parsed.is_active,
        search: parsed.search,
        type: parsed.type,
        limit: parsed.limit,
        offset: parsed.offset
      },
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse({
      customers: result.customers,
      total: result.total,
      limit: parsed.limit,
      offset: parsed.offset
    });
  } catch (error) {
    console.error("GET /platform/customers failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch customers", 500);
  }
});

// GET /platform/customers/:id - Get customer by ID
customerRoutes.get("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission
    const accessResult = await requireAccess({
      module: "platform",
      resource: "customers",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const customerId = NumericIdSchema.parse(c.req.param("id"));

    const service = getCustomerService();
    const customer = await service.getCustomer({
      companyId: auth.companyId,
      customerId,
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse(customer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid customer ID", 400);
    }
    if (error instanceof CustomerNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    console.error("GET /platform/customers/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch customer", 500);
  }
});

// POST /platform/customers - Create new customer
customerRoutes.post("/", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    module: "platform",
    resource: "customers",
    permission: "create"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  let input: z.infer<typeof CustomerCreateRequestSchema> | undefined;

  try {
    const payload = await c.req.json();
    input = CustomerCreateRequestSchema.parse(payload);

    // Ensure company_id matches authenticated user's company
    if (input.company_id !== auth.companyId) {
      return errorResponse("FORBIDDEN", "Cannot create customer for another company", 403);
    }

    const service = getCustomerService();
    const customer = await service.createCustomer({
      companyId: auth.companyId,
      input: {
        companyId: input.company_id,
        code: input.code,
        type: input.type,
        displayName: input.display_name,
        companyName: input.company_name ?? null,
        taxId: input.tax_id ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        addressLine1: input.address_line1 ?? null,
        addressLine2: input.address_line2 ?? null,
        city: input.city ?? null,
        postalCode: input.postal_code ?? null,
        notes: input.notes ?? null
      },
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse(customer, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof CustomerCodeConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }
    if (error instanceof CustomerValidationError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }
    // Handle MySQL duplicate key error (e.g., soft-deleted customer's code reuse)
    if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
      return errorResponse(
        "CONFLICT",
        `Customer with code ${input?.code ?? "(unknown)"} already exists`,
        409
      );
    }
    console.error("POST /platform/customers failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create customer", 500);
  }
});

// PATCH /platform/customers/:id - Update customer
customerRoutes.patch("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission
    const accessResult = await requireAccess({
      module: "platform",
      resource: "customers",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const customerId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = CustomerUpdateRequestSchema.parse(payload);

    const service = getCustomerService();
    const customer = await service.updateCustomer({
      companyId: auth.companyId,
      customerId,
      input: {
        type: input.type,
        displayName: input.display_name,
        companyName: input.company_name || undefined,
        taxId: input.tax_id || undefined,
        email: input.email || undefined,
        phone: input.phone || undefined,
        addressLine1: input.address_line1 || undefined,
        addressLine2: input.address_line2 || undefined,
        city: input.city || undefined,
        postalCode: input.postal_code || undefined,
        notes: input.notes || undefined,
        isActive: input.is_active
      },
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse(customer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof CustomerNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    if (error instanceof CustomerValidationError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }
    console.error("PATCH /platform/customers/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update customer", 500);
  }
});

// DELETE /platform/customers/:id - Soft delete customer
customerRoutes.delete("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission
    const accessResult = await requireAccess({
      module: "platform",
      resource: "customers",
      permission: "delete"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const customerId = NumericIdSchema.parse(c.req.param("id"));

    const service = getCustomerService();
    await service.deleteCustomer({
      companyId: auth.companyId,
      customerId,
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid customer ID", 400);
    }
    if (error instanceof CustomerNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    console.error("DELETE /platform/customers/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete customer", 500);
  }
});

export { customerRoutes };
