import type { KyselySchema } from "@jurnapod/db";
import type { CompanyFixture } from "./types.js";
/**
 * Create a test company with PARTIAL (row-only) creation path.
 *
 * Uses CompanyService.createCompanyBasic() for production-invariant path.
 * Duplicate handling: catches CompanyCodeExistsError and fetches existing row.
 *
 * @param db - KyselySchema database instance
 * @param options - Partial company options
 * @returns Company fixture with id, code, name
 */
export declare function createTestCompanyMinimal(db: KyselySchema, options?: Partial<{
    code: string;
    name: string;
    timezone: string;
    currency_code: string;
}>): Promise<CompanyFixture>;
/**
 * Create a test company with NULL timezone for tests validating
 * fail-closed behavior when no outlet/company timezone is configured.
 *
 * @param db - KyselySchema database instance
 * @param options - Partial company options (timezone must NOT be set here)
 * @returns Company fixture with id, code, name, and null timezone
 */
export declare function createTestCompanyWithoutTimezone(db: KyselySchema, options?: Partial<{
    code: string;
    name: string;
    currency_code: string;
}>): Promise<CompanyFixture>;
//# sourceMappingURL=company-fixtures.d.ts.map