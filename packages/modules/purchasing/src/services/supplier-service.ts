// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplier service for purchasing module.
 *
 * Provides supplier CRUD operations with tenant isolation and PO open-doc guard.
 */

import type { KyselySchema, Transaction } from "@jurnapod/db";
import type {
  Supplier,
  SupplierWithContacts,
  SupplierListParams,
  SupplierListResult,
  CreateSupplierInput,
  UpdateSupplierInput,
  SoftDeleteSupplierInput,
  SupplierContact,
} from "../types/supplier.js";
import { SupplierHasOpenDocumentsError, SupplierNotFoundError } from "../errors.js";

// =============================================================================
// Helpers
// =============================================================================

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

function normalizeSupplier(row: {
  id: number;
  company_id: number;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  currency: string;
  credit_limit: unknown;
  payment_terms_days: number | null;
  notes: string | null;
  is_active: number;
  created_by_user_id: number;
  updated_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
  contacts?: Array<{
    id: number;
    supplier_id: number;
    name: string;
    email: string | null;
    phone: string | null;
    role: string | null;
    is_primary: number;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  }>;
}): SupplierWithContacts | Supplier {
  const base = {
    id: row.id,
    company_id: row.company_id,
    code: row.code,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address_line1: row.address_line1,
    address_line2: row.address_line2,
    city: row.city,
    postal_code: row.postal_code,
    country: row.country,
    currency: row.currency,
    credit_limit: formatDecimal(row.credit_limit),
    payment_terms_days: row.payment_terms_days,
    notes: row.notes,
    is_active: Boolean(row.is_active),
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id,
    created_at: toIso(row.created_at)!,
    updated_at: toIso(row.updated_at)!,
  };

  if (row.contacts) {
    return {
      ...base,
      contacts: row.contacts.map((ct) => ({
        id: ct.id,
        supplier_id: ct.supplier_id,
        name: ct.name,
        email: ct.email,
        phone: ct.phone,
        role: ct.role,
        is_primary: Boolean(ct.is_primary),
        notes: ct.notes,
        created_at: toIso(ct.created_at)!,
        updated_at: toIso(ct.updated_at)!,
      })),
    };
  }

  return base as Supplier;
}

// =============================================================================
// Service
// =============================================================================

export class SupplierService {
  constructor(private readonly db: KyselySchema) {}

  async listSuppliers(params: SupplierListParams): Promise<SupplierListResult> {
    const isActiveValue = params.isActive !== undefined ? (params.isActive ? 1 : 0) : 1;

    const countResult = await this.db
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

    let listQuery = this.db
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
      suppliers: suppliers.map((s) =>
        normalizeSupplier(s as never)
      ),
      total: Number((countResult as { count?: string })?.count ?? 0),
      limit: params.limit,
      offset: params.offset,
    };
  }

  async getSupplierById(companyId: number, supplierId: number, includeInactive = false): Promise<SupplierWithContacts | null> {
    let q = this.db
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

    const contacts = await this.db
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

    return normalizeSupplier({
      ...(supplier as Record<string, unknown>),
      contacts: contacts as Array<{
        id: number;
        supplier_id: number;
        name: string;
        email: string | null;
        phone: string | null;
        role: string | null;
        is_primary: number;
        notes: string | null;
        created_at: Date;
        updated_at: Date;
      }>,
    } as never) as SupplierWithContacts;
  }

  async createSupplier(input: CreateSupplierInput): Promise<SupplierWithContacts> {
    const p = input.payload;

    const insertResult = await this.db
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

    const supplier = await this.getSupplierById(input.companyId, insertedId);
    if (!supplier) {
      throw new Error("Failed to fetch created supplier");
    }
    return supplier;
  }

  async updateSupplier(input: UpdateSupplierInput): Promise<SupplierWithContacts | null> {
    const p = input.payload;

    // P1-FIX #1: When is_active transitions true→false via PATCH, run the same
    // open-document guard as softDeleteSupplier to prevent bypassing the guard.
    if (p.is_active === false) {
      return this.db.transaction().execute(async (trx) => {
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
            throw new SupplierHasOpenDocumentsError();
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

        return this.getSupplierByIdWithTrx(trx, input.companyId, input.supplierId, true);
      });
    }

    const existing = await this.db
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

    await this.db
      .updateTable("suppliers")
      .set(updateValues)
      .where("id", "=", input.supplierId)
      .where("company_id", "=", input.companyId)
      .executeTakeFirst();

    return this.getSupplierById(input.companyId, input.supplierId, true);
  }

  async softDeleteSupplier(input: SoftDeleteSupplierInput): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
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
        throw new SupplierHasOpenDocumentsError();
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

  /**
   * Internal helper to get supplier with contacts using an existing transaction.
   */
  private async getSupplierByIdWithTrx(
    trx: Transaction,
    companyId: number,
    supplierId: number,
    includeInactive: boolean
  ): Promise<SupplierWithContacts | null> {
    let q = trx
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

    const contacts = await trx
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

    return normalizeSupplier({
      ...(supplier as Record<string, unknown>),
      contacts: contacts as Array<{
        id: number;
        supplier_id: number;
        name: string;
        email: string | null;
        phone: string | null;
        role: string | null;
        is_primary: number;
        notes: string | null;
        created_at: Date;
        updated_at: Date;
      }>,
    } as never) as SupplierWithContacts;
  }
}
