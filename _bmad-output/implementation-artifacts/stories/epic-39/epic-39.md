# Epic 39: ACL Reorganization - Remove Reports Module, Consolidate to 7 Canonical Modules

**Status:** todo
**Theme:** Architecture / RBAC Cleanup
**Started:** 2026-04-11
**Completed:** -

## Epic Goal

Reorganize the Access Control List (ACL) module structure to eliminate confusion and establish clean module boundaries. Remove the standalone `reports` module, rename `REPORT` permission to `ANALYZE`, and consolidate to 7 canonical modules: `platform`, `pos`, `sales`, `inventory`, `accounting`, `treasury`, `reservations`.

## Context

The codebase currently has 4 inconsistent module code definitions across different locations:

| Source | Module Count | Includes Reports? |
|--------|-------------|-------------------|
| `ACCESS_MODULE_CODES` | 14 modules | Yes |
| `FEATURE_MODULE_CODES` | 7 modules | Yes (`reporting`) |
| `MODULE_CODES` (schemas) | 9 modules | Yes |
| `ModuleSchema` (module-roles) | 12 modules | Yes |

The `reports` module exists both as a permission bit (`REPORT=16`) and as a standalone module, causing confusion about where reports should be accessed from.

This fragmentation leads to:
- Inconsistent permission checks across the codebase
- Difficulty understanding which modules have reporting capabilities
- Risk of permission gaps or over-granting

## Problem Statement

### Current State Issues

1. **Permission bit `REPORT=16`** exists but is named after a module, not an action
2. **`reports` module** stands alone instead of being tied to source modules
3. **14+ module definitions** across 4 locations with no single source of truth
4. **`inventory_costing`** is treated as an ACL module when it's an internal package

### Proposed Solution

1. Remove `reports` ACL module entirely
2. Rename permission bit `REPORT` (16) → `ANALYZE` (same value, clearer semantics)
3. Consolidate to 7 canonical modules: `platform`, `pos`, `sales`, `inventory`, `accounting`, `treasury`, `reservations`
4. Access reports via `ANALYZE` permission on source modules (e.g., `sales.ANALYZE` for sales reports)
5. `inventory_costing` remains as internal package, not ACL module

## API Route Audit Results

We audited 49 route files across `/apps/api/src/routes` to validate our module consolidation approach. The audit confirms that removing the `reports` module is safe - routes already use our proposed pattern of accessing reports via source modules.

### Current Module Usage (12 modules → 7 modules)

| Current Module | Route Count | Maps To New Module |
|---------------|-------------|-------------------|
| `companies` | 1 | `platform` |
| `outlets` | 1 | `platform` |
| `users` | 1 | `platform` |
| `roles` | 2 | `platform` |
| `settings` | 8 | `platform` |
| `accounts` | 1 | `accounting` |
| `journals` | 1 | `accounting` |
| `accounting` | 1 (reports) | `accounting` |
| `cash_bank` | 1 | `treasury` |
| `inventory` | 7 | `inventory` |
| `sales` | 4 | `sales` |
| `pos` | 4 | `pos` |

### Key Findings

1. **`reports` module NOT used in routes** - Financial reports already use `accounting` module with `report` permission
2. **Sales sub-routes have ACL** - Confirmed `sales/invoices.ts`, `sales/orders.ts`, `sales/payments.ts`, `sales/credit-notes.ts` all use `module: "sales"`  
3. **Settings consolidation is safe** - All settings routes (tax-rates, audit, admin dashboards, config) already use `module: "settings"` which maps to `platform`

### Permission Patterns Found

Routes use these permission check patterns:
- `requireAccess({ module, permission })` - Primary ACL check
- `canManageCompanyDefaults(userId, companyId, module, permission)` - Company default guard
- `buildReportContext(c, module, ...)` - Reports wrapper

This validates our approach of consolidating to 7 canonical modules with `ANALYZE` permission for reports access.

## Module Mapping Reference

