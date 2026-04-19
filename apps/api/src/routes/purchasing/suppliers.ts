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
  SupplierResponseSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { requireAccess, authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import { readClientIp } from "../../lib/request-meta.js";
import { getDb } from "../../lib/db.js";
import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Supplier Routes
// =============================================================================

// Format decimal string for API response
// DECIMAL(19,4) from MySQL preserves exact string representation: "50000000.0000", "0.0000"
function formatDecimal(value: unknown): string {
  if (value === null || value === undefined) return "0";
  return String(value);
}

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

    // Check access permission
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

    const db = getDb() as KyselySchema;
    const isActiveValue = parsed.is_active !== undefined ? (parsed.is_active ? 1 : 0) : 1;

    // Build where conditions for count
    const countConditions = [
      sql`company_id = ${auth.companyId}`,
      sql`is_active = ${isActiveValue}`
    ];
    if (parsed.search) {
      countConditions.push(
        sql`(name LIKE ${'%' + parsed.search + '%'} OR code LIKE ${'%' + parsed.search + '%'} OR email LIKE ${'%' + parsed.search + '%'})`
      );
    }

    // Count query using raw SQL for simplicity
    const countSql = sql`SELECT COUNT(*) as count FROM suppliers WHERE ${countConditions.reduce((acc, cond, i) => i === 0 ? cond : sql`${acc} AND ${cond}`, sql`1=1`)}`;
    const totalResult = await countSql.execute(db);

    // List query
    let listQuery = db
      .selectFrom("suppliers")
      .where("company_id", "=", auth.companyId)
      .where("is_active", "=", isActiveValue);

    if (parsed.search) {
      listQuery = listQuery.where(
        (eb) => eb.or([
          eb("name", "like", `%${parsed.search}%`),
          eb("code", "like", `%${parsed.search}%`),
          eb("email", "like", `%${parsed.search}%`)
        ])
      );
    }

    const suppliers = await listQuery
      .select([
        "id",
        "company_id",
        "code",
        "name",
        "email",
        "phone",
        "address_line1",
        "address_line2",
        "city",
        "postal_code",
        "country",
        "currency",
        "credit_limit",
        "payment_terms_days",
        "notes",
        "is_active",
        "created_by_user_id",
        "updated_by_user_id",
        "created_at",
        "updated_at"
      ])
      .orderBy("name", "asc")
      .limit(parsed.limit)
      .offset(parsed.offset)
      .execute();

    const formatted = suppliers.map((s) => ({
      id: s.id,
      company_id: s.company_id,
      code: s.code,
      name: s.name,
      email: s.email,
      phone: s.phone,
      address_line1: s.address_line1,
      address_line2: s.address_line2,
      city: s.city,
      postal_code: s.postal_code,
      country: s.country,
      currency: s.currency,
      credit_limit: formatDecimal(s.credit_limit),
      payment_terms_days: s.payment_terms_days,
      notes: s.notes,
      is_active: Boolean(s.is_active),
      created_by_user_id: s.created_by_user_id,
      updated_by_user_id: s.updated_by_user_id,
      created_at: new Date(s.created_at).toISOString(),
      updated_at: new Date(s.updated_at).toISOString()
    }));

    return successResponse({
      suppliers: formatted,
      total: Number((totalResult.rows[0] as { count?: string })?.count ?? 0),
      limit: parsed.limit,
      offset: parsed.offset
    });
  } catch (error) {
    console.error("GET /purchasing/suppliers failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch suppliers", 500);
  }
});

