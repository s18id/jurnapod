# Epic 39 Permission Edge Cases Audit

**Date:** Mon Apr 13 2026  
**Source:** Retrospective action item: "Audit remaining permission edge cases"  
**Status:** ✅ FIXED — All P0/P1 issues resolved, findings documented

---

## Summary

Audit of ACL/permission implementation across the codebase. The core canonical constants (`PERMISSION_BITS`, `MODULE_PERMISSION_BITS`) are correct with `analyze` as the canonical permission name. Several backward-compatibility shims and test files still referenced the old `report`/`canReport` terminology.

**All P0/P1 issues have been fixed.** Unit tests pass.

---

## P0/P1 Issues (Broken Code / Incorrect Constants)

### P0-1: `MODULE_PERMISSION_BITS.report` phantom property (FINDING ONLY — NOT ACTUALLY BROKEN)

| Location | File:Line |
|----------|-----------|
| `@jurnapod/auth` | `packages/auth/src/types.ts:128-135` |

**Issue (pre-check):**  
`MODULE_PERMISSION_BITS` is typed as `Record<ModulePermission, number>` where `ModulePermission = "create" | "read" | "update" | "delete" | "analyze" | "manage"`. The property `MODULE_PERMISSION_BITS.report` does not exist in the type definition.

**Post-audit finding:** Upon deeper investigation, `MODULE_PERMISSION_BITS.report` does NOT actually exist at runtime — there is no `report` key. Test code was accessing it via JavaScript bracket notation (`MODULE_PERMISSION_BITS['report']`) which is allowed by TypeScript's type system but produces `undefined`. The tests were passing because `hasPermissionBit` returns `false` for any undefined bit, which coincidentally matched expectations.

**No code change needed** — This was already consistent (no phantom exists).

---

### P0-2: `client.ts` `buildPermissionMask` used old `canReport` with hardcoded wrong values ✅ FIXED

| Location | File:Line |
|----------|-----------|
| `@jurnapod/auth` | `packages/auth/src/lib/client.ts:139-161` |

**Issue:**  
The `rbac.buildPermissionMask` function (used by external consumers via `AuthClient`) accepted `canReport?: boolean` and used a local hardcoded `bits` object with `report: 16` — **not** `MODULE_PERMISSION_BITS`. It also didn't support `canAnalyze` or `canManage`.

**Fix applied:**
- Replaced `canReport?: boolean` with `canAnalyze?: boolean`
- Added `canManage?: boolean` for symmetry
- Now uses `MODULE_PERMISSION_BITS` directly instead of a local hardcoded object

**Verification:** `npm run typecheck -w @jurnapod/auth` passes

---

### P0-3: Test file used `report` as `ModulePermission` value ✅ FIXED

| Location | File:Line |
|----------|-----------|
| `@jurnapod/auth` | `packages/auth/__test__/unit/roles.test.ts:67,82,92,100,155,167,185,194,218` |

**Issue:**  
Multiple test assertions used `MODULE_PERMISSION_BITS.report`, `hasPermissionBit(mask, 'report')`, and `'report'` as a `ModulePermission` array value.

**Fix applied:** Replaced all `report` references with `analyze`:
- `MODULE_PERMISSION_BITS.report` → `MODULE_PERMISSION_BITS.analyze`
- `hasPermissionBit(mask, 'report')` → `hasPermissionBit(mask, 'analyze')`
- `'report'` in `ModulePermission[]` array → `'analyze'`
- Comments mentioning `REPORT=16` → `ANALYZE=16`

**Verification:** `npm run test:unit -w @jurnapod/auth` — all 19 tests pass

---

## P2/P3 Issues (Code Quality / Future Cleanup)

### P2-1: `reports` as a module code in `MODULE_DEFINITIONS`

| Location | File:Line |
|----------|-----------|
| `packages/modules/platform/src/companies/constants/module-definitions.ts` | Line 40-43 |
| `apps/api/src/lib/companies.ts` | Line 110-112 |

**Issue:**  
`MODULE_DEFINITIONS` includes `{ code: "reports", name: "Reports" }`. This is a **module code** (top-level like `platform`, `accounting`, `pos`), not a resource within a module. The Epic 39 canonical model defines 7 modules: `platform`, `pos`, `sales`, `inventory`, `accounting`, `treasury`, `reservations`. The `reports` module code doesn't align with this model — reports should be accessed via `accounting.reports` (ANALYZE permission on the `reports` resource within the accounting module).

**Risk:** Low risk since `COMPANY_MODULE_DEFAULTS` uses this and it's already deployed, but it creates conceptual confusion about the module hierarchy.

**Recommended Fix:**  
Mark as deprecated in comments and `COMPANY_MODULE_DEFAULTS`. In a future migration, remove the `reports` module code and ensure all report endpoints use `accounting.reports` with `permission: "analyze"`.

---

### P2-2: `reports` resource still referenced in multiple places

| Location | File:Line |
|----------|-----------|
| `apps/api/src/routes/reports.ts` | Line 574 |
| `apps/api/src/lib/report-context.ts` | Line 163 |
| `packages/shared/src/constants/resources.ts` | Line 21 |
| `apps/api/src/lib/companies.ts` | Line 110,137 |
| `packages/modules/platform/src/companies/constants/module-definitions.ts` | Line 40,72 |