Complete mapping from old module codes to new module.resource format:

| Old Module | New Module | Resource | Rationale |
|------------|------------|----------|-----------|
| users | platform | users | User management is platform concern |
| roles | platform | roles | Role management is platform concern |
| companies | platform | companies | Company creation is platform concern |
| outlets | platform | outlets | Outlet management is platform concern |
| settings | platform | settings | System settings is platform concern |
| accounts | accounting | accounts | Chart of accounts is accounting concern |
| journals | accounting | journals | Journal entries are accounting concern |
| cash_bank | treasury | transactions | Cash/bank transactions are treasury concern |
| inventory | inventory | (module-level) | Kept as module, resources added in Story 39.6 |
| sales | sales | (module-level) | Kept as module, resources added in Story 39.8 |
| pos | pos | (module-level) | Kept as module, resources added in Story 39.9 |
| reports | REMOVED | — | Reports accessed via ANALYZE on source modules |
| reservations | reservations | (module-level) | New module for reservations feature |

**Migration Strategy:**
- platform, accounting, treasury: Full resource-level migration in Story 39.3.5
- inventory, sales, pos: Module-level during transition, resource-level in respective stories
- reports: Deleted entirely
- reservations: New module, no migration needed

## Final CRUDAM Design

After architect review, we adopted **Resource-Level ACL (Option A+)** — a permission model where access is scoped to `module.resource` with 6-bit permission masks. This provides finer-grained control than module-level CRUDAM while maintaining the same 6 permissions.

### Permission Model

Permission format: `module.resource` (e.g., `platform.users`, `accounting.journals`)

Each resource grants access to specific operations via a 6-bit permission mask.

### Permission Bits

| Bit | Name | Value | Binary | Purpose |
|-----|------|-------|--------|---------|
| 1 | READ | 1 | `0b000001` | View data and records |
| 2 | CREATE | 2 | `0b000010` | Create new records |
| 4 | UPDATE | 4 | `0b000100` | Modify existing records |
| 8 | DELETE | 8 | `0b001000` | Remove records |
| 16 | ANALYZE | 16 | `0b010000` | Reports, dashboards, analytics |
| 32 | MANAGE | 32 | `0b100000` | Setup, configuration, administration |

### Permission Masks

```typescript
PERMISSION_MASK = {
  READ: 1,                             // 0b000001
  WRITE: 2 | 4,                         // 0b000110 (CREATE | UPDATE)
  CRUD: 1 | 2 | 4 | 8,                  // 0b001111 (READ | CREATE | UPDATE | DELETE)
  CRUDA: 1 | 2 | 4 | 8 | 16,            // 0b011111 (CRUD | ANALYZE)
  CRUDAM: 1 | 2 | 4 | 8 | 16 | 32,      // 0b111111 (full permissions)
};
```

### Resource Categories

Resources are classified into three categories that define their intended permission patterns:

| Category | Permissions | Description |
|----------|-------------|-------------|
| **Operational** | CREATE, READ, UPDATE | Day-to-day transaction resources |
| **Structural** | MANAGE, READ | Setup, configuration, and administrative resources |
| **Analytical** | ANALYZE, READ | Reports and data export resources |

### 7 Modules with Resources

#### platform module

| Resource | Description | Category |
|----------|-------------|----------|
| `platform.users` | User management | Operational |
| `platform.roles` | Role management | Operational |
| `platform.companies` | Company creation | Structural (SUPER_ADMIN only) |
| `platform.outlets` | Outlet management | Operational |
| `platform.settings` | System settings | Structural |

#### accounting module

| Resource | Description | Category |
|----------|-------------|----------|
| `accounting.journals` | Daily journal entries | Operational |
| `accounting.accounts` | Chart of accounts | Structural |
| `accounting.fiscal_years` | Period management | Structural |
| `accounting.reports` | Financial reports | Analytical |

#### inventory module

