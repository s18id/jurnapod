# Epic 9: Use Library Functions in Tests

**Goal:** Refactor API unit tests to use existing library functions instead of direct database queries. Tests should call production library functions (e.g., `createCompany()`, `createItem()`) rather than raw SQL.

**Theme:** Developer experience - leverage existing code, reduce duplication

**Business Value:**
- Tests use same code paths as production
- Schema changes reflected automatically in tests
- Better integration testing - validates library functions actually work
- Reduced test code duplication

**Success Metrics:**
- Direct SQL in tests: reduced by >80% (183 → ~36)
- Tests using library functions: >80% coverage
- All refactored tests pass

---

## Problem Statement

Current API tests have **183 instances** of direct `pool.execute()` with raw SQL across 67 test files. Meanwhile, production libraries often have the same operations.

### Current Pattern (Anti-pattern)
```typescript
// DON'T: Direct SQL in tests
const [result] = await pool.execute<ResultSetHeader>(
  `INSERT INTO items (company_id, name, item_type, track_stock, is_active) 
   VALUES (?, ?, 'PRODUCT', 1, 1)`,
  [TEST_COMPANY_ID, `Test Item ${runId}`]
);
```

### Desired Pattern
```typescript
// DO: Use existing library functions
import { createItem } from "@/lib/items";

const item = await createItem({
  companyId: TEST_COMPANY_ID,
  name: `Test Item ${runId}`,
  itemType: "PRODUCT",
  trackStock: true
});
```

---

## Audit: Available Library Functions

First, audit existing library functions that can replace direct SQL:

| Entity | Library Function | Location | Coverage |
|--------|----------------|----------|----------|
| Company | `createCompany()` | `lib/companies.ts` | Full |
| Item | `createItem()` | `lib/items.ts` | Partial |
| Outlet | `createOutlet()` | `lib/outlets.ts` | Unknown |
| Item Price | `createItemPrice()` | `lib/item-prices/index.ts` | Full |
| Item Variant | `createVariant()` | `lib/item-variants.ts` | Partial |
| User | `createUser()` | `lib/users.ts` | Partial |
| Import Session | `createImportSession()` | `lib/import/session-store.ts` | Full |
| Progress | `createProgress()` | `lib/progress/progress-store.ts` | Full |

---

## Phase 1: Core Library Function Adoption (Sprint 1)

---

## Story 9.1: Audit Library Functions for Test Use

**Context:**
Audit all library functions to determine which can be used in tests, which need modification, and which are missing.

**Acceptance Criteria:**
1. Complete audit of `lib/` directory functions
2. Document which functions are test-friendly (idempotent, have good defaults)
3. Identify gaps where no library function exists
4. Create `testing/library-usage-guide.md` with findings

**Estimated Effort:** 0.5 days
**Priority:** P0

---

## Story 9.2: Refactor Company & Item Tests

**Context:**
Refactor tests that create companies and items to use library functions.

**Acceptance Criteria:**
1. `lib/companies.ts` - `createCompany()` used in all company-related tests
2. `lib/items.ts` - `createItem()` used in item tests
3. Delete any inline `createTestCompany()` or `createTestItem()` helper functions
4. Tests pass after refactoring

**Files to Refactor:**
- `lib/cogs-posting.test.ts` (has `createTestItem`)
- `lib/cost-auditability.test.ts` (has `createTestItem`)
- `lib/cost-tracking.db.test.ts` (has `createTestItem`)
- `lib/item-variants.test.ts`

**Estimated Effort:** 1 day
**Priority:** P0
**Dependencies:** Story 9.1

---

## Story 9.3: Refactor Import & Progress Tests

**Context:**
Refactor import session and progress tracking tests to use library functions.

**Acceptance Criteria:**
1. `lib/import/session-store.ts` - `createImportSession()` used
2. `lib/progress/progress-store.ts` - `createProgress()` used
3. Tests pass after refactoring

**Files to Refactor:**
- `lib/import/checkpoint-resume.test.ts`
- `lib/import/batch-recovery.test.ts`
- `lib/progress/progress-store.test.ts`

**Estimated Effort:** 1 day
**Priority:** P1
**Dependencies:** Story 9.1

---

## Story 9.4: Refactor Variant Sync Tests

**Context:**
Refactor variant price and stock tests to use library functions.

**Acceptance Criteria:**
1. `lib/pricing/variant-price-resolver.ts` - price functions used
2. `lib/inventory/variant-stock.ts` - stock functions used
3. Tests pass after refactoring

