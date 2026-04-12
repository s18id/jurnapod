# Epic 39 ACL Reorganization - Test Failures Reference

## Executive Summary

Epic 39 ACL reorganization has been implemented but 182 tests (20%) are failing due to permission issues. This document catalogs all failures for systematic remediation.

**Last Updated**: 2026-04-12
**Total Tests**: 932
**Failed**: 182 (20%)
**Passed**: 747 (80%)

---

## Root Causes Identified

### 1. Missing Permissions in Database
- Routes request resource-level permissions (`resource: "items"`)
- Database has module-level entries (`resource=NULL`) from old migrations
- Migration 0148 attempted to fix but created entries with wrong bit values

### 2. Permission Bit Mismatch
| System | Read | Create | Update | Delete | Analyze | Manage |
|--------|------|--------|--------|--------|---------|--------|
| Old (Pre-Epic 39) | 2 | 1 | 4 | 8 | - | - |
| Epic 39 Canonical | 1 | 2 | 4 | 8 | 16 | 32 |

### 3. Security Bypasses (P0)
- OWNER role can create companies (should require SUPER_ADMIN)
- Users can list users without proper permission
- Permission checks return 200 instead of 403

### 4. Validation Order Issues
- Admin dashboard routes do validation BEFORE auth check
- Returns 403 instead of 400 for invalid input

---

## Test Failures by Severity

### 🔴 P0 - Critical Security Issues

| Test File | Test Case | Expected | Got | Issue | Status |
|-----------|-----------|----------|-----|-------|--------|
| companies/create.test.ts | requires SUPER_ADMIN | 403 | 201 | OWNER can create companies | ✅ FIXED |
| users/list.test.ts | returns 403 without permission | 403 | 200 | Test was using OWNER (has permission); fixed to use CASHIER | ✅ FIXED |
| users/tenant-scope.test.ts | returns 403 for users list | 403 | 200 | Test was using OWNER (has permission); fixed to use CASHIER | ✅ FIXED |
| users/roles.test.ts | returns 403 without update permission | 403 | 400 | Test was using OWNER (has permission); fixed to use CASHIER | ✅ FIXED |

### 🟠 P1 - Missing Permissions (403 When Should Allow)

#### Reports Module (All Need accounting.analyze)
| Test File | Failed | Resource | Permission Needed |
|-----------|--------|----------|-------------------|
| reports/profit-loss.test.ts | 4/5 | accounting.reports | ANALYZE |
| reports/pos-transactions.test.ts | 6/7 | pos.transactions | ANALYZE |
| reports/general-ledger.test.ts | 6/7 | accounting.reports | ANALYZE |
| reports/journals.test.ts | 5/6 | accounting.reports | ANALYZE |
| reports/trial-balance.test.ts | 5/6 | accounting.reports | ANALYZE |
| reports/daily-sales.test.ts | 5/6 | accounting.reports | ANALYZE |
| reports/worksheet.test.ts | 4/5 | accounting.reports | ANALYZE |
| reports/pos-payments.test.ts | 4/5 | pos.transactions | ANALYZE |

#### Inventory Module
| Test File | Failed | Resource | Permission |
|-----------|--------|----------|------------|
| recipes/ingredients-create.test.ts | 8/12 | inventory.items | CREATE |
| recipes/ingredients-update.test.ts | 6/7 | inventory.items | UPDATE |
| recipes/ingredients-delete.test.ts | 4/5 | inventory.items | DELETE |
| recipes/ingredients-list.test.ts | 5/6 | inventory.items | READ |
| recipes/cost.test.ts | 6/7 | inventory.items | READ |
| supplies/list.test.ts | 6/7 | inventory.items | READ |
| supplies/create.test.ts | 6/7 | inventory.items | CREATE |
| supplies/update.test.ts | 7/8 | inventory.items | UPDATE |
| supplies/delete.test.ts | 4/5 | inventory.items | DELETE |
| supplies/get-by-id.test.ts | 4/5 | inventory.items | READ |
| items/variant-stats.test.ts | 5/7 | inventory.items | READ |

#### Settings Module
| Test File | Failed | Resource | Permission |
|-----------|--------|----------|------------|
| settings/config-get.test.ts | 9/11 | platform.settings | READ |
| settings/config-update.test.ts | 17/19 | platform.settings | UPDATE |

#### Tax Rates Module
| Test File | Failed | Resource | Permission |
|-----------|--------|----------|------------|
| tax-rates/list.test.ts | 2/5 | platform.settings | READ |
| tax-rates/get-defaults.test.ts | 1/3 | platform.settings | READ |
| tax-rates/create.test.ts | 8/9 | platform.settings | CREATE |
| tax-rates/update.test.ts | 2/7 | platform.settings | UPDATE |
| tax-rates/delete.test.ts | 2/5 | platform.settings | DELETE |
| tax-rates/update-tax-defaults.test.ts | 4/7 | platform.settings | UPDATE |