| Resource | Description | Category |
|----------|-------------|----------|
| `inventory.items` | Item master | Operational |
| `inventory.stock` | Stock movements | Operational |
| `inventory.costing` | Costing method configuration | Structural |

#### treasury module

| Resource | Description | Category |
|----------|-------------|----------|
| `treasury.transactions` | Cash/bank transactions | Operational |
| `treasury.accounts` | Bank account setup | Structural |

#### sales module

| Resource | Description | Category |
|----------|-------------|----------|
| `sales.invoices` | Invoices | Operational |
| `sales.orders` | Orders | Operational |
| `sales.payments` | Payments | Operational |

#### pos module

| Resource | Description | Category |
|----------|-------------|----------|
| `pos.transactions` | POS transactions | Operational |
| `pos.config` | POS configuration | Structural |

#### reservations module

| Resource | Description | Category |
|----------|-------------|----------|
| `reservations.bookings` | Bookings | Operational |
| `reservations.tables` | Table management | Structural |

### Detailed Resource Permissions

#### platform Module

| Resource | SUPER_ADMIN | OWNER | COMPANY_ADMIN | ADMIN | ACCOUNTANT | CASHIER |
|----------|-------------|-------|---------------|-------|------------|---------|
| users | CRUDAM (63) | CRUDAM (63) | CRUDA (31) | READ (1) | READ (1) | — |
| roles | CRUDAM (63) | CRUDAM (63) | CRUDA (31) | READ (1) | — | — |
| companies | CRUDAM (63) | CRUDAM (63) | — | — | — | — |
| outlets | CRUDAM (63) | CRUDAM (63) | CRUDA (31) | READ (1) | — | — |
| settings | CRUDAM (63) | CRUDAM (63) | CRUDA (31) | READ (1) | — | — |

#### accounting Module

| Resource | SUPER_ADMIN | OWNER | COMPANY_ADMIN | ADMIN | ACCOUNTANT | CASHIER |
|----------|-------------|-------|---------------|-------|------------|---------|
| journals | CRUDAM (63) | CRUDAM (63) | CRUDA (31) | CRUDA (31) | CRUDA (31) | — |
| accounts | CRUDAM (63) | CRUDAM (63) | MANAGE+READ (33) | READ (1) | READ (1) | — |
| fiscal_years | CRUDAM (63) | CRUDAM (63) | MANAGE+READ (33) | READ (1) | READ (1) | — |
| reports | CRUDAM (63) | CRUDAM (63) | CRUDA (31) | READ (1) | CRUDA (31) | — |

#### inventory Module

| Resource | SUPER_ADMIN | OWNER | COMPANY_ADMIN | ADMIN | ACCOUNTANT | CASHIER |
|----------|-------------|-------|---------------|-------|------------|---------|
| items | CRUDAM (63) | CRUDAM (63) | CRUDA (31) | CRUDA (31) | READ (1) | — |
| stock | CRUDAM (63) | CRUDAM (63) | CRUDA (31) | CRUDA (31) | READ (1) | — |
| costing | CRUDAM (63) | CRUDAM (63) | MANAGE+READ (33) | READ (1) | — | — |

#### treasury Module

| Resource | SUPER_ADMIN | OWNER | COMPANY_ADMIN | ADMIN | ACCOUNTANT | CASHIER |
|----------|-------------|-------|---------------|-------|------------|---------|
| transactions | CRUDAM (63) | CRUDAM (63) | CRUDA (31) | CRUDA (31) | READ (1) | — |
| accounts | CRUDAM (63) | CRUDAM (63) | MANAGE+READ (33) | READ (1) | — | — |

#### sales Module

| Resource | SUPER_ADMIN | OWNER | COMPANY_ADMIN | ADMIN | ACCOUNTANT | CASHIER |
|----------|-------------|-------|---------------|-------|------------|---------|
| invoices | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDA (31) | READ (1) | — |
| orders | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDA (31) | READ (1) | — |
| payments | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDA (31) | READ (1) | — |

#### pos Module

