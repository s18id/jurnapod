// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDb } from "../db.js";
import type { KyselySchema } from "@jurnapod/db";

function formatDecimal(value: unknown): string {
  if (value === null || value === undefined) return "0";
  return String(value);
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export interface SupplierListParams {
  companyId: number;
  isActive?: boolean;
  search?: string;
  limit: number;
  offset: number;
}

export async function listSuppliers(params: SupplierListParams): Promise<{
  suppliers: unknown[];
  total: number;
  limit: number;
  offset: number;
}> {
  const db = getDb() as KyselySchema;
  const isActiveValue = params.isActive !== undefined ? (params.isActive ? 1 : 0) : 1;

  const countResult = await db
    .selectFrom("suppliers")
    .where("company_id", "=", params.companyId)
    .where("is_active", "=", isActiveValue)
    .where((eb) => {
      if (!params.search) {
        return eb.val(true);
      }
      return eb.or([
        eb("name", "like", `%${params.search}%`),
        eb("code", "like", `%${params.search}%`),
        eb("email", "like", `%${params.search}%`),
      ]);
    })
    .select((eb) => eb.fn.countAll().as("count"))
    .executeTakeFirst();

  let listQuery = db
    .selectFrom("suppliers")
    .where("company_id", "=", params.companyId)
    .where("is_active", "=", isActiveValue);

  if (params.search) {
    listQuery = listQuery.where((eb) =>
      eb.or([
        eb("name", "like", `%${params.search}%`),
        eb("code", "like", `%${params.search}%`),
        eb("email", "like", `%${params.search}%`),
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
      "updated_at",
    ])
    .orderBy("name", "asc")
    .limit(params.limit)
    .offset(params.offset)
    .execute();

  return {
    suppliers: suppliers.map((s) => ({
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
      created_at: toIso(s.created_at),
      updated_at: toIso(s.updated_at),
    })),
    total: Number((countResult as { count?: string })?.count ?? 0),
    limit: params.limit,
    offset: params.offset,
  };
}

export async function getSupplierById(companyId: number, supplierId: number, includeInactive = false): Promise<unknown | null> {
  const db = getDb() as KyselySchema;

  let q = db
    .selectFrom("suppliers")
    .where("id", "=", supplierId)
    .where("company_id", "=", companyId);

  if (!includeInactive) {
    q = q.where("is_active", "=", 1);
  }

  const supplier = await q
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
      "updated_at",
    ])
    .executeTakeFirst();

  if (!supplier) {
    return null;
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
      "updated_at",
    ])
    .execute();

  return {
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
    created_at: toIso(supplier.created_at),
    updated_at: toIso(supplier.updated_at),
    contacts: contacts.map((ct) => ({
      id: ct.id,
      supplier_id: ct.supplier_id,
      name: ct.name,
      email: ct.email,
      phone: ct.phone,
      role: ct.role,
      is_primary: Boolean(ct.is_primary),
      notes: ct.notes,
      created_at: toIso(ct.created_at),
      updated_at: toIso(ct.updated_at),
    })),
  };
}

export async function createSupplier(input: {
  companyId: number;
  userId: number;
  payload: {
    code: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postal_code?: string | null;
    country?: string | null;
    currency: string;
    credit_limit: string;
    payment_terms_days?: number | null;
    notes?: string | null;
  };
}): Promise<unknown> {
  const db = getDb() as KyselySchema;
  const p = input.payload;

  const insertResult = await db
    .insertInto("suppliers")
    .values({
      company_id: input.companyId,
      code: p.code,
      name: p.name,
      email: p.email ?? null,
      phone: p.phone ?? null,
      address_line1: p.address_line1 ?? null,
      address_line2: p.address_line2 ?? null,
      city: p.city ?? null,
      postal_code: p.postal_code ?? null,
      country: p.country ?? null,
      currency: p.currency,
      credit_limit: p.credit_limit,
      payment_terms_days: p.payment_terms_days ?? null,
      notes: p.notes ?? null,
      is_active: 1,
      created_by_user_id: input.userId,
    })
    .executeTakeFirst();

  const insertedId = Number(insertResult.insertId);
  if (!insertedId) {
    throw new Error("Failed to create supplier");
  }

  const supplier = await getSupplierById(input.companyId, insertedId);
  if (!supplier) {
    throw new Error("Failed to fetch created supplier");
  }
  return supplier;
}

