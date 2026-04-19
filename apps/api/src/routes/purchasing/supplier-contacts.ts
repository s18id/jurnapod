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
  SupplierContactResponseSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { requireAccess, authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import { getDb } from "../../lib/db.js";
import type { KyselySchema } from "@jurnapod/db";

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

// Helper to verify supplier belongs to company
async function verifySupplierAccess(
  db: KyselySchema,
  companyId: number,
  supplierId: number
): Promise<boolean> {
  const supplier = await db
    .selectFrom("suppliers")
    .where("id", "=", supplierId)
    .where("company_id", "=", companyId)
    .where("is_active", "=", 1)
    .select(["id"])
    .executeTakeFirst();
  return supplier !== undefined;
}

// GET /purchasing/suppliers/:supplierId/contacts - List contacts for a supplier
supplierContactRoutes.get("/:supplierId/contacts", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission
    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "suppliers",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const supplierId = NumericIdSchema.parse(c.req.param("supplierId"));

    const db = getDb() as KyselySchema;

    // Verify supplier belongs to company
    const hasAccess = await verifySupplierAccess(db, auth.companyId, supplierId);
    if (!hasAccess) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    const contacts = await db
      .selectFrom("supplier_contacts")
      .where("supplier_id", "=", supplierId)
      .select([
        "id",
        "supplier_id",
        "name",
        "email",
        "phone",
        "role",
        "is_primary",
        "notes",
        "created_at",
        "updated_at"
      ])
      .orderBy("is_primary", "desc")
      .orderBy("name", "asc")
      .execute();

    const formatted = contacts.map((ct) => ({
      id: ct.id,
      supplier_id: ct.supplier_id,
      name: ct.name,
      email: ct.email,
      phone: ct.phone,
      role: ct.role,
      is_primary: Boolean(ct.is_primary),
      notes: ct.notes,
      created_at: new Date(ct.created_at).toISOString(),
      updated_at: new Date(ct.updated_at).toISOString()
    }));

    return successResponse({ contacts: formatted });
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

    // Check access permission
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

    const db = getDb() as KyselySchema;

    // Verify supplier belongs to company
    const hasAccess = await verifySupplierAccess(db, auth.companyId, supplierId);
    if (!hasAccess) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    const contact = await db
      .selectFrom("supplier_contacts")
      .where("id", "=", contactId)
      .where("supplier_id", "=", supplierId)
      .select([
        "id",
        "supplier_id",
        "name",
        "email",
        "phone",
        "role",
        "is_primary",
        "notes",
        "created_at",
        "updated_at"
      ])
      .executeTakeFirst();

    if (!contact) {
      return errorResponse("NOT_FOUND", "Contact not found", 404);
    }

    const formatted = {
      id: contact.id,
      supplier_id: contact.supplier_id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      role: contact.role,
      is_primary: Boolean(contact.is_primary),
      notes: contact.notes,
      created_at: new Date(contact.created_at).toISOString(),
      updated_at: new Date(contact.updated_at).toISOString()
    };

    return successResponse(formatted);
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
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    module: "purchasing",
    resource: "suppliers",
    permission: "create"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const supplierId = NumericIdSchema.parse(c.req.param("supplierId"));
    const payload = await c.req.json();
    const input = SupplierContactCreateSchema.parse(payload);

    const db = getDb() as KyselySchema;

    // Verify supplier belongs to company
    const hasAccess = await verifySupplierAccess(db, auth.companyId, supplierId);
    if (!hasAccess) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    // Use transaction to atomically unset other primary contacts and insert new one
    // This prevents race conditions where concurrent requests could leave multiple primary contacts
    const insertResult = await db.transaction().execute(async (trx) => {
      // If is_primary is true, unset other primary contacts within the same transaction
      if (input.is_primary) {
        await trx
          .updateTable("supplier_contacts")
          .set({ is_primary: 0 })
          .where("supplier_id", "=", supplierId)
          .where("is_primary", "=", 1)
          .execute();
      }

      return trx
        .insertInto("supplier_contacts")
        .values({
          supplier_id: supplierId,
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          role: input.role ?? null,
          is_primary: input.is_primary ? 1 : 0,
          notes: input.notes ?? null
        })
        .executeTakeFirst();
    });

    const insertedId = Number(insertResult.insertId);
    if (!insertedId) {
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create contact", 500);
    }

    // Fetch the inserted row since returningAll() doesn't work reliably with mysql2
    const result = await db
      .selectFrom("supplier_contacts")
      .where("id", "=", insertedId)
      .select([
        "id", "supplier_id", "name", "email", "phone",
        "role", "is_primary", "notes", "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!result) {
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create contact", 500);
    }

    const formatted = {
      id: result.id,
      supplier_id: result.supplier_id,
      name: result.name,
      email: result.email,
      phone: result.phone,
      role: result.role,
      is_primary: Boolean(result.is_primary),
      notes: result.notes,
      created_at: result.created_at ? new Date(result.created_at as unknown as string).toISOString() : null,
      updated_at: result.updated_at ? new Date(result.updated_at as unknown as string).toISOString() : null
    };

    return successResponse(formatted, 201);
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

    // Check access permission
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

    const db = getDb() as KyselySchema;

    // Verify supplier belongs to company
    const hasAccess = await verifySupplierAccess(db, auth.companyId, supplierId);
    if (!hasAccess) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    // Check contact exists
    const existing = await db
      .selectFrom("supplier_contacts")
      .where("id", "=", contactId)
      .where("supplier_id", "=", supplierId)
      .select(["id"])
      .executeTakeFirst();

    if (!existing) {
      return errorResponse("NOT_FOUND", "Contact not found", 404);
    }

    // Build update values
    const updateValues: Record<string, unknown> = {};

    if (input.name !== undefined) updateValues.name = input.name;
    if (input.email !== undefined) updateValues.email = input.email;
    if (input.phone !== undefined) updateValues.phone = input.phone;
    if (input.role !== undefined) updateValues.role = input.role;
    if (input.notes !== undefined) updateValues.notes = input.notes;
    if (input.is_primary !== undefined) updateValues.is_primary = input.is_primary ? 1 : 0;

    // Use transaction to atomically unset other primary contacts and update this one
    // This prevents race conditions where concurrent requests could leave multiple primary contacts
    const updateResult = await db.transaction().execute(async (trx) => {
      // If is_primary is being set to true, unset other primary contacts within the same transaction
      if (input.is_primary) {
        await trx
          .updateTable("supplier_contacts")
          .set({ is_primary: 0 })
          .where("supplier_id", "=", supplierId)
          .where("is_primary", "=", 1)
          .where("id", "!=", contactId)
          .execute();
      }

      return trx
        .updateTable("supplier_contacts")
        .set(updateValues)
        .where("id", "=", contactId)
        .where("supplier_id", "=", supplierId)
        .executeTakeFirst();
    });

    if (!updateResult.numUpdatedRows) {
      return errorResponse("NOT_FOUND", "Contact not found", 404);
    }

    // Fetch the updated row since returningAll() doesn't work reliably with mysql2
    const result = await db
      .selectFrom("supplier_contacts")
      .where("id", "=", contactId)
      .select([
        "id", "supplier_id", "name", "email", "phone",
        "role", "is_primary", "notes", "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!result) {
      return errorResponse("NOT_FOUND", "Contact not found", 404);
    }

    const formatted = {
      id: result.id,
      supplier_id: result.supplier_id,
      name: result.name,
      email: result.email,
      phone: result.phone,
      role: result.role,
      is_primary: Boolean(result.is_primary),
      notes: result.notes,
      created_at: result.created_at ? new Date(result.created_at as unknown as string).toISOString() : null,
      updated_at: result.updated_at ? new Date(result.updated_at as unknown as string).toISOString() : null
    };

    return successResponse(formatted);
  } catch (error) {
    if (error instanceof z.ZodError) {
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

    // Check access permission
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

    const db = getDb() as KyselySchema;

    // Verify supplier belongs to company
    const hasAccess = await verifySupplierAccess(db, auth.companyId, supplierId);
    if (!hasAccess) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    // Check contact exists
    const existing = await db
      .selectFrom("supplier_contacts")
      .where("id", "=", contactId)
      .where("supplier_id", "=", supplierId)
      .select(["id"])
      .executeTakeFirst();

    if (!existing) {
      return errorResponse("NOT_FOUND", "Contact not found", 404);
    }

    await db
      .deleteFrom("supplier_contacts")
      .where("id", "=", contactId)
      .where("supplier_id", "=", supplierId)
      .execute();

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