| Resource | SUPER_ADMIN | OWNER | COMPANY_ADMIN | ADMIN | ACCOUNTANT | CASHIER |
|----------|-------------|-------|---------------|-------|------------|---------|
| transactions | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDA (31) | READ (1) | CRUDA (31) |
| config | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | READ (1) | — | — |

#### reservations Module

| Resource | SUPER_ADMIN | OWNER | COMPANY_ADMIN | ADMIN | ACCOUNTANT | CASHIER |
|----------|-------------|-------|---------------|-------|------------|---------|
| bookings | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDA (31) | — | READ (1) |
| tables | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | READ (1) | — | — |

### Resource Category Permission Patterns

| Category | SUPER_ADMIN | OWNER | COMPANY_ADMIN | ADMIN | ACCOUNTANT | CASHIER |
|----------|-------------|-------|---------------|-------|------------|---------|
| Operational | CRUDAM | CRUDAM | CRUD | CRUDA | CRUD (journals only) | CRUDA (transactions only) |
| Structural | CRUDAM | CRUDAM | MANAGE | READ | READ | — |
| Analytical | CRUDAM | CRUDAM | CRUDA | READ | ANALYZE | — |

**Note on ACCOUNTANT permissions:** ACCOUNTANT has READ access to most operational resources (to view data), but full CRUD only on accounting.journals (their primary work area). The "CRUD (journals only)" in the category table refers to write permissions, not read permissions.

## Database Schema Changes

The `module_roles` table must be extended to support resource-level permission scoping.

### Schema Migration

```sql
-- Add resource column to module_roles table
ALTER TABLE module_roles ADD COLUMN resource VARCHAR(64) NULL AFTER module;

-- Update unique constraint to include resource
-- Drop existing unique key first (MySQL requires explicit drop)
ALTER TABLE module_roles DROP INDEX uq_module_role;

-- Create new unique key with resource column
-- NULL resource means module-level permission (backward compatible)
ALTER TABLE module_roles ADD UNIQUE INDEX uq_module_role (company_id, role_id, module, resource);

-- Add index on resource column for lookup performance
ALTER TABLE module_roles ADD INDEX idx_resource (resource);
```

### Schema Design Notes

| Aspect | Design Decision |
|--------|-----------------|
| `resource` column | Nullable — NULL indicates module-level permission (backward compatible) |
| Unique key | `(company_id, role_id, module, resource)` — ensures no duplicate module+resource per role |
| Index on `resource` | Enables fast lookup when checking permissions for a specific resource |
| Default behavior | Existing module-level permissions remain valid with `resource = NULL` |
| Upgrade path | Existing data migration sets `resource = NULL` for current entries |

### Permission Format

| Format | Example | Description |
|--------|---------|-------------|
| Module-level | `module: "pos", resource: NULL` | Applies to all resources in module |
| Resource-level | `module: "pos", resource: "transactions"` | Applies to specific resource only |

### Mask Reference

| Mask | Value | Binary | Permissions |
|------|-------|--------|-------------|
| READ | 1 | `0b000001` | View data |
| CREATE | 2 | `0b000010` | Create records |
| UPDATE | 4 | `0b000100` | Modify records |
| DELETE | 8 | `0b001000` | Remove records |
| ANALYZE | 16 | `0b010000` | Reports, dashboards, analytics |
| MANAGE | 32 | `0b100000` | Setup, configuration |
| CRUD | 15 | `0b001111` | READ + CREATE + UPDATE + DELETE |
| CRUDA | 31 | `0b011111` | CRUD + ANALYZE |
| CRUDAM | 63 | `0b111111` | CRUDA + MANAGE |

## Stories

### Foundation Phase
- [Story 39.1](story-39.1.md): Phase 1A — Shared Package Foundation
  - Add RESOURCE_CODES constants
  - Update ModuleSchema for resource column
  - Update permission bit constants (REPORT → ANALYZE)
  - Keep backward compatibility

