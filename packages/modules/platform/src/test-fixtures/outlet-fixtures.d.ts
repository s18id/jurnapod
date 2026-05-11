import type { KyselySchema } from "@jurnapod/db";
import type { OutletFixture } from "./types.js";
/**
 * Create a test outlet with PARTIAL (row-only) creation path.
 *
 * PARTIAL FIXTURE MODE — EXCEPTION: No package-level createOutlet service exists
 * for test-only fixture creation with audit logging. This partial path creates
 * only the row using raw SQL INSERT.
 *
 * RATIONALE FOR EXCEPTION: Full outlet bootstrap requires audit logging and is owned
 * by this package but no CompanyService.createOutletBasic() method exists yet.
 * This scope is narrow (outlets INSERT only) and bounded (company_id + code unique key).
 *
 * @param db - KyselySchema database instance
 * @param companyId - Parent company ID
 * @param options - Partial outlet options
 * @returns Outlet fixture with id, company_id, code, name
 */
export declare function createTestOutletMinimal(db: KyselySchema, companyId: number, options?: Partial<{
    code: string;
    name: string;
    timezone: string;
}>): Promise<OutletFixture>;
/**
 * Create a test outlet with NULL timezone for a given company.
 * Use with createTestCompanyWithoutTimezone() to produce a company+outlet
 * pair that triggers the no-UTC-fallback error path.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Parent company ID
 * @param options - Partial outlet options (timezone must NOT be set here)
 * @returns Outlet fixture with id, company_id, code, name, and null timezone
 */
export declare function createTestOutletWithoutTimezone(db: KyselySchema, companyId: number, options?: Partial<{
    code: string;
    name: string;
}>): Promise<OutletFixture>;
//# sourceMappingURL=outlet-fixtures.d.ts.map