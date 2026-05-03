// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplier contact service for purchasing module.
 *
 * Provides supplier contact CRUD operations with tenant isolation
 * and primary-contact locking semantics.
 */

import type { KyselySchema } from "@jurnapod/db";
import { toUtcIso } from "@jurnapod/shared";
import type {
  SupplierContact,
  ListSupplierContactsParams,
  GetSupplierContactParams,
  CreateSupplierContactInput,
  UpdateSupplierContactInput,
  DeleteSupplierContactInput,
} from "../types/supplier-contact.js";
import { SupplierNotFoundError } from "../errors.js";

// =============================================================================
// Helpers
// =============================================================================

function toIso(value: Date | string | null): string | null {
  return toUtcIso.dateLike(value) as string | null;
}

function normalizeContact(row: {
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
}): SupplierContact {
  return {
    id: row.id,
    supplier_id: row.supplier_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    is_primary: Boolean(row.is_primary),
    notes: row.notes,
    created_at: toIso(row.created_at)!,
    updated_at: toIso(row.updated_at)!,
  };
}

// =============================================================================
// Service
// =============================================================================

export class SupplierContactService {
  constructor(private readonly db: KyselySchema) {}

  /**
   * Verify that a supplier belongs to the given company and is active.
   */
  async verifySupplierAccess(companyId: number, supplierId: number): Promise<boolean> {
    const supplier = await this.db
      .selectFrom("suppliers")
      .where("id", "=", supplierId)
      .where("company_id", "=", companyId)
      .where("is_active", "=", 1)
      .select(["id"])
      .executeTakeFirst();
    return supplier !== undefined;
  }

  async listContacts(params: ListSupplierContactsParams): Promise<SupplierContact[]> {
    // Tenant isolation: verify supplier belongs to company
    const supplier = await this.db
      .selectFrom("suppliers")
      .where("id", "=", params.supplierId)
      .where("company_id", "=", params.companyId)
      .select(["id"])
      .executeTakeFirst();

    if (!supplier) {
      return [];
    }

    const contacts = await this.db
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

    return contacts.map((ct) => normalizeContact(ct as never));
  }

  async getContactById(params: GetSupplierContactParams): Promise<SupplierContact | null> {
    // Tenant isolation: verify supplier belongs to company
    const supplier = await this.db
      .selectFrom("suppliers")
      .where("id", "=", params.supplierId)
      .where("company_id", "=", params.companyId)
      .select(["id"])
      .executeTakeFirst();

    if (!supplier) {
      return null;
    }

    const contact = await this.db
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

    return normalizeContact(contact as never);
  }

  async createContact(input: CreateSupplierContactInput): Promise<SupplierContact> {
    // Tenant isolation: verify supplier belongs to company
    const hasAccess = await this.verifySupplierAccess(input.companyId, input.supplierId);
    if (!hasAccess) {
      throw new SupplierNotFoundError();
    }

    const insertResult = await this.db.transaction().execute(async (trx) => {
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

    const contact = await this.getContactById({
      companyId: input.companyId,
      supplierId: input.supplierId,
      contactId: insertedId,
    });

    if (!contact) {
      throw new Error("Failed to fetch created supplier contact");
    }
    return contact;
  }

  async updateContact(input: UpdateSupplierContactInput): Promise<SupplierContact | null> {
    // Tenant isolation: verify supplier belongs to company
    const hasAccess = await this.verifySupplierAccess(input.companyId, input.supplierId);
    if (!hasAccess) {
      return null;
    }

    const existing = await this.db
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

    await this.db.transaction().execute(async (trx) => {
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

    return this.getContactById({
      companyId: input.companyId,
      supplierId: input.supplierId,
      contactId: input.contactId,
    });
  }

  async deleteContact(input: DeleteSupplierContactInput): Promise<boolean> {
    // Tenant isolation: verify supplier belongs to company
    const hasAccess = await this.verifySupplierAccess(input.companyId, input.supplierId);
    if (!hasAccess) {
      return false;
    }

    const existing = await this.db
      .selectFrom("supplier_contacts")
      .where("id", "=", input.contactId)
      .where("supplier_id", "=", input.supplierId)
      .select(["id"])
      .executeTakeFirst();

    if (!existing) {
      return false;
    }

    await this.db
      .deleteFrom("supplier_contacts")
      .where("id", "=", input.contactId)
      .where("supplier_id", "=", input.supplierId)
      .execute();

    return true;
  }
}