- [Story 39.2](story-39.2.md): Phase 1B — Auth Package Updates  
  - Update permission types (report → analyze)
  - Update canReport → canAnalyze
  - Add resource parameter support

- [Story 39.3](story-39.3.md): Phase 1C — Database Schema Migration
  - Add resource column to module_roles
  - Update unique constraints
  - Add indexes
  - Migration rollback plan

- [Story 39.3.5](story-39.3.5.md): Phase 1D — Data Migration — Convert Existing Module Roles
  - Migrate old module codes to new module codes with resources
  - Map: users→platform.users, roles→platform.roles, etc.
  - Dual-write strategy for backward compatibility
  - Delete reports module entries

### Module Implementation Phase (Incremental)

- [Story 39.4](story-39.4.md): Phase 2A — platform Module
  - Migrate platform routes to resource-level
  - Update permission matrix for platform resources
  - Tests for platform resources

- [Story 39.5](story-39.5.md): Phase 2B — accounting Module
  - Migrate accounting routes to resource-level
  - Update permission matrix for accounting resources
  - Tests for accounting resources

- [Story 39.6](story-39.6.md): Phase 2C — inventory Module
  - Migrate inventory routes to resource-level
  - Update permission matrix for inventory resources
  - Tests for inventory resources

- [Story 39.7](story-39.7.md): Phase 2D — treasury Module
  - Migrate treasury routes to resource-level
  - Update permission matrix for treasury resources
  - Tests for treasury resources

- [Story 39.8](story-39.8.md): Phase 2E — sales Module
  - Migrate sales routes to resource-level
  - Update permission matrix for sales resources
  - Tests for sales resources

- [Story 39.9](story-39.9.md): Phase 2F — pos Module
  - Migrate pos routes to resource-level
  - Update permission matrix for pos resources
  - Tests for pos resources

- [Story 39.10](story-39.10.md): Phase 2G — reservations Module
  - Migrate reservations routes to resource-level
  - Update permission matrix for reservations resources
  - Tests for reservations resources

### Final Phase

- [Story 39.11](story-39.11.md): Phase 3 — Verification & Cleanup
  - Run all tests
  - Verify no reports module references
  - Verify resource-level permissions work
  - Documentation update

## Definition of Done

- [ ] Shared package exports single canonical `MODULE_CODES` with 7 modules
- [ ] `REPORT` renamed to `ANALYZE` in all permission constants
- [ ] No references to `reports` module in code
- [ ] Resource-level permission matrix documented for all resources across 7 modules
- [ ] Database schema updated with `resource` column in `module_roles` table
- [ ] All routes updated to use resource-level permission checks
- [ ] Database migration removes reports data and adds ANALYZE grants
- [ ] All tests pass
- [ ] TypeScript typecheck passes on all packages

## Implementation Phases

### Phase 1A: Shared Package Foundation

**Files to modify:**
- `packages/shared/src/constants/rbac.ts` — Rename `REPORT` → `ANALYZE`
- `packages/shared/src/constants/modules.ts` — Consolidate to single `MODULE_CODES`
- `packages/shared/src/schemas/modules.ts` — Update MODULE_CODES array, remove `reports`
- `packages/shared/src/schemas/module-roles.ts` — Update ModuleSchema to include `resource` column

**Key Changes:**
- Add `RESOURCE_CODES` constants for all resources across 7 modules
- Update ModuleSchema to include `resource` column (nullable, for backward compatibility)
- Keep `REPORT → ANALYZE` rename for permission bit constants

**Dependencies:** None (foundation)

**Build verification:**
```bash
npm run build -w @jurnapod/shared
npm run typecheck -w @jurnapod/shared
```

### Phase 1B: Auth Package Updates

**Files to modify:**
- `packages/auth/src/types.ts` — Change `report` to `analyze`
- `packages/auth/src/rbac/permissions.ts` — Change `canReport` to `canAnalyze`

**Key Changes:**
- Update permission types (report → analyze)
- Add resource parameter support to permission checking functions
- Maintain backward compatibility for module-level checks

