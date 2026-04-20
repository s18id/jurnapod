// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchasing Supplier Contact Routes
 *
 * Routes for supplier contact management under purchasing module:
 * - GET /purchasing/suppliers/:supplierId/contacts - List contacts for a supplier
 * - GET /purchasing/suppliers/:supplierId/contacts/:id - Get contact by ID
 * - POST /purchasing/suppliers/:supplierId/contacts - Create contact
 * - PATCH /purchasing/suppliers/:supplierId/contacts/:id - Update contact
 * - DELETE /purchasing/suppliers/:supplierId/contacts/:id - Delete contact
 *
 * Required ACL: purchasing.suppliers resource with READ/CREATE/UPDATE/DELETE permissions
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  SupplierContactCreateSchema,
  SupplierContactUpdateSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { requireAccess, authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import {
  listSupplierContacts,
  getSupplierContactById,
  createSupplierContact,
  updateSupplierContact,
  deleteSupplierContact,
  verifySupplierAccess,
} from "../../lib/purchasing/supplier-contact.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Supplier Contact Routes
// =============================================================================

const supplierContactRoutes = new Hono();

// Auth middleware
supplierContactRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /purchasing/suppliers/:supplierId/contacts - List contacts for a supplier
supplierContactRoutes.get("/:supplierId/contacts", async (c) => {
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

    const supplierId = NumericIdSchema.parse(c.req.param("supplierId"));

    const hasAccess = await verifySupplierAccess(auth.companyId, supplierId);
    if (!hasAccess) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    const contacts = await listSupplierContacts({
      companyId: auth.companyId,
      supplierId,
    });

    return successResponse({ contacts });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid supplier ID", 400);
    }
    console.error("GET /purchasing/suppliers/:supplierId/contacts failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch contacts", 500);
  }
});

// GET /purchasing/suppliers/:supplierId/contacts/:id - Get contact by ID
supplierContactRoutes.get("/:supplierId/contacts/:id", async (c) => {
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

    const supplierId = NumericIdSchema.parse(c.req.param("supplierId"));
    const contactId = NumericIdSchema.parse(c.req.param("id"));

    const hasAccess = await verifySupplierAccess(auth.companyId, supplierId);
    if (!hasAccess) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    const contact = await getSupplierContactById({
      companyId: auth.companyId,
      supplierId,
      contactId,
    });

    if (!contact) {
      return errorResponse("NOT_FOUND", "Contact not found", 404);
    }

    return successResponse(contact);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid ID", 400);
    }
    console.error("GET /purchasing/suppliers/:supplierId/contacts/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch contact", 500);
  }
});

// POST /purchasing/suppliers/:supplierId/contacts - Create contact
supplierContactRoutes.post("/:supplierId/contacts", async (c) => {
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

    const supplierId = NumericIdSchema.parse(c.req.param("supplierId"));
    const payload = await c.req.json();
    const input = SupplierContactCreateSchema.parse(payload);

    const hasAccess = await verifySupplierAccess(auth.companyId, supplierId);
    if (!hasAccess) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    const contact = await createSupplierContact({
      companyId: auth.companyId,
      supplierId,
      payload: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        role: input.role,
        is_primary: input.is_primary,
        notes: input.notes,
      },
    });

    return successResponse(contact, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    console.error("POST /purchasing/suppliers/:supplierId/contacts failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create contact", 500);
  }
});

// PATCH /purchasing/suppliers/:supplierId/contacts/:id - Update contact
supplierContactRoutes.patch("/:supplierId/contacts/:id", async (c) => {
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

    const supplierId = NumericIdSchema.parse(c.req.param("supplierId"));
    const contactId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = SupplierContactUpdateSchema.parse(payload);

    const hasAccess = await verifySupplierAccess(auth.companyId, supplierId);
    if (!hasAccess) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    const contact = await updateSupplierContact({
      companyId: auth.companyId,
      supplierId,
      contactId,
      payload: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        role: input.role,
        notes: input.notes,
        is_primary: input.is_primary,
      },
    });

    if (!contact) {
      return errorResponse("NOT_FOUND", "Contact not found", 404);
    }

    return successResponse(contact);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    console.error("PATCH /purchasing/suppliers/:supplierId/contacts/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update contact", 500);
  }
});

// DELETE /purchasing/suppliers/:supplierId/contacts/:id - Delete contact
supplierContactRoutes.delete("/:supplierId/contacts/:id", async (c) => {
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

    const supplierId = NumericIdSchema.parse(c.req.param("supplierId"));
    const contactId = NumericIdSchema.parse(c.req.param("id"));

    const hasAccess = await verifySupplierAccess(auth.companyId, supplierId);
    if (!hasAccess) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    const deleted = await deleteSupplierContact({
      companyId: auth.companyId,
      supplierId,
      contactId,
    });

    if (!deleted) {
      return errorResponse("NOT_FOUND", "Contact not found", 404);
    }

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid ID", 400);
    }
    console.error("DELETE /purchasing/suppliers/:supplierId/contacts/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete contact", 500);
  }
});

export { supplierContactRoutes };