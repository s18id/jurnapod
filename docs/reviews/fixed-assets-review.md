# Fixed Assets Review Findings

## Status: FIXED (All issues resolved)

All P1 and P2 issues have been resolved. See the implementation details below each issue.

## P1 Issues

### 1. PATCH /accounts/fixed-assets/:id unintentionally nulls omitted fields

**Location:** `apps/api/app/api/accounts/fixed-assets/[assetId]/route.ts:53-60`

**Problem:** Handler maps missing optional fields with `?? null`:
```typescript
outlet_id: input.outlet_id ?? null,
category_id: input.category_id ?? null,
```

When Zod parses optional fields, they're `undefined`, not omitted. Then `updateFixedAsset` uses `Object.hasOwn` to detect "presence" - but `?? null` creates a key with value `null`, making the field appear "present" even when user didn't provide it.

**Impact:** Partial updates silently clear `outlet_id`, `category_id`, `asset_tag`, `serial_number`, `purchase_date`, `purchase_cost`.

**Fix:** 
- Updated `FixedAssetUpdateRequestSchema` in `packages/shared/src/schemas/master-data.ts` to use `.nullable().optional()` for nullable fields
- Updated PATCH handler to use `Object.hasOwn` to only include fields actually provided in the update

**Files changed:**
- `packages/shared/src/schemas/master-data.ts`
- `apps/api/app/api/accounts/fixed-assets/[assetId]/route.ts`

---

### 2. Depreciation plan account IDs not company-scoped validated

**Location:** `apps/api/src/lib/depreciation.ts:441-467` (create), `:520-563` (update)

**Problem:**
```typescript
const [result] = await connection.execute<ResultSetHeader>(
  `INSERT INTO asset_depreciation_plans (
     expense_account_id, accum_depr_account_id, ...
   ) VALUES (?, ?, ...)`,
  [input.expense_account_id, input.accum_depr_account_id, ...]
);
```

FK constraint is `FOREIGN KEY (expense_account_id) REFERENCES accounts(id)` - only validates existence, not `company_id` ownership. Plans can reference another company's account IDs.

**Impact:** 
- Tenant isolation violation (data leak)
- Depreciation journal entries post to wrong ledger accounts
- Financial reports become unreliable

**Fix:** Added `ensureCompanyAccountExists` validation in both create and update paths.

**Files changed:**
- `apps/api/src/lib/depreciation.ts`

---

### 3. Outlet access not enforced for reads

**Location:** 
- `apps/api/app/api/accounts/fixed-assets/route.ts:50`
- `apps/api/app/api/accounts/fixed-assets/[assetId]/route.ts:26`
- `apps/api/app/api/accounts/fixed-assets/[assetId]/depreciation-plan/route.ts:32`

**Problem:** All GET endpoints only enforce `company_id` scoping, not outlet-level access. Users limited to specific outlets can read assets/plans from other outlets in the same company.

**Fix:** 
- Added outlet access checks using `checkUserAccess` for single asset GET
- Added list filtering using `allowedOutletIds` for asset list GET
- Added outlet access check for depreciation plan GET
- Updated `listFixedAssets` to support `allowedOutletIds` filter

**Files changed:**
- `apps/api/app/api/accounts/fixed-assets/route.ts`
- `apps/api/app/api/accounts/fixed-assets/[assetId]/route.ts`
- `apps/api/app/api/accounts/fixed-assets/[assetId]/depreciation-plan/route.ts`
- `apps/api/src/lib/master-data.ts`

---

## P2 Issues

### 4. Migration 0022 not idempotent/rerunnable

**Location:** `packages/db/migrations/0022_fixed_asset_categories.sql:25-28`

**Problem:**
```sql
ALTER TABLE fixed_assets
  ADD COLUMN category_id BIGINT UNSIGNED DEFAULT NULL,
  ADD KEY idx_fixed_assets_company_category (company_id, category_id),
  ADD CONSTRAINT fk_fixed_assets_category FOREIGN KEY ...;
```

Unconditional DDL fails on rerun (column already exists, key already exists, etc.).

**Fix:** Rewrote migration with `information_schema` guarded dynamic SQL using PREPARE/EXECUTE pattern.

**Files changed:**
- `packages/db/migrations/0022_fixed_asset_categories.sql`

---

## Tests Added

Added 3 new integration tests in `apps/api/tests/integration/fixed-asset-categories.integration.test.mjs`:

1. **PATCH preserves omitted fields** - Verifies partial updates don't clear existing fields
2. **Depreciation plan rejects cross-company accounts** - Verifies account ownership validation
3. **Outlet-scoped user cannot read other outlet assets** - Verifies outlet access enforcement on reads + unassigned assets visibility

---

## Post-Review Fixes (Scope 1-5)

Additional issues found during implementation review were fixed:

### Scope 1: Fix broken SQL bindings in integration test
**Problem:** Missing parameter bindings in account lookup queries caused SQL execution failures.
**Fix:** Rewrote test to create deterministic same-company accounts directly.

### Scope 2: Make cross-company test schema-safe
**Problem:** Test used deprecated `account_type` column (should use `account_type_id`) and hardcoded account codes that could collide.
**Fix:** Use run-scoped unique company code, unique account codes, and valid schema columns only.

### Scope 3: Prevent destructive cleanup of shared fixtures
**Problem:** Test would delete pre-existing `TESTCO` company if it existed.
**Fix:** Always create unique foreign company per test run, always delete only created rows.

### Scope 4: Fail-closed outlet filtering for empty outlet sets
**Problem:** Empty `allowedOutletIds` array was treated as "no filter" (returns all assets).
**Fix:** Changed logic: if `allowedOutletIds` is defined (even empty), only return `outlet_id IS NULL` assets.

### Scope 5: Regression test coverage alignment
**Problem:** Test didn't verify unassigned (NULL outlet_id) assets are visible to outlet-scoped users.
**Fix:** Added assertion that unassigned assets appear in list for restricted users.