**Dependencies:** Phase 1A complete

**Build verification:**
```bash
npm run build -w @jurnapod/auth
npm run typecheck -w @jurnapod/auth
```

### Phase 1C: Database Schema Migration

**File to create:**
- `packages/db/migrations/0147_acl_reorganization.sql`

**Migration operations:**
```sql
-- Add resource column to module_roles table
ALTER TABLE module_roles ADD COLUMN resource VARCHAR(64) NULL AFTER module;

-- Update unique constraint to include resource
ALTER TABLE module_roles DROP INDEX uq_module_role;
ALTER TABLE module_roles ADD UNIQUE INDEX uq_module_role (company_id, role_id, module, resource);

-- Add index on resource column for lookup performance
ALTER TABLE module_roles ADD INDEX idx_resource (resource);
```

**Schema Design Notes:**
| Aspect | Design Decision |
|--------|-----------------|
| `resource` column | Nullable — NULL indicates module-level permission (backward compatible) |
| Unique key | `(company_id, role_id, module, resource)` — ensures no duplicate module+resource per role |
| Index on `resource` | Enables fast lookup when checking permissions for a specific resource |
| Default behavior | Existing module-level permissions remain valid with `resource = NULL` |

**Dependencies:** Phase 1B complete

**Verification:**
```bash
npm run db:migrate -w @jurnapod/db
npm run db:smoke -w @jurnapod/db
```

### Phase 2A-2G: Module-by-Module Implementation (Incremental)

Each module follows the same implementation pattern in order: **platform → accounting → inventory → treasury → sales → pos → reservations**

**Per-Module Tasks:**
1. Update routes to use resource-level permission checks (`module.resource` format)
2. Update permission matrix for module resources
3. Write/update tests for resource-level permissions
4. Build verification

**Module Order & Dependencies:**

| Phase | Module | Depends On |
|-------|--------|------------|
| 2A | platform | 1C |
| 2B | accounting | 2A |
| 2C | inventory | 2B |
| 2D | treasury | 2C |
| 2E | sales | 2D |
| 2F | pos | 2E |
| 2G | reservations | 2F |

**Phase 2A: platform Module**
- Files: `packages/modules/platform/src/*/constants/permission-matrix.ts`
- Resources: `users`, `roles`, `companies`, `outlets`, `settings`

**Phase 2B: accounting Module**
- Files: `packages/modules/accounting/src/*/constants/permission-matrix.ts`
- Resources: `journals`, `accounts`, `fiscal_years`, `reports`

**Phase 2C: inventory Module**
- Files: `packages/modules/inventory/src/*/constants/permission-matrix.ts`
- Resources: `items`, `stock`, `costing`

**Phase 2D: treasury Module**
- Files: `packages/modules/treasury/src/*/constants/permission-matrix.ts`
- Resources: `transactions`, `accounts`

**Phase 2E: sales Module**
- Files: `packages/modules/sales/src/*/constants/permission-matrix.ts`
- Resources: `invoices`, `orders`, `payments`

**Phase 2F: pos Module**
- Files: `packages/modules/pos/src/*/constants/permission-matrix.ts`
- Resources: `transactions`, `config`

**Phase 2G: reservations Module**
- Files: `packages/modules/reservations/src/*/constants/permission-matrix.ts`
- Resources: `bookings`, `tables`

### Phase 3: Verification & Cleanup

**Tasks:**
- Run all unit tests across packages
- Run integration tests
- Verify database state
- Verify no `reports` module references remain
- Verify resource-level permissions work correctly
- Documentation update

**Dependencies:** All Phase 2 modules complete

## Canonical Module List (Post-Change)

```
platform, pos, sales, inventory, accounting, treasury, reservations
```