**Files to Refactor:**
- `lib/pricing/variant-price-resolver.test.ts`
- `lib/inventory/variant-stock.test.ts`
- `routes/sync/push-variant.test.ts`

**Estimated Effort:** 1 day
**Priority:** P1
**Dependencies:** Story 9.2

---

## Phase 2: Extended Coverage (Sprint 2)

---

## Story 9.5: Refactor User & Auth Tests

**Context:**
Refactor user management and authentication tests.

**Acceptance Criteria:**
1. `lib/users.ts` - `createUser()` used where possible
2. `lib/auth.ts` functions used
3. Tests pass after refactoring

**Files to Refactor:**
- `lib/auth.test.ts`
- `routes/users.test.ts`
- `routes/auth.test.ts`

**Estimated Effort:** 1 day
**Priority:** P1

---

## Story 9.6: Refactor Route Tests

**Context:**
Refactor HTTP route tests to use library functions for setup.

**Acceptance Criteria:**
1. Route tests use library functions for entity creation
2. Direct SQL only for read-only verification queries
3. Tests pass after refactoring

**Files to Refactor:**
- `routes/accounts.test.ts`
- `routes/inventory.test.ts`
- `routes/sales/*.test.ts`

**Estimated Effort:** 1.5 days
**Priority:** P2

---

## Story 9.7: Batch Refactor Remaining Tests

**Context:**
Refactor all remaining test files.

**Acceptance Criteria:**
1. All 67 test files assessed for library function usage
2. Direct SQL reduced to <36 instances (80% reduction)
3. All tests pass

**Estimated Effort:** 2 days
**Priority:** P1

---

## Story 9.8: Add Missing Library Functions

**Context:**
Create library functions where none exist but are needed for tests.

**Acceptance Criteria:**
1. Functions for commonly-tested entities where library is missing
2. Functions are added to appropriate `lib/` files
3. Functions are well-documented and have JSDoc

**Likely Additions:**
- `lib/outlets.ts` - add `createOutlet()` if missing
- `lib/items.ts` - add `deleteItem()` for cleanup
- `lib/sync.ts` - add sync helper functions

**Estimated Effort:** 1 day
**Priority:** P2
**Dependencies:** Story 9.7

---

## Story 9.9: Enforce Library Usage in Tests

**Context:**
Add linting rule and documentation to prevent regression.

**Acceptance Criteria:**
1. ESLint rule: prefer library functions over direct SQL in tests
2. Documentation: `testing/README.md` with library function guide
3. PR template updated with test guidelines

**Estimated Effort:** 0.5 days
**Priority:** P2

---

## Technical Approach

### Refactoring Pattern

**Before (direct SQL):**
```typescript
test("some item test", async () => {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO items (company_id, name, item_type, track_stock, is_active) 
     VALUES (?, ?, 'PRODUCT', 1, 1)`,
    [TEST_COMPANY_ID, `Test Item ${runId}`]
  );
  const itemId = Number(result.insertId);
  
  // ... test code ...
  
  await pool.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
});
```

**After (library function):**
```typescript
test("some item test", async () => {
  const item = await createItem({
    companyId: TEST_COMPANY_ID,
    name: `Test Item ${runId}`,
    itemType: "PRODUCT",
    trackStock: true
  });
  
  // ... test code ...
  
  // No manual cleanup needed - library handles it
});
```

### Library Function Requirements

For a library function to be test-friendly:
1. Returns created entity with ID
2. Has sensible defaults for optional fields
3. Cleanup handled by caller or function has `deleteEntity()` counterpart
4. Handles FK constraints properly

### When Direct SQL Is Allowed

1. Read-only verification queries (e.g., `SELECT` to verify state)
2. Complex joins not supported by library
3. Performance testing scenarios
4. Edge cases not covered by library

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Library functions have side effects | Use transactions in tests to isolate |
| Library changes break many tests | Library functions have tests too |
| Cleanup not handled | Ensure delete functions exist and are used |

---

## Out of Scope

- Creating new fixture utility files (use existing lib/)
- Mocking library functions (use real library)
- Changes to production code (except to add missing functions)
- E2E test migration (different pattern)

---

## Dependencies

**Epic 8 Stories Deferred to Epic 9:**
- Story 8.10: Load Testing Framework

These can run in parallel as they use different infrastructure.
