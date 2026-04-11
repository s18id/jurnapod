# Story 39.1: Phase 1A — Shared Package Foundation

**Epic:** [Epic 39 - ACL Reorganization](../../epic-39.md)
**Status:** todo
**Priority:** High

## Objective

Establish the shared package foundation for resource-level ACL by adding RESOURCE_CODES constants, updating ModuleSchema to support resource column, renaming REPORT permission to ANALYZE, and consolidating MODULE_CODES to 7 canonical modules.

## Context

The codebase currently has 4 inconsistent module code definitions across different locations with 14+ modules including the standalone `reports` module. This story establishes the canonical constants that will be the single source of truth going forward.

## Acceptance Criteria

- [ ] RESOURCE_CODES constants added for all 21 resources across 7 modules
- [ ] ModuleSchema updated to include optional `resource` column (nullable for backward compatibility)
- [ ] Permission bit renamed: REPORT (16) → ANALYZE (same value, clearer semantics)
- [ ] MANAGE permission bit added with value 32 (0b100000)
- [ ] PERMISSION_MASK.CRUDAM added with value 63 (0b111111)
- [ ] MODULE_CODES consolidated to 7 canonical modules: platform, pos, sales, inventory, accounting, treasury, reservations
- [ ] `packages/shared/src/constants/rbac.ts` updated with ANALYZE constant and MANAGE bit (32) and CRUDAM mask (63)
- [ ] `packages/shared/src/constants/modules.ts` consolidated with single MODULE_CODES
- [ ] `packages/shared/src/schemas/modules.ts` updated to remove reports module
- [ ] `packages/shared/src/schemas/module-roles.ts` updated to include resource column
- [ ] npm run build -w @jurnapod/shared passes
- [ ] npm run typecheck -w @jurnapod/shared passes

## Technical Details

### Files to Modify

- `packages/shared/src/constants/rbac.ts` — Rename REPORT → ANALYZE, keep same value (16); Add MANAGE bit (32) and CRUDAM mask (63)
- `packages/shared/src/constants/modules.ts` — Consolidate to single MODULE_CODES with 7 modules
- `packages/shared/src/schemas/modules.ts` — Update MODULE_CODES array, remove reports
- `packages/shared/src/schemas/module-roles.ts` — Update ModuleSchema to include `resource` column

### Dependencies

- None (foundation story)

### Implementation Notes

1. **RESOURCE_CODES structure** should follow pattern:
   ```typescript
   export const RESOURCE_CODES = {
     // platform: 5 resources
     PLATFORM_USERS: 'users',
     PLATFORM_ROLES: 'roles',
     PLATFORM_COMPANIES: 'companies',
     PLATFORM_OUTLETS: 'outlets',
     PLATFORM_SETTINGS: 'settings',
     // accounting: 4 resources
     ACCOUNTING_JOURNALS: 'journals',
     ACCOUNTING_ACCOUNTS: 'accounts',
     ACCOUNTING_FISCAL_YEARS: 'fiscal_years',
     ACCOUNTING_REPORTS: 'reports',
     // inventory: 3 resources
     INVENTORY_ITEMS: 'items',
     INVENTORY_STOCK: 'stock',
     INVENTORY_COSTING: 'costing',
     // treasury: 2 resources
     TREASURY_TRANSACTIONS: 'transactions',
     TREASURY_ACCOUNTS: 'accounts',
     // sales: 3 resources
     SALES_INVOICES: 'invoices',
     SALES_ORDERS: 'orders',
     SALES_PAYMENTS: 'payments',
     // pos: 2 resources
     POS_TRANSACTIONS: 'transactions',
     POS_CONFIG: 'config',
     // reservations: 2 resources
     RESERVATIONS_BOOKINGS: 'bookings',
     RESERVATIONS_TABLES: 'tables',
   } as const;
   ```

2. **ModuleSchema update** - Add `resource?: string` field (nullable for backward compatibility)

3. **Keep PERMISSION_MASK constants** unchanged except rename REPORT to ANALYZE

4. **Updated PERMISSION_BITS with MANAGE**:
   ```typescript
   export const PERMISSION_BITS = {
     READ:    1,    // 0b000001
     CREATE:  2,    // 0b000010
     UPDATE:  4,    // 0b000100
     DELETE:  8,    // 0b001000
     ANALYZE: 16,   // 0b010000 (was REPORT)
     MANAGE:  32,   // 0b100000 - NEW
   } as const;
   ```

5. **Updated PERMISSION_MASK with CRUDAM**:
   ```typescript
   export const PERMISSION_MASK = {
     READ:    1,                               // 0b000001
     WRITE:   PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE,      // 0b000110
     CRUD:    PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | 
              PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE,       // 0b001111
     CRUDA:   PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | 
              PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE | 
              PERMISSION_BITS.ANALYZE,                              // 0b011111
     CRUDAM:  PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | 
              PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE | 
              PERMISSION_BITS.ANALYZE | PERMISSION_BITS.MANAGE,     // 0b111111 - NEW
   } as const;
   ```

## Testing Strategy

- Unit tests: Verify RESOURCE_CODES has all 21 resources (7 modules × resources)
- Unit tests: Verify MODULE_CODES has exactly 7 modules
- Unit tests: Verify ANALYZE = 16 (same as old REPORT value)
- Unit tests: Verify MANAGE = 32
- Unit tests: Verify CRUDAM = 63
- Unit tests: Verify all 6 permission bits have correct values
- Typecheck verification
- Build verification

## Dev Notes

[To be filled during implementation]
