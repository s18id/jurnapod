// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * PlatformDb - Database abstraction for platform module.
 * 
 * Abstracts all database access so the module doesn't depend on @jurnapod/db directly.
 * The API provides a concrete implementation at composition time.
 */

import type { KyselySchema } from "@jurnapod/db";
import type { Transaction } from "@jurnapod/db";
import { CUSTOMER_TYPE } from "@jurnapod/shared";

import type { CustomerRow, CreateCustomerInput, UpdateCustomerInput, CustomerListFilters } from "../customers/types/customers.js";
import type { CustomerRepository } from "../customers/interfaces/customer-repository.js";

// =============================================================================
// Customer Repository Implementation
// =============================================================================

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

export class KyselyCustomerRepository implements CustomerRepository {
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
    let query = this.db
      .selectFrom("customers")
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
      ]);

    if (filters?.isActive !== undefined) {
      query = query.where("is_active", "=", filters.isActive ? 1 : 0);
    }

    if (filters?.search) {
      const searchPattern = `%${escapeLikePattern(filters.search)}%`;
      query = query.where((eb) =>
        eb.or([
          eb("display_name", "like", searchPattern),
          eb("email", "like", searchPattern),
          eb("phone", "like", searchPattern)
        ])
      );
    }

    if (filters?.type) {
      const typeFilter = filters.type;
      // NOTE: toDbType returns 1 or 2, but Kysely types reflect current DB schema (ENUM).
      // After migration runs and schema regenerates, this will typecheck correctly.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query = query.where("type", "=", String(toDbType(typeFilter)) as any);
    }

    query = query.orderBy("id", "asc");

    const limit = filters?.limit ?? 20;
    const offset = filters?.offset ?? 0;
    query = query.limit(limit).offset(offset);

    const rows = await query.execute();
    return rows.map((row) => ({
      ...row,
      type: Number(row.type)
    })) as unknown as CustomerRow[];
  }

  async count(companyId: number, filters?: CustomerListFilters): Promise<number> {
    let query = this.db
      .selectFrom("customers")
      .where("company_id", "=", companyId)
      .where("deleted_at", "is", null)
      .select((eb) => eb.fn.count("id").as("total"));

    if (filters?.isActive !== undefined) {
      query = query.where("is_active", "=", filters.isActive ? 1 : 0);
    }

    if (filters?.search) {
      const searchPattern = `%${escapeLikePattern(filters.search)}%`;
      query = query.where((eb) =>
        eb.or([
          eb("display_name", "like", searchPattern),
          eb("email", "like", searchPattern),
          eb("phone", "like", searchPattern)
        ])
      );
    }

    if (filters?.type) {
      const typeFilter = filters.type;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query = query.where("type", "=", String(toDbType(typeFilter)) as any);
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: toDbType(data.type) as any,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updates.type = toDbType(data.type) as any;
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

// =============================================================================
// PlatformDbExecutor Interface
// =============================================================================

export interface PlatformDbExecutor {
  getTransaction(): Transaction | null;

  // Customer operations
  customerRepository: CustomerRepository;
}

// =============================================================================
// PlatformDb Interface
// =============================================================================

export interface PlatformDb {
  executor: PlatformDbExecutor;
  withTransaction<T>(operation: (executor: PlatformDbExecutor) => Promise<T>): Promise<T>;
}

// =============================================================================
// KyselyPlatformDb Implementation
// =============================================================================

/**
 * Implementation of PlatformDb using Kysely.
 */
export class KyselyPlatformDb implements PlatformDb {
  private readonly _executor: PlatformDbExecutor;

  constructor(private readonly db: KyselySchema) {
    this._executor = new KyselyPlatformDbExecutor(db);
  }

  get executor(): PlatformDbExecutor {
    return this._executor;
  }

  getTransaction(): Transaction | null {
    return null; // KyselyPlatformDb doesn't manage transactions directly
  }

  async withTransaction<T>(operation: (executor: PlatformDbExecutor) => Promise<T>): Promise<T> {
    return await this.db.transaction().execute(async (trx) => {
      const executor = new KyselyPlatformDbExecutor(trx as KyselySchema);
      return await operation(executor);
    });
  }
}

class KyselyPlatformDbExecutor implements PlatformDbExecutor {
  private _customerRepository: CustomerRepository | null = null;

  constructor(private readonly db: KyselySchema) {}

  getTransaction(): Transaction | null {
    // Return the underlying transaction if available
    if ("transaction" in this.db && typeof this.db.transaction === "function") {
      // This is a workaround - the actual transaction is managed by withTransaction
      return null;
    }
    return null;
  }

  get customerRepository(): CustomerRepository {
    if (!this._customerRepository) {
      this._customerRepository = new KyselyCustomerRepository(this.db);
    }
    return this._customerRepository;
  }
}