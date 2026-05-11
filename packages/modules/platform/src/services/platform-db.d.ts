/**
 * PlatformDb - Database abstraction for platform module.
 *
 * Abstracts all database access so the module doesn't depend on @jurnapod/db directly.
 * The API provides a concrete implementation at composition time.
 */
import type { KyselySchema } from "@jurnapod/db";
import type { Transaction } from "@jurnapod/db";
import type { CustomerRow, CreateCustomerInput, UpdateCustomerInput, CustomerListFilters } from "../customers/types/customers.js";
import type { CustomerRepository } from "../customers/interfaces/customer-repository.js";
export declare class KyselyCustomerRepository implements CustomerRepository {
    private readonly db;
    constructor(db: KyselySchema);
    findById(companyId: number, customerId: number): Promise<CustomerRow | null>;
    findByCode(companyId: number, code: string): Promise<CustomerRow | null>;
    list(companyId: number, filters?: CustomerListFilters): Promise<CustomerRow[]>;
    count(companyId: number, filters?: CustomerListFilters): Promise<number>;
    create(data: CreateCustomerInput, actorUserId: number): Promise<number>;
    update(companyId: number, customerId: number, data: UpdateCustomerInput, actorUserId: number): Promise<number>;
    softDelete(companyId: number, customerId: number, actorUserId: number): Promise<void>;
}
export interface PlatformDbExecutor {
    getTransaction(): Transaction | null;
    customerRepository: CustomerRepository;
}
export interface PlatformDb {
    executor: PlatformDbExecutor;
    withTransaction<T>(operation: (executor: PlatformDbExecutor) => Promise<T>): Promise<T>;
}
/**
 * Implementation of PlatformDb using Kysely.
 */
export declare class KyselyPlatformDb implements PlatformDb {
    private readonly db;
    private readonly _executor;
    constructor(db: KyselySchema);
    get executor(): PlatformDbExecutor;
    getTransaction(): Transaction | null;
    withTransaction<T>(operation: (executor: PlatformDbExecutor) => Promise<T>): Promise<T>;
}
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
export declare function insertCustomer(db: KyselySchema, input: {
    companyId: number;
    code: string;
    type?: number;
    displayName?: string;
    email?: string | null;
    isActive?: number;
    createdByUserId?: number;
}): Promise<number>;
//# sourceMappingURL=platform-db.d.ts.map