export async function updateSupplier(input: {
  companyId: number;
  supplierId: number;
  userId: number;
  payload: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postal_code?: string | null;
    country?: string | null;
    currency?: string;
    credit_limit?: string;
    payment_terms_days?: number | null;
    notes?: string | null;
    is_active?: boolean;
  };
}): Promise<unknown | null> {
  const db = getDb() as KyselySchema;

  const p = input.payload;

  // P1-FIX #1: When is_active transitions true→false via PATCH, run the same
  // open-document guard as softDeleteSupplier to prevent bypassing the guard.
  if (p.is_active === false) {
    return db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom("suppliers")
        .where("id", "=", input.supplierId)
        .where("company_id", "=", input.companyId)
        .select(["id", "is_active"])
        .forUpdate()
        .executeTakeFirst();

      if (!existing) return null;

      // Only run guard when transitioning active→inactive
      if (Number(existing.is_active) === 1) {
        const openPO = await trx
          .selectFrom("purchase_orders")
          .where("supplier_id", "=", input.supplierId)
          .where("company_id", "=", input.companyId)
          .where("status", "!=", 5) // not CLOSED
          .select(["id"])
          .limit(1)
          .executeTakeFirst();

        if (openPO) {
          throw {
            code: "SUPPLIER_HAS_OPEN_DOCUMENTS",
            message: "Cannot deactivate supplier with open purchase orders",
            detail: { openDocumentType: "purchase_order" },
          };
        }
      }

      const updateValues: Record<string, unknown> = {
        updated_by_user_id: input.userId,
        is_active: 0,
      };
      if (p.name !== undefined) updateValues.name = p.name;
      if (p.email !== undefined) updateValues.email = p.email;
      if (p.phone !== undefined) updateValues.phone = p.phone;
      if (p.address_line1 !== undefined) updateValues.address_line1 = p.address_line1;
      if (p.address_line2 !== undefined) updateValues.address_line2 = p.address_line2;
      if (p.city !== undefined) updateValues.city = p.city;
      if (p.postal_code !== undefined) updateValues.postal_code = p.postal_code;
      if (p.country !== undefined) updateValues.country = p.country;
      if (p.currency !== undefined) updateValues.currency = p.currency;
      if (p.credit_limit !== undefined) updateValues.credit_limit = p.credit_limit;
      if (p.payment_terms_days !== undefined) updateValues.payment_terms_days = p.payment_terms_days;
      if (p.notes !== undefined) updateValues.notes = p.notes;

      await trx
        .updateTable("suppliers")
        .set(updateValues)
        .where("id", "=", input.supplierId)
        .where("company_id", "=", input.companyId)
        .executeTakeFirst();

      return getSupplierById(input.companyId, input.supplierId, true);
    });
  }

  const existing = await db
    .selectFrom("suppliers")
    .where("id", "=", input.supplierId)
    .where("company_id", "=", input.companyId)
    .select(["id"])
    .executeTakeFirst();

  if (!existing) {
    return null;
  }

  const updateValues: Record<string, unknown> = {
    updated_by_user_id: input.userId,
  };

  if (p.name !== undefined) updateValues.name = p.name;
  if (p.email !== undefined) updateValues.email = p.email;
  if (p.phone !== undefined) updateValues.phone = p.phone;
  if (p.address_line1 !== undefined) updateValues.address_line1 = p.address_line1;
  if (p.address_line2 !== undefined) updateValues.address_line2 = p.address_line2;
  if (p.city !== undefined) updateValues.city = p.city;
  if (p.postal_code !== undefined) updateValues.postal_code = p.postal_code;
  if (p.country !== undefined) updateValues.country = p.country;
  if (p.currency !== undefined) updateValues.currency = p.currency;
  if (p.credit_limit !== undefined) updateValues.credit_limit = p.credit_limit;
  if (p.payment_terms_days !== undefined) updateValues.payment_terms_days = p.payment_terms_days;
  if (p.notes !== undefined) updateValues.notes = p.notes;

  await db
    .updateTable("suppliers")
    .set(updateValues)
    .where("id", "=", input.supplierId)
    .where("company_id", "=", input.companyId)
    .executeTakeFirst();

  return getSupplierById(input.companyId, input.supplierId, true);
}

export async function softDeleteSupplier(input: {
  companyId: number;
  supplierId: number;
  userId: number;
}): Promise<boolean> {
  const db = getDb() as KyselySchema;

  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom("suppliers")
      .where("id", "=", input.supplierId)
      .where("company_id", "=", input.companyId)
      .select(["id"])
      .forUpdate()
      .executeTakeFirst();

    if (!existing) {
      return false;
    }

    // P1-FIX #3: Block deactivation if supplier has open (non-CLOSED) purchase orders.
    // CLOSED = 5 is the only terminal status; DRAFT/SENT/PARTIAL_RECEIVED/RECEIVED block deletion.
    const openPO = await trx
      .selectFrom("purchase_orders")
      .where("supplier_id", "=", input.supplierId)
      .where("company_id", "=", input.companyId)
      .where("status", "!=", 5) // not CLOSED
      .select(["id"])
      .limit(1)
      .executeTakeFirst();

    if (openPO) {
      throw {
        code: "SUPPLIER_HAS_OPEN_DOCUMENTS",
        message: "Cannot deactivate supplier with open purchase orders",
        detail: { openDocumentType: "purchase_order" },
      };
    }

    await trx
      .updateTable("suppliers")
      .set({
        is_active: 0,
        updated_by_user_id: input.userId,
      })
      .where("id", "=", input.supplierId)
      .where("company_id", "=", input.companyId)
      .execute();

    return true;
  });
}
