// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDb } from "../../lib/db.js";
import type { KyselySchema } from "@jurnapod/db";

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export interface SupplierContactListParams {
  companyId: number;
  supplierId: number;
}

export async function listSupplierContacts(params: SupplierContactListParams): Promise<unknown[]> {
  const db = getDb() as KyselySchema;

  // Tenant isolation: verify supplier belongs to company
  const supplier = await db
    .selectFrom("suppliers")
    .where("id", "=", params.supplierId)
    .where("company_id", "=", params.companyId)
    .select(["id"])
    .executeTakeFirst();

  if (!supplier) {
    return [];
  }

  const contacts = await db
    .selectFrom("supplier_contacts")
    .where("supplier_id", "=", params.supplierId)
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
    .orderBy("is_primary", "desc")
    .orderBy("name", "asc")
    .execute();

  return contacts.map((ct) => ({
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
  }));
}

export async function getSupplierContactById(params: {
  companyId: number;
  supplierId: number;
  contactId: number;
}): Promise<unknown | null> {
  const db = getDb() as KyselySchema;

  // Tenant isolation: verify supplier belongs to company
  const supplier = await db
    .selectFrom("suppliers")
    .where("id", "=", params.supplierId)
    .where("company_id", "=", params.companyId)
    .select(["id"])
    .executeTakeFirst();

  if (!supplier) {
    return null;
  }

  const contact = await db
    .selectFrom("supplier_contacts")
    .where("id", "=", params.contactId)
    .where("supplier_id", "=", params.supplierId)
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
    .executeTakeFirst();

  if (!contact) {
    return null;
  }

  return {
    id: contact.id,
    supplier_id: contact.supplier_id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    role: contact.role,
    is_primary: Boolean(contact.is_primary),
    notes: contact.notes,
    created_at: toIso(contact.created_at),
    updated_at: toIso(contact.updated_at),
  };
}

export async function createSupplierContact(input: {
  companyId: number;
  supplierId: number;
  payload: {
    name: string;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    is_primary: boolean;
    notes?: string | null;
  };
}): Promise<unknown> {
  const db = getDb() as KyselySchema;

  // Tenant isolation: verify supplier belongs to company
  const hasAccess = await verifySupplierAccess(input.companyId, input.supplierId);
  if (!hasAccess) {
    throw { code: "SUPPLIER_NOT_FOUND", message: "Supplier not found or access denied" };
  }

  const insertResult = await db.transaction().execute(async (trx) => {
    // P1-FIX #3: Lock supplier row first to serialize primary-contact operations
    // across concurrent create/update of contacts for the same supplier.
    await trx
      .selectFrom("suppliers")
      .where("id", "=", input.supplierId)
      .where("company_id", "=", input.companyId)
      .select(["id"])
      .forUpdate()
      .executeTakeFirst();

    if (input.payload.is_primary) {
      // P1-FIX #6: Lock existing primary contacts by selecting with forUpdate()
      // first, then clear the flag — prevents dual-primary under concurrency.
      const existingPrimary = await trx
        .selectFrom("supplier_contacts")
        .where("supplier_id", "=", input.supplierId)
        .where("is_primary", "=", 1)
        .select(["id"])
        .forUpdate()
        .execute();

      if (existingPrimary.length > 0) {
        await trx
          .updateTable("supplier_contacts")
          .set({ is_primary: 0 })
          .where("id", "=", existingPrimary[0].id)
          .execute();
      }
    }

    return trx
      .insertInto("supplier_contacts")
      .values({
        supplier_id: input.supplierId,
        name: input.payload.name,
        email: input.payload.email ?? null,
        phone: input.payload.phone ?? null,
        role: input.payload.role ?? null,
        is_primary: input.payload.is_primary ? 1 : 0,
        notes: input.payload.notes ?? null,
      })
      .executeTakeFirst();
  });

  const insertedId = Number(insertResult.insertId);
  if (!insertedId) {
    throw new Error("Failed to create supplier contact");
  }

  const contact = await getSupplierContactById({
    companyId: input.companyId,
    supplierId: input.supplierId,
    contactId: insertedId,
  });

  if (!contact) {
    throw new Error("Failed to fetch created supplier contact");
  }
  return contact;
}

