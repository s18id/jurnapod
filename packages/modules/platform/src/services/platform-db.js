// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
// =============================================================================
// Customer Repository Implementation
// =============================================================================
function escapeLikePattern(input) {
    if (!input)
        return "";
    return input.replace(/[%_\\]/g, (char) => `\\${char}`);
}
/**
 * Convert domain type string to DB integer.
 */
function toDbType(type) {
    return type === "PERSON" ? 1 : 2;
}
export class KyselyCustomerRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findById(companyId, customerId) {
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
        if (!row)
            return null;
        return {
            ...row,
            type: Number(row.type)
        };
    }
    async findByCode(companyId, code) {
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
        if (!row)
            return null;
        return {
            ...row,
            type: Number(row.type)
        };
    }
    async list(companyId, filters) {
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
            query = query.where((eb) => eb.or([
                eb("display_name", "like", searchPattern),
                eb("email", "like", searchPattern),
                eb("phone", "like", searchPattern)
            ]));
        }
        if (filters?.type) {
            const typeFilter = filters.type;
            // NOTE: toDbType returns 1 or 2, but Kysely types reflect current DB schema (ENUM).
            // After migration runs and schema regenerates, this will typecheck correctly.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            query = query.where("type", "=", String(toDbType(typeFilter)));
        }
        query = query.orderBy("id", "asc");
        const limit = filters?.limit ?? 20;
        const offset = filters?.offset ?? 0;
        query = query.limit(limit).offset(offset);
        const rows = await query.execute();
        return rows.map((row) => ({
            ...row,
            type: Number(row.type)
        }));
    }
    async count(companyId, filters) {
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
            query = query.where((eb) => eb.or([
                eb("display_name", "like", searchPattern),
                eb("email", "like", searchPattern),
                eb("phone", "like", searchPattern)
            ]));
        }
        if (filters?.type) {
            const typeFilter = filters.type;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            query = query.where("type", "=", String(toDbType(typeFilter)));
        }
        const result = await query.executeTakeFirst();
        return Number(result?.total ?? 0);
    }
    async create(data, actorUserId) {
        const result = await this.db
            .insertInto("customers")
            .values({
            company_id: data.companyId,
            code: data.code,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    async update(companyId, customerId, data, actorUserId) {
        const updates = {
            updated_by_user_id: actorUserId
        };
        if (data.type !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            updates.type = toDbType(data.type);
        }
        if (data.displayName !== undefined)
            updates.display_name = data.displayName;
        if (data.companyName !== undefined)
            updates.company_name = data.companyName;
        if (data.taxId !== undefined)
            updates.tax_id = data.taxId;
        if (data.email !== undefined)
            updates.email = data.email;
        if (data.phone !== undefined)
            updates.phone = data.phone;
        if (data.addressLine1 !== undefined)
            updates.address_line1 = data.addressLine1;
        if (data.addressLine2 !== undefined)
            updates.address_line2 = data.addressLine2;
        if (data.city !== undefined)
            updates.city = data.city;
        if (data.postalCode !== undefined)
            updates.postal_code = data.postalCode;
        if (data.notes !== undefined)
            updates.notes = data.notes;
        if (data.isActive !== undefined)
            updates.is_active = data.isActive ? 1 : 0;
        await this.db
            .updateTable("customers")
            .set(updates)
            .where("id", "=", customerId)
            .where("company_id", "=", companyId)
            .where("deleted_at", "is", null)
            .execute();
        return customerId;
    }
    async softDelete(companyId, customerId, actorUserId) {
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
// KyselyPlatformDb Implementation
// =============================================================================
/**
 * Implementation of PlatformDb using Kysely.
 */
export class KyselyPlatformDb {
    db;
    _executor;
    constructor(db) {
        this.db = db;
        this._executor = new KyselyPlatformDbExecutor(db);
    }
    get executor() {
        return this._executor;
    }
    getTransaction() {
        return null; // KyselyPlatformDb doesn't manage transactions directly
    }
    async withTransaction(operation) {
        return await this.db.transaction().execute(async (trx) => {
            const executor = new KyselyPlatformDbExecutor(trx);
            return await operation(executor);
        });
    }
}
class KyselyPlatformDbExecutor {
    db;
    _customerRepository = null;
    constructor(db) {
        this.db = db;
    }
    getTransaction() {
        // Return the underlying transaction if available
        if ("transaction" in this.db && typeof this.db.transaction === "function") {
            // This is a workaround - the actual transaction is managed by withTransaction
            return null;
        }
        return null;
    }
    get customerRepository() {
        if (!this._customerRepository) {
            this._customerRepository = new KyselyCustomerRepository(this.db);
        }
        return this._customerRepository;
    }
}
// =============================================================================
// Standalone DB Functions — extracted from repository methods for reuse
// by test fixtures and non-service consumers.
// =============================================================================
/**
 * Insert a customer row directly using Kysely query builder.
 *
 * Extracted from KyselyCustomerRepository.create() — uses the same
 * `insertInto("customers")` pattern without the full service orchestration
 * (CreateCustomerInput mapping, actor user tracking, etc.).
 *
 * @param db - KyselySchema database instance
 * @param input - Customer data
 * @returns Inserted customer ID
 */
export async function insertCustomer(db, input) {
    const result = await db
        .insertInto("customers")
        .values({
        company_id: input.companyId,
        code: input.code,
        type: input.type ?? 1,
        display_name: input.displayName ?? `Customer ${input.code}`,
        email: input.email ?? null,
        is_active: input.isActive ?? 1,
        created_by_user_id: input.createdByUserId ?? null,
        updated_by_user_id: input.createdByUserId ?? null,
    })
        .executeTakeFirst();
    return Number(result.insertId);
}
//# sourceMappingURL=platform-db.js.map