**Issue:**  
The `reports` resource code (`ACCOUNTING_REPORTS: 'reports'`) is correctly defined in `resources.ts` and correctly used in the `requireAccess` call at `reports.ts:574`. However, it appears alongside the deprecated `reports` module code in several files, creating confusion about whether `reports` is a module or a resource.

**Recommended Fix:**  
This is correct usage — no change needed for `reports` as a resource. The issue is only the `reports` as a module code (see P2-1).

---

### P3-1: Comment style inconsistency

| Location | File:Line |
|----------|-----------|
| `packages/auth/src/validation/permission-validator.ts` | Line 205 |
| `packages/modules/platform/src/companies/constants/permission-matrix.ts` | Line 16 |
| `packages/shared/src/constants/rbac.ts` | Line 21 |
| `packages/db/src/kysely/schema.ts` | Line 211 |

**Issue:**  
The comment `// was REPORT` / `// (was REPORT)` appears in several places. This is fine as historical context but the comment in `permission-validator.ts:205` says `PERMISSION VALIDATION REPORT` which is about the report output format, not the permission bit — this is fine but potentially confusing.

**Recommended Fix:**  
No functional change needed. Consider standardizing the "(was REPORT)" comment format across all files for consistency if a future cleanup is planned.

---

## Verification Commands

```bash
# TypeScript check
cd /home/ahmad/jurnapod && npm run typecheck -w @jurnapod/auth

# Run unit tests
npm run test:unit -w @jurnapod/auth

# Build auth package
npm run build -w @jurnapod/auth
```

---

## Recommended Future Actions (P2/P3)

### P2-1: `reports` as a module code in `MODULE_DEFINITIONS`

| Location | File:Line |
|----------|-----------|
| `packages/modules/platform/src/companies/constants/module-definitions.ts` | Line 40-43 |
| `apps/api/src/lib/companies.ts` | Line 110-112 |

**Issue:**  
`MODULE_DEFINITIONS` includes `{ code: "reports", name: "Reports" }`. This is a **module code** (top-level like `platform`, `accounting`, `pos`), not a resource within a module. The Epic 39 canonical model defines 7 modules: `platform`, `pos`, `sales`, `inventory`, `accounting`, `treasury`, `reservations`. The `reports` module code doesn't align with this model — reports should be accessed via `accounting.reports` (ANALYZE permission on the `reports` resource within the accounting module).

**Risk:** Low risk since `COMPANY_MODULE_DEFAULTS` uses this and it's already deployed, but it creates conceptual confusion about the module hierarchy.

**Recommended Fix:**  
Mark as deprecated in comments and `COMPANY_MODULE_DEFAULTS`. In a future migration, remove the `reports` module code and ensure all report endpoints use `accounting.reports` with `permission: "analyze"`.

---

### P2-2: `reports` resource referenced alongside deprecated `reports` module code

| Location | File:Line |
|----------|-----------|
| `apps/api/src/routes/reports.ts` | Line 574 |
| `apps/api/src/lib/report-context.ts` | Line 163 |
| `packages/shared/src/constants/resources.ts` | Line 21 |
| `apps/api/src/lib/companies.ts` | Line 110,137 |
| `packages/modules/platform/src/companies/constants/module-definitions.ts` | Line 40,72 |

**Issue:**  
The `reports` resource code (`ACCOUNTING_REPORTS: 'reports'`) is correctly defined in `resources.ts` and correctly used in the `requireAccess` call at `reports.ts:574`. However, it appears alongside the deprecated `reports` module code in several files, creating confusion about whether `reports` is a module or a resource.

**Recommended Fix:**  
No change needed for `reports` as a resource — this is correct usage. The issue is only the `reports` as a module code (see P2-1).

---

### P3-1: Comment style inconsistency

| Location | File:Line |
|----------|-----------|
| `packages/auth/src/validation/permission-validator.ts` | Line 205 |
| `packages/modules/platform/src/companies/constants/permission-matrix.ts` | Line 16 |
| `packages/shared/src/constants/rbac.ts` | Line 21 |
| `packages/db/src/kysely/schema.ts` | Line 211 |

**Issue:**  
The comment `// was REPORT` / `// (was REPORT)` appears in several places. This is fine as historical context but the comment in `permission-validator.ts:205` says `PERMISSION VALIDATION REPORT` which is about the report output format, not the permission bit.

**Recommended Fix:**  
No functional change needed. Consider standardizing the "(was REPORT)" comment format across all files if a future cleanup is planned.

---

## Positive Findings (No Issues)

✅ **`requireAccess` usage is correct** — All `requireAccess` calls in routes use `module.resource` format with `permission: "analyze"` for report access  
✅ **`roles.defaults.json` is canonical** — All roles use `accounting.reports` with correct masks  
✅ **`PERMISSION_BITS` in `@jurnapod/shared`** — Correctly defines `ANALYZE: 16` with comment noting it was `REPORT`  
✅ **`PERMISSION_MASK` in `@jurnapod/shared`** — Correctly uses `ANALYZE` not `REPORT`  
✅ **`report-context.ts`** — Correctly uses `accounting.reports` and `permission: "analyze"`  
✅ **`auth-guard.ts`** — Correctly typed `ModulePermission` (no `report` in the union)  
✅ **No `REPORT` hardcoded permission checks** — No code does `permission === 'REPORT'` or similar  
✅ **All `reports.ts` routes use `permission: "analyze"`** — Correctly using canonical ANALYZE permission  
✅ **No routes use old module codes** — No "users", "roles" as module names (they're correctly used as resources)