export async function updateSupplierContact(input: {
  companyId: number;
  supplierId: number;
  contactId: number;
  payload: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    notes?: string | null;
    is_primary?: boolean;
  };
}): Promise<unknown | null> {
  const db = getDb() as KyselySchema;

  // Tenant isolation: verify supplier belongs to company
  const hasAccess = await verifySupplierAccess(input.companyId, input.supplierId);
  if (!hasAccess) {
    return null;
  }

  const existing = await db
    .selectFrom("supplier_contacts")
    .where("id", "=", input.contactId)
    .where("supplier_id", "=", input.supplierId)
    .select(["id"])
    .executeTakeFirst();

  if (!existing) {
    return null;
  }

  const updateValues: Record<string, unknown> = {};
  const p = input.payload;

  if (p.name !== undefined) updateValues.name = p.name;
  if (p.email !== undefined) updateValues.email = p.email;
  if (p.phone !== undefined) updateValues.phone = p.phone;
  if (p.role !== undefined) updateValues.role = p.role;
  if (p.notes !== undefined) updateValues.notes = p.notes;
  if (p.is_primary !== undefined) updateValues.is_primary = p.is_primary ? 1 : 0;

  await db.transaction().execute(async (trx) => {
    // P1-FIX #3: Lock supplier row first to serialize primary-contact operations
    // across concurrent create/update of contacts for the same supplier.
    await trx
      .selectFrom("suppliers")
      .where("id", "=", input.supplierId)
      .where("company_id", "=", input.companyId)
      .select(["id"])
      .forUpdate()
      .executeTakeFirst();

    if (p.is_primary) {
      // P1-FIX #6: Lock existing primary contacts by selecting with forUpdate()
      // first, then clear the flag — prevents dual-primary under concurrency.
      const existingPrimary = await trx
        .selectFrom("supplier_contacts")
        .where("supplier_id", "=", input.supplierId)
        .where("is_primary", "=", 1)
        .select(["id"])
        .forUpdate()
        .execute();

      if (existingPrimary.length > 0) {
        await trx
          .updateTable("supplier_contacts")
          .set({ is_primary: 0 })
          .where("id", "=", existingPrimary[0].id)
          .execute();
      }
    }

    await trx
      .updateTable("supplier_contacts")
      .set(updateValues)
      .where("id", "=", input.contactId)
      .where("supplier_id", "=", input.supplierId)
      .executeTakeFirst();
  });

  return getSupplierContactById({
    companyId: input.companyId,
    supplierId: input.supplierId,
    contactId: input.contactId,
  });
}

export async function deleteSupplierContact(input: {
  companyId: number;
  supplierId: number;
  contactId: number;
}): Promise<boolean> {
  const db = getDb() as KyselySchema;

  // Tenant isolation: verify supplier belongs to company
  const hasAccess = await verifySupplierAccess(input.companyId, input.supplierId);
  if (!hasAccess) {
    return false;
  }

  const existing = await db
    .selectFrom("supplier_contacts")
    .where("id", "=", input.contactId)
    .where("supplier_id", "=", input.supplierId)
    .select(["id"])
    .executeTakeFirst();

  if (!existing) {
    return false;
  }

  await db
    .deleteFrom("supplier_contacts")
    .where("id", "=", input.contactId)
    .where("supplier_id", "=", input.supplierId)
    .execute();

  return true;
}

export async function verifySupplierAccess(
  companyId: number,
  supplierId: number
): Promise<boolean> {
  const db = getDb() as KyselySchema;
  const supplier = await db
    .selectFrom("suppliers")
    .where("id", "=", supplierId)
    .where("company_id", "=", companyId)
    .where("is_active", "=", 1)
    .select(["id"])
    .executeTakeFirst();
  return supplier !== undefined;
}