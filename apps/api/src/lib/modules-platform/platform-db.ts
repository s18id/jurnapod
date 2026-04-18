// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Platform Db Adapter for API
 *
 * Implements the CustomerRepository interface from modules-platform
 * using the API's database infrastructure.
 */

import type { KyselySchema } from "@/lib/db";
import type { CustomerRow, CreateCustomerInput, UpdateCustomerInput, CustomerListFilters, CustomerRepository } from "@jurnapod/modules-platform";

function escapeLikePattern(input: string): string {
  if (!input) return "";
  return input.replace(/[%_\\]/g, (char) => `\\${char}`);
}

/**
 * Convert domain type string to DB integer.
 */
function toDbType(type: "PERSON" | "BUSINESS"): 1 | 2 {
  return type === "PERSON" ? 1 : 2;
}

/**
 * ApiCustomerRepository
 *
 * Implements CustomerRepository interface using API database access.
 */
export class ApiCustomerRepository implements CustomerRepository {
  constructor(private readonly db: KyselySchema) {}

  async findById(companyId: number, customerId: number): Promise<CustomerRow | null> {
    const row = await this.db
      .selectFrom("customers")
      .where("id", "=", customerId)
      .where("company_id", "=", companyId)
      .where("deleted_at", "is", null)
      .select([
        "id",
        "company_id",
        "code",
        "type",
        "display_name",
        "company_name",
        "tax_id",
        "email",
        "phone",
        "address_line1",
        "address_line2",
        "city",
        "postal_code",
        "notes",
        "is_active",
        "deleted_at",
        "created_by_user_id",
        "updated_by_user_id",
        "created_at",
        "updated_at"
      ])
      .executeTakeFirst();

    if (!row) return null;
    return {
      ...row,
      type: Number(row.type)
    } as unknown as CustomerRow;
  }

  async findByCode(companyId: number, code: string): Promise<CustomerRow | null> {
    const row = await this.db
      .selectFrom("customers")
      .where("code", "=", code)
      .where("company_id", "=", companyId)
      .where("deleted_at", "is", null)
      .select([
        "id",
        "company_id",
        "code",
        "type",
        "display_name",
        "company_name",
        "tax_id",
        "email",
        "phone",
        "address_line1",
        "address_line2",
        "city",
        "postal_code",
        "notes",
        "is_active",
        "deleted_at",
        "created_by_user_id",
        "updated_by_user_id",
        "created_at",
        "updated_at"
      ])
      .executeTakeFirst();

    if (!row) return null;
    return {
      ...row,
      type: Number(row.type)
    } as unknown as CustomerRow;
  }

async list(companyId: number, filters?: CustomerListFilters): Promise<CustomerRow[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = this.db.selectFrom("customers")
      .select(["id", "company_id", "code", "type", "display_name", "company_name", "tax_id", "email", "phone", "address_line1", "address_line2", "city", "postal_code", "notes", "is_active", "deleted_at", "created_by_user_id", "updated_by_user_id", "created_at", "updated_at"])
      .where("company_id", "=", companyId);

    // isActive filter
    if (filters?.isActive === true) {
      q = q.where("deleted_at", "is", null).where("is_active", "=", 1);
    } else if (filters?.isActive === false) {
      // Order by id DESC to get most recently inactive first
      q = q.where((eb: any) => eb.or([
        eb("is_active", "=", 0),
        eb("deleted_at", "is not", null)
      ]));
    } else {
      q = q.where("deleted_at", "is", null).where("is_active", "=", 1);
    }

    // Type filter
    if (filters?.type) {
      q = q.where("type", "=", toDbType(filters.type));
    }

    // Search filter
    if (filters?.search) {
      const pattern = `%${escapeLikePattern(filters.search)}%`;
      q = q.where((eb: any) => eb.or([
        eb("display_name", "like", pattern),
        eb("email", "like", pattern),
        eb("phone", "like", pattern)
      ]));
    }

    // Order by id desc for inactive, asc for active
    const orderBy = filters?.isActive === false ? "desc" : "asc";
    const rows = await q
      .orderBy("id", orderBy)
      .limit(filters?.limit ?? 20)
      .offset(filters?.offset ?? 0)
      .execute();

    return rows.map((row: any) => ({ ...row, type: Number(row.type) })) as unknown as CustomerRow[];
  }

  async count(companyId: number, filters?: CustomerListFilters): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = this.db
      .selectFrom("customers")
      .select((eb) => eb.fn.count("id").as("total"))
      .where("company_id", "=", companyId);

    // isActive filter
    if (filters?.isActive === true) {
      query = query.where("deleted_at", "is", null).where("is_active", "=", 1);
    } else if (filters?.isActive === false) {
      query = query.where((eb: any) => eb.or([
        eb("is_active", "=", 0),
        eb("deleted_at", "is not", null)
      ]));
    } else {
      query = query.where("deleted_at", "is", null).where("is_active", "=", 1);
    }

    // Type filter
    if (filters?.type) {
      query = query.where("type", "=", toDbType(filters.type));
    }

    // Search filter
    if (filters?.search) {
      const pattern = `%${escapeLikePattern(filters.search)}%`;
      query = query.where((eb: any) =>
        eb.or([
          eb("display_name", "like", pattern),
          eb("email", "like", pattern),
          eb("phone", "like", pattern)
        ])
      );
    }

    const result = await query.executeTakeFirst();
    return Number(result?.total ?? 0);
  }

  async create(data: CreateCustomerInput, actorUserId: number): Promise<number> {
    const result = await this.db
      .insertInto("customers")
      .values({
        company_id: data.companyId,
        code: data.code,
        type: toDbType(data.type),
        display_name: data.displayName,
        company_name: data.companyName ?? null,
        tax_id: data.taxId ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        address_line1: data.addressLine1 ?? null,
        address_line2: data.addressLine2 ?? null,
        city: data.city ?? null,
        postal_code: data.postalCode ?? null,
        notes: data.notes ?? null,
        is_active: 1,
        created_by_user_id: actorUserId,
        updated_by_user_id: actorUserId
      })
      .executeTakeFirst();

    return Number(result.insertId);
  }

  async update(companyId: number, customerId: number, data: UpdateCustomerInput, actorUserId: number): Promise<number> {
    const updates: Record<string, unknown> = {
      updated_by_user_id: actorUserId
    };

    if (data.type !== undefined) {
      // NOTE: toDbType converts domain string to DB integer.
      updates.type = toDbType(data.type);
    }
    if (data.displayName !== undefined) updates.display_name = data.displayName;
    if (data.companyName !== undefined) updates.company_name = data.companyName;
    if (data.taxId !== undefined) updates.tax_id = data.taxId;
    if (data.email !== undefined) updates.email = data.email;
    if (data.phone !== undefined) updates.phone = data.phone;
    if (data.addressLine1 !== undefined) updates.address_line1 = data.addressLine1;
    if (data.addressLine2 !== undefined) updates.address_line2 = data.addressLine2;
    if (data.city !== undefined) updates.city = data.city;
    if (data.postalCode !== undefined) updates.postal_code = data.postalCode;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.isActive !== undefined) updates.is_active = data.isActive ? 1 : 0;

    await this.db
      .updateTable("customers")
      .set(updates)
      .where("id", "=", customerId)
      .where("company_id", "=", companyId)
      .where("deleted_at", "is", null)
      .execute();

    return customerId;
  }

  async softDelete(companyId: number, customerId: number, actorUserId: number): Promise<void> {
    await this.db
      .updateTable("customers")
      .set({
        deleted_at: new Date(),
        is_active: 0,
        updated_by_user_id: actorUserId
      })
      .where("id", "=", customerId)
      .where("company_id", "=", companyId)
      .where("deleted_at", "is", null)
      .execute();
  }
}