// GET /purchasing/suppliers/:id - Get supplier by ID
supplierRoutes.get("/:id", async (c) => {
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

    const supplierId = NumericIdSchema.parse(c.req.param("id"));

    const db = getDb() as KyselySchema;

    const supplier = await db
      .selectFrom("suppliers")
      .where("id", "=", supplierId)
      .where("company_id", "=", auth.companyId)
      .where("is_active", "=", 1)
      .select([
        "id",
        "company_id",
        "code",
        "name",
        "email",
        "phone",
        "address_line1",
        "address_line2",
        "city",
        "postal_code",
        "country",
        "currency",
        "credit_limit",
        "payment_terms_days",
        "notes",
        "is_active",
        "created_by_user_id",
        "updated_by_user_id",
        "created_at",
        "updated_at"
      ])
      .executeTakeFirst();

    if (!supplier) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    // Fetch contacts
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
      .execute();

    const formatted = {
      id: supplier.id,
      company_id: supplier.company_id,
      code: supplier.code,
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
      address_line1: supplier.address_line1,
      address_line2: supplier.address_line2,
      city: supplier.city,
      postal_code: supplier.postal_code,
      country: supplier.country,
      currency: supplier.currency,
      credit_limit: formatDecimal(supplier.credit_limit),
      payment_terms_days: supplier.payment_terms_days,
      notes: supplier.notes,
      is_active: Boolean(supplier.is_active),
      created_by_user_id: supplier.created_by_user_id,
      updated_by_user_id: supplier.updated_by_user_id,
      created_at: new Date(supplier.created_at).toISOString(),
      updated_at: new Date(supplier.updated_at).toISOString(),
      contacts: contacts.map((ct) => ({
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
      }))
    };

    return successResponse(formatted);
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

  let input: z.infer<typeof SupplierCreateSchema> | undefined;

  try {
    const payload = await c.req.json();
    input = SupplierCreateSchema.parse(payload);

    // Ensure company_id matches authenticated user's company
    if (input.company_id !== auth.companyId) {
      return errorResponse("FORBIDDEN", "Cannot create supplier for another company", 403);
    }

    const db = getDb() as KyselySchema;

    // Insert supplier
    const insertResult = await db
      .insertInto("suppliers")
      .values({
        company_id: input.company_id,
        code: input.code,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address_line1: input.address_line1 ?? null,
        address_line2: input.address_line2 ?? null,
        city: input.city ?? null,
        postal_code: input.postal_code ?? null,
        country: input.country ?? null,
        currency: input.currency,
        credit_limit: input.credit_limit,
        payment_terms_days: input.payment_terms_days ?? null,
        notes: input.notes ?? null,
        is_active: 1,
        created_by_user_id: auth.userId
      })
      .executeTakeFirst();

    const insertedId = Number(insertResult.insertId);
    if (!insertedId) {
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create supplier", 500);
    }

    // Fetch the inserted row since returningAll() doesn't work reliably with mysql2
    const result = await db
      .selectFrom("suppliers")
      .where("id", "=", insertedId)
      .select([
        "id", "company_id", "code", "name", "email", "phone",
        "address_line1", "address_line2", "city", "postal_code",
        "country", "currency", "credit_limit", "payment_terms_days",
        "notes", "is_active", "created_by_user_id", "updated_by_user_id",
        "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!result) {
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create supplier", 500);
    }

    const formatted = {
      id: result.id,
      company_id: result.company_id,
      code: result.code,
      name: result.name,
      email: result.email,
      phone: result.phone,
      address_line1: result.address_line1,
      address_line2: result.address_line2,
      city: result.city,
      postal_code: result.postal_code,
      country: result.country,
      currency: result.currency,
      credit_limit: formatDecimal(result.credit_limit),
      payment_terms_days: result.payment_terms_days,
      notes: result.notes,
      is_active: Boolean(result.is_active),
      created_by_user_id: result.created_by_user_id,
      updated_by_user_id: result.updated_by_user_id,
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
    // Handle MySQL duplicate key error
    if (typeof error === "object" && error !== null && "errno" in error) {
      const mysqlError = error as { errno: number };
      if (mysqlError.errno === 1062) {
        return errorResponse(
          "CONFLICT",
          `Supplier with code ${input?.code ?? "(unknown)"} already exists`,
          409
        );
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

    // Check access permission
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

    const db = getDb() as KyselySchema;

    // Check supplier exists and belongs to company
    const existing = await db
      .selectFrom("suppliers")
      .where("id", "=", supplierId)
      .where("company_id", "=", auth.companyId)
      .select(["id"])
      .executeTakeFirst();

    if (!existing) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    // Build update values
    const updateValues: Record<string, unknown> = {
      updated_by_user_id: auth.userId
    };

    if (input.name !== undefined) updateValues.name = input.name;
    if (input.email !== undefined) updateValues.email = input.email;
    if (input.phone !== undefined) updateValues.phone = input.phone;
    if (input.address_line1 !== undefined) updateValues.address_line1 = input.address_line1;
    if (input.address_line2 !== undefined) updateValues.address_line2 = input.address_line2;
    if (input.city !== undefined) updateValues.city = input.city;
    if (input.postal_code !== undefined) updateValues.postal_code = input.postal_code;
    if (input.country !== undefined) updateValues.country = input.country;
    if (input.currency !== undefined) updateValues.currency = input.currency;
    if (input.credit_limit !== undefined) updateValues.credit_limit = input.credit_limit;
    if (input.payment_terms_days !== undefined) updateValues.payment_terms_days = input.payment_terms_days;
    if (input.notes !== undefined) updateValues.notes = input.notes;
    if (input.is_active !== undefined) updateValues.is_active = input.is_active ? 1 : 0;

    // Update supplier
    const updateResult = await db
      .updateTable("suppliers")
      .set(updateValues)
      .where("id", "=", supplierId)
      .where("company_id", "=", auth.companyId)
      .executeTakeFirst();

    if (!updateResult.numUpdatedRows) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    // Fetch the updated row since returningAll() doesn't work reliably with mysql2
    const result = await db
      .selectFrom("suppliers")
      .where("id", "=", supplierId)
      .select([
        "id", "company_id", "code", "name", "email", "phone",
        "address_line1", "address_line2", "city", "postal_code",
        "country", "currency", "credit_limit", "payment_terms_days",
        "notes", "is_active", "created_by_user_id", "updated_by_user_id",
        "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!result) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    const formatted = {
      id: result.id,
      company_id: result.company_id,
      code: result.code,
      name: result.name,
      email: result.email,
      phone: result.phone,
      address_line1: result.address_line1,
      address_line2: result.address_line2,
      city: result.city,
      postal_code: result.postal_code,
      country: result.country,
      currency: result.currency,
      credit_limit: formatDecimal(result.credit_limit),
      payment_terms_days: result.payment_terms_days,
      notes: result.notes,
      is_active: Boolean(result.is_active),
      created_by_user_id: result.created_by_user_id,
      updated_by_user_id: result.updated_by_user_id,
      created_at: result.created_at ? new Date(result.created_at as unknown as string).toISOString() : null,
      updated_at: result.updated_at ? new Date(result.updated_at as unknown as string).toISOString() : null
    };

    return successResponse(formatted);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    console.error("PATCH /purchasing/suppliers/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update supplier", 500);
  }
});

// DELETE /purchasing/suppliers/:id - Soft delete supplier (set is_active = 0)
supplierRoutes.delete("/:id", async (c) => {
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

    const supplierId = NumericIdSchema.parse(c.req.param("id"));

    const db = getDb() as KyselySchema;

    // Check supplier exists and belongs to company
    const existing = await db
      .selectFrom("suppliers")
      .where("id", "=", supplierId)
      .where("company_id", "=", auth.companyId)
      .select(["id"])
      .executeTakeFirst();

    if (!existing) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    // Soft delete by setting is_active = 0
    await db
      .updateTable("suppliers")
      .set({
        is_active: 0,
        updated_by_user_id: auth.userId
      })
      .where("id", "=", supplierId)
      .where("company_id", "=", auth.companyId)
      .execute();

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid supplier ID", 400);
    }
    console.error("DELETE /purchasing/suppliers/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete supplier", 500);
  }
});

export { supplierRoutes };