| Module | Description | Reports Access |
|--------|-------------|----------------|
| `platform` | Core platform services | Via platform.ANALYZE |
| `pos` | Point of sale | Via pos.ANALYZE |
| `sales` | Sales invoices | Via sales.ANALYZE |
| `inventory` | Stock movements and recipes | Via inventory.ANALYZE |
| `accounting` | General ledger and posting | Via accounting.ANALYZE |
| `treasury` | Cash and bank management | Via treasury.ANALYZE |
| `reservations` | Table and booking reservations | Via reservations.ANALYZE |

## Permission Matrix Summary

| Role | platform | pos | sales | inventory | accounting | treasury | reservations |
|------|----------|-----|-------|-----------|------------|----------|--------------|
| SUPER_ADMIN | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) |
| OWNER | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) |
| COMPANY_ADMIN | CRUDA (31) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) |
| ADMIN | READ (1) | CRUDA (31) | CRUDA (31) | CRUDA (31) | CRUDA (31) | CRUDA (31) | CRUDA (31) |
| ACCOUNTANT | READ (1) | READ (1) | READ (1) | READ (1) | CRUDA (31) | READ (1) | — |
| CASHIER | — | CRUDA (31) | — | — | — | — | READ (1) |

**Mask reference:** READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32
- CRUD = 15 (READ+CREATE+UPDATE+DELETE)
- CRUDA = 31 (CRUD + ANALYZE)
- CRUDAM = 63 (CRUDA + MANAGE)

## Dependencies

| Phase | Depends On | Blocked By |
|-------|------------|------------|
| 1A (Shared) | None | None |
| 1B (Auth) | 1A | None |
| 1C (Database) | 1B | None |
| **1D (Data Migration)** | **1C** | **None** |
| 2A (platform) | **1D** | None |
| 2B (accounting) | 2A | None |
| 2C (inventory) | 2B | None |
| 2D (treasury) | 2C | None |
| 2E (sales) | 2D | None |
| 2F (pos) | 2E | None |
| 2G (reservations) | 2F | None |
| 3 (Verification) | All | None |

## Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Permission rename breaks existing sessions | High | Medium | Version gate — new code with migration must be deployed atomically |
| Reports access lost during transition | High | Low | Pre-migration: ensure ANALYZE grants cover all existing reports access |
| ModuleRoles table has stale entries | Medium | Medium | Step 14 cleanup handles orphaned entries |
| Consumers not updated before migration | Medium | Medium | Feature flag to delay migration until all consumers updated |
| Database migration not idempotent | Medium | Low | Migration designed with idempotent DELETE/INSERT patterns |

## Rollback Plan

**Important:** This migration involves data deletion which is not directly reversible. Rollback requires Point-in-Time Recovery (PITR) from database backups.

1. Stop all application traffic
2. Restore from PITR backup taken before migration
3. Redeploy application with pre-migration code

**Alternative compensating SQL** (partial recovery):
```sql
-- Restore reports module
INSERT INTO modules (code, name, description) 
VALUES ('reports', 'Reports', 'Reporting and analytics')
ON DUPLICATE KEY UPDATE name = VALUES(name);
```

## Related Documents

- [Implementation Specification](../acl-reorganization/implementation-spec.md) — Detailed file-by-file changes, SQL migration, testing strategy

## Technical Notes

### Why ANALYZE instead of REPORT?

- `REPORT` was named after a module, not an action
- `ANALYZE` better describes the action: analyzing data, generating insights, exporting reports
- Reports are accessed via the source module's ANALYZE permission (e.g., sales.ANALYZE for sales reports)

### Why inventory_costing is not an ACL module

- `inventory_costing` is an internal calculation package
- It doesn't have independent ACL requirements
- Cost calculations are part of inventory module functionality

### Mask Calculations

```
Bit 5 (32): MANAGE
Bit 4 (16): ANALYZE
Mask 63 (0b111111): CRUDAM — Full permissions
Mask 31 (0b011111): CRUDA — CRUD + Analyze
Mask 15 (0b001111): CRUD — Read + Create + Update + Delete
Mask 17 (0b010001): READ + ANALYZE
```