#### Audit Module
| Test File | Failed | Resource | Permission |
|-----------|--------|----------|------------|
| audit/list.test.ts | 20/22 | accounting.reports | ANALYZE |

### 🟡 P2 - Validation Order Issues

| Test File | Failed | Issue |
|-----------|--------|-------|
| admin-dashboards/trial-balance.test.ts | 5/14 | Validation before auth |
| admin-dashboards/reconciliation.test.ts | 3/13 | Validation before auth |
| admin-dashboards/period-close.test.ts | 5/9 | Validation before auth |

---

## Database State Summary

### Permissions Per Role (After All Migrations)

| Role | Total Entries | Status |
|------|---------------|--------|
| SUPER_ADMIN | 21 | ✅ Correct |
| OWNER | 2,940 | ⚠️ Multiple companies |
| COMPANY_ADMIN | 3,813 | ⚠️ May have wrong bits |
| ADMIN | 104 | ⚠️ Low count |
| CASHIER | 1,839 | ⚠️ May have wrong bits |
| ACCOUNTANT | 1,638 | ⚠️ May have wrong bits |

### Module-Level vs Resource-Level

| Module | NULL Resource | Resource-Level | Status |
|--------|---------------|----------------|--------|
| platform | 4 duplicates | ✅ Complete | Needs cleanup |
| inventory | 4 duplicates | ✅ Complete | Needs cleanup |
| sales | 0 | ✅ Complete | Good |
| pos | 0 | ✅ Complete | Good |
| accounting | 0 | ✅ Complete | Good |
| settings | 48 duplicates | ✅ Complete | Needs cleanup |

---

## Files Modified in Epic 39

### Migrations
- `0147_acl_reorganization.sql` - Schema changes
- `0147.5_acl_data_migration.sql` - Initial data migration
- `0148_acl_complete_resource_migration.sql` - Resource-level entries
- `0149_fix_owner_permissions.sql` - OWNER role fix
- `0150_acl_permission_standardization.sql` - Standardize permissions
- `0151_acl_cleanup_conflicts.sql` - Cleanup conflicts
- `0152_acl_deduplicate_permissions.sql` - Deduplication

### Code Changes
- `packages/auth/src/types.ts` - Added resource parameter
- `packages/auth/src/rbac/access-check.ts` - Resource-level ACL logic
- `packages/auth/src/rbac/permissions.ts` - Updated to analyze
- `apps/api/src/lib/auth-guard.ts` - Added resource to AccessGuardOptions
- `apps/api/src/lib/auth.ts` - Pass resource parameter

### Permission Matrix
- `packages/modules/platform/src/companies/constants/permission-matrix.ts` - Canonical values

---

## Remediation Plan

### Phase 1: Fix P0 Security Issues ✅ COMPLETED
1. [x] Fix companies.create to require SUPER_ADMIN - OWNER platform.companies = READ+UPDATE (5)
2. [x] Fix users.list to properly check permissions - Test now uses CASHIER
3. [x] Fix users.tenant-scope permission check - Test now uses CASHIER
4. [x] Fix users.roles permission check - Test now uses CASHIER

### Phase 2: Fix Missing Permissions ✅ COMPLETED
1. [x] COMPANY_ADMIN full CRUDAM on non-platform modules (migration 0154)
2. [x] Consolidate permission matrices to single JSON source (roles.defaults.json)

### Phase 3: Fix Validation Order
1. [ ] Move auth check before validation in admin-dashboards

### Phase 4: Cleanup
1. [ ] Remove duplicate NULL resource entries
2. [ ] Verify all permission bits are canonical

---

## Infrastructure Updates

### Single Source of Truth for Permissions
- **Canonical file**: `packages/modules/platform/src/companies/constants/roles.defaults.json`
- **Consumers**:
  - `permission-matrix.ts` - TypeScript re-export with types
  - `apps/api/src/lib/companies.ts` - Imports MODULE_ROLE_DEFAULTS_API
  - `packages/db/scripts/seed.mjs` - Runtime import for seeding

---

## Test Commands

```bash
# Run all tests
npm test -w @jurnapod/api

# Run specific failing test
npm run test:single -w @jurnapod/api __test__/integration/companies/create.test.ts

# Run with debug
npm run test:debug -w @jurnapod/api __test__/integration/reports/profit-loss.test.ts
```

## Related Documentation

- Epic 39 Specification: `_bmad-output/implementation-artifacts/stories/epic-39/epic-39.md`
- Permission Matrix: `packages/modules/platform/src/companies/constants/permission-matrix.ts`
- ACL Architecture: `packages/auth/AGENTS.md`

---

*Generated: 2026-04-12*
*Status: In Progress - 182 tests failing*