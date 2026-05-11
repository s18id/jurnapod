/**
 * @jurnapod/modules-platform test fixtures
 *
 * This package provides deterministic, owner-package fixture functions for
 * platform domain (company/outlet). All functions accept injected `db: KyselySchema`.
 */
export type { CompanyFixture, OutletFixture, } from "./types.js";
export { createTestCompanyMinimal, createTestCompanyWithoutTimezone, } from "./company-fixtures.js";
export { createTestOutletMinimal, createTestOutletWithoutTimezone, } from "./outlet-fixtures.js";
export { createTestAuditLog, type AuditLogFixture, type CreateTestAuditLogOpts, } from "./audit-fixtures.js";
//# sourceMappingURL=index.d.ts.map