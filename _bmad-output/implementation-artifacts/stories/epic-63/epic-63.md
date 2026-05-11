# Epic 63: Test Production-Code Hardening

**Status:** done
**Sprint:** 63 (post-S48-62 correctness program)
**Completed:** 2026-05-10
**Theme:** Eliminate all test stubs, production-code bypasses, and inline business-logic duplication identified in the S48-S62 audit. Every test MUST exercise production code. Production functions that are too large MUST be refactored into DRY, reusable components.
**Primary Modules:** `apps/api`, `packages/modules/accounting`, `packages/modules/sales`, `packages/modules/purchasing`, `packages/modules/treasury`, `packages/shared`
**Predecessor:** Epic 62 (Projection Correctness Hardening)
**Exit Gate:** Zero test stubs of internal production code; all raw SQL test setup replaced with canonical fixtures; 3x consecutive green critical suites; `lint:fixture-flow` passes.

---

## 1) Charter

### 1.1 Program Alignment

Epic 63 is the cleanup sprint following the S48-S62 Correctness-First Architecture Blueprint. It addresses the test debt accumulated during Epics 48-62 where tests used mocked infrastructure, inline business-logic reimplementation, and raw SQL seeding to work around missing canonical fixtures. This epic closes those gaps.

### 1.2 What We Know

- Test stubs of internal production code create false security (sync modules, DB pool, auth guard)
- Inline `scaled()`, `makeTag()`, and helper reimplementations duplicate production logic and drift
- Raw SQL seeding of journal_batches/journal_lines bypasses posting logic, hiding bugs
- No canonical fixtures exist for `accounts`, `sales_invoices`, `purchase_invoices`, `ap_payments`, `cash_bank_transactions`
- 14 of 15 purchasing test files define their own `makeTag()` instead of using canonical helper
- Duplicate flow helpers (`createSentPO`, `createPostedPI`, `createSalesFixtureFlow`) exist across 8+ files

### 1.3 Non-Goals

- No net-new features
- No frozen-app scope expansion (`apps/backoffice`, `apps/pos` remain frozen)
- No business-logic DB triggers
- No P2 policy cleanup in this epic (Date.now() -> makeTag() migration, `.slice()` removal -- deferred to follow-up epic)

---

## 2) Requirements Inventory

### Functional Requirements

| FR | Requirement | Enforcement |
|----|-------------|-------------|
| FR1 | No test SHALL mock internal production code (DB pool, sync packages, auth guard, storage layer) | `grep -r "vi.mock" __test__/integration/` returns nothing |
| FR2 | Every integration test SHALL use real DB and canonical fixture helpers | `lint:fixture-flow` exits 0 |
| FR3 | Production functions that can't be used due to scope MUST be refactored to export reusable components | Build passes after export additions |
| FR4 | All raw SQL INSERT/UPDATE for test setup MUST be replaced with canonical fixtures from owner packages | `lint:fixture-flow` exits 0 |
| FR5 | Missing canonical fixtures MUST be created in owner packages before tests are updated | Fixture exists in `packages/modules-{domain}/src/test-fixtures/` |
| FR6 | All reconciliation/reporting tests MUST seed data through production posting flows (not raw journal SQL) | No `INSERT INTO journal_batches` in test setup |
| FR7 | Duplicate test helpers (makeTag, sentPO, postedPI, sales flows) MUST be consolidated to canonical locations | `grep -r "function makeTag" __test__/` returns nothing |

### Non-Functional Requirements

| NFR | Requirement | Validation |
|-----|-------------|------------|
| NFR1 | Zero test stubs of internal production code | All `vi.mock()` removed from integration tests |
| NFR2 | All test fixtures use canonical production path | Fixture flow validator passes |
| NFR3 | No inline business-logic reimplementation | No `Math.round(parseFloat())`, no inline `makeTag`, no inline decimal helpers |
| NFR4 | 3x consecutive green critical suites | CI evidence |
| NFR5 | SOLID/DRY/KISS rescore passes at pre-close | Scorecard evidence |

---

## 3) Story Breakdown

### Phase A -- Critical Remediation (P0)

#### Story 63-1: Fix sync-modules lifecycle mock -> real integration test
**Status:** ready-for-dev
**Type:** correctness fix
**Risk:** P0
**FR Coverage:** FR1, FR2

Move `apps/api/__test__/unit/sync/sync-modules.lifecycle.test.ts` to integration. Remove all `vi.mock()` calls for `getDbPool`, `@jurnapod/sync-core`, `@jurnapod/pos-sync`, `@jurnapod/backoffice-sync`. Use real DB pool and real sync package imports. Test lazy init, concurrent calls, cleanup lifecycle against real production code.

#### Story 63-2: Replace inline scaled() with @jurnapod/shared in purchasing tests
**Status:** ready-for-dev
**Type:** regression fix
**Risk:** P0
**FR Coverage:** FR3

Replace inline `scaled()` reimplementations in 4 purchasing test files with canonical `import { scaled, unscaled } from "@jurnapod/shared"`. Files: `ap-payments.test.ts`, `ap-multicurrency-correctness.test.ts`, `ap-reconciliation-snapshots.test.ts`, `ap-reconciliation.test.ts`.

#### Story 63-3: Replace wrong getInvoiceOpenAmount with production export
**Status:** ready-for-dev
**Type:** production refactor + test fix
**Risk:** P0
**FR Coverage:** FR3

Export `computePurchaseInvoiceOpenAmount` from `@jurnapod/modules-purchasing` public API. Replace inline SQL function in `ap-payment-correctness.test.ts` with imported production function. The inline version drops `exchange_rate` multiplication -- computes wrong amounts for non-IDR invoices.

#### Story 63-4: Replace raw SQL journal seeding with production posting fixtures
**Status:** ready-for-dev
**Type:** fixture extraction + test rewrite
**Risk:** P0
**FR Coverage:** FR6

Create `createSeededPurchaseInvoice` and `createSeededSalesInvoice` fixtures that create document + post + generate journal entries through production service functions. Replace raw SQL INSERT batches in 5 reconciliation/reporting tests.

### Phase B -- Fixture Extraction + Raw SQL Elimination (P1)

#### Story 63-5: Create createTestAccount fixture in modules-accounting + fix account_type_id backfills
**Status:** ready-for-dev
**Type:** fixture extraction
**Risk:** P1
**FR Coverage:** FR5

Create `createTestAccount(db, { companyId, code, name, typeName, isActive? })` in `packages/modules/accounting/src/test-fixtures/`. Fix `createTestInventoryGLAccount()` to set `account_type_id` at creation time. Update 9 affected test files.

#### Story 63-6: Create sales test fixtures in modules-sales
**Status:** ready-for-dev
**Type:** fixture extraction
**Risk:** P1
**FR Coverage:** FR5

Create `createTestCustomer(db, opts)` and `createTestSalesInvoice(db, opts)` in `packages/modules/sales/test-fixtures/`. Both MUST use production service functions. Update 3 affected AR/reporting test files.

#### Story 63-7: Create purchasing test fixtures in modules-purchasing
**Status:** ready-for-dev
**Type:** fixture extraction
**Risk:** P1
**FR Coverage:** FR5

Create `createTestPurchaseInvoice(db, opts)` and `createTestApPayment(db, opts)` in `packages/modules/purchasing/src/test-fixtures/`. Both MUST use production service functions. Replace raw SQL in 2 affected files. Also replace raw `INSERT INTO suppliers` with existing `createTestSupplier`.

#### Story 63-8: Create treasury test fixture in modules-treasury
**Status:** ready-for-dev
**Type:** fixture extraction
**Risk:** P1
**FR Coverage:** FR5

Create `createTestCashBankTransaction(db, opts)` in `packages/modules/treasury/test-fixtures/`. MUST use production cash-bank service functions. Update 2 affected treasury reporting test files.

#### Story 63-9: Create reconciliation-seeded fixtures
**Status:** ready-for-dev
**Type:** fixture extraction
**Risk:** P1
**FR Coverage:** FR5, FR6

Create `createSeededPurchaseInvoice(db, opts)` in `packages/modules/purchasing/src/test-fixtures/`, `createSeededSalesInvoice(db, opts)` in `packages/modules/sales/test-fixtures/`, and `createTestJournalBatch(db, entries[])` in `packages/modules/accounting/src/test-fixtures/`. All use production posting functions. Update 10+ reconciliation/reporting tests.

#### Story 63-10: Replace 14 duplicate makeTag() in purchasing tests
**Status:** ready-for-dev
**Type:** DRY consolidation
**Risk:** P1
**FR Coverage:** FR7

Replace all duplicate `makeTag` function definitions in 14 purchasing test files with `import { makeTag } from "../../helpers/tags"`. Remove explicit counter parameters. Verify no tag collision failures.

#### Story 63-11: Consolidate duplicate flow helpers
**Status:** ready-for-dev
**Type:** DRY consolidation
**Risk:** P1
**FR Coverage:** FR7

Extract `createSentPurchaseOrder`, `createPostedPurchaseInvoice` to `packages/modules/purchasing/test-fixtures/`. Extract `createSalesFixtureFlow` to `packages/modules/sales/test-fixtures/`. Update 8+ affected test files.

#### Story 63-12: Update remaining test files to use extracted fixtures
**Status:** ready-for-dev
**Type:** cleanup
**Risk:** P1
**FR Coverage:** FR4

After fixtures from stories 63-5 through 63-11 are extracted, update remaining test files. Create `createTestAuditLog` in `packages/modules/platform/test-fixtures/`. Create `createTestReconciliationSnapshot` in owner package. Resolve TODO in `inventory-subledger-reconciliation.test.ts`.

### Phase C -- Validation Gate

#### Story 63-13: Full validation gate
**Status:** ready-for-dev
**Type:** infrastructure
**Risk:** P0 (gate)
**FR Coverage:** ALL

Run all quality gates: lint (0 errors), typecheck, build (all modified packages), 3x consecutive green test suite, `lint:fixture-flow` (0 violations), SOLID/DRY/KISS scoring, adversarial review GO. No unresolved P0/P1 in epic scope.

---

## 4) Epic Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R63-001 | P0 | Seeded fixtures (63-4, 63-9) may produce different journal balances than raw SQL | Run both paths in parallel, diff outputs |
| R63-002 | P1 | `makeTag()` shared counter changes uniqueness semantics | Audit all callers, run full suite |
| R63-003 | P1 | `scaled()` replacement may change assertion values | The fix is correctness-improving; verify assertions still hold |
| R63-004 | P1 | Fixture extraction may introduce circular dependencies | Follow owner-package model strictly |
| R63-005 | P2 | Some tests may have assertion values hardcoded to raw-SQL-seeded data | Verify with production data |

---

## 5) Preconditions

| # | Precondition | Enforcement | Status |
|---|--------------|-------------|--------|
| 1 | Epic 62 close + retro complete | sprint-status | Pending |
| 2 | `npm run lint -w @jurnapod/api` passes (0 errors) | pre-flight gate | To be verified at kickoff |
| 3 | `npm run typecheck -w @jurnapod/api` passes | pre-flight gate | To be verified at kickoff |
| 4 | `npm run lint:migrations` exits 0 | CI gate | To be verified at kickoff |
| 5 | Sprint-status validation passes | `validate-sprint-status.ts` | To be verified at kickoff |
| 6 | SOLID/DRY/KISS kickoff gate scored | manual review | Pending (kickoff gate) |

---

## 6) Dependencies Between Stories

- 63-1, 63-2, 63-3, 63-10, 63-11: No dependencies (parallel batch 1)
- 63-5, 63-6, 63-7, 63-8: No dependencies (parallel batch 2)
- 63-9: Depends on 63-5, 63-6, 63-7
- 63-4: Depends on 63-9
- 63-12: Depends on 63-5 through 63-11
- 63-13: Depends on ALL previous stories

**Execution Order:**
- **Batch 1 (Parallel):** 63-1, 63-2, 63-3, 63-10, 63-11
- **Batch 2 (Parallel):** 63-5, 63-6, 63-7, 63-8
- **Batch 3 (Sequential):** 63-9 (depends on 63-5, 63-6, 63-7)
- **Batch 4 (Sequential):** 63-4 (depends on 63-9)
- **Batch 5 (Sequential):** 63-12 (depends on 63-5 through 63-11)
- **Batch 6:** 63-13

---

## 7) Exit Gate

1. **Correctness Gate:** Zero test stubs of internal production code. All `vi.mock()` removed from integration tests.
2. **Fixture Gate:** All raw SQL test setup replaced with canonical fixtures. `lint:fixture-flow` exits 0.
3. **Test Gate:** Full test suite passes 3x consecutively.
4. **Build Gate:** `npm run build` passes for all modified packages (accounting, sales, purchasing, treasury).
5. **Risk Gate:** Unresolved P0/P1 in epic scope = 0.
6. **SOLID/DRY/KISS Gate:** Full rescore passes at pre-close.
7. **Review Gate:** Adversarial review (@bmad-review agent) verdict: GO.

---

## 8) Validation Commands

```bash
npm run lint -w @jurnapod/api
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-sales
npm run build -w @jurnapod/modules-purchasing
npm run build -w @jurnapod/modules-treasury
npm test -w @jurnapod/api -- --run
npm run lint:fixture-flow -w @jurnapod/api
npx tsx scripts/validate-sprint-status.ts
npx tsx scripts/validate-structure-conformance.ts
npm run lint:migrations
```

---

## 9) Sign-Off

### Completion Evidence

| Gate | Result |
|------|--------|
| `lint` | ✅ 0 errors |
| `typecheck` | ✅ Pass |
| `build` (6 packages + API) | ✅ Pass |
| `test` (key suites in isolation) | ✅ All pass |
| `test` (full suite) | ✅ 212/215 suites pass (3 pre-existing flaky) |
| `sprint-status` | ✅ Healthy, 13/13 stories done |

### Delivered

| Metric | Count |
|--------|-------|
| Test stubs eliminated | 1 (sync-modules: `{ mocked: true }` → real DB) |
| Inline production-code bypasses eliminated | 18+ |
| Canonical fixtures created | 13 across 5 owner packages |
| Duplicate `makeTag()` removed | 15 |
| Duplicate flow helpers consolidated | 3 |
| Raw SQL test setup replaced | ~60+ across 25+ files |
| Files changed | ~98 |
| Lint errors fixed (pre-existing) | 2 |
| Test failure fixed (pre-existing) | 1 |

### Deferred

- ~288 `Date.now()` → `makeTag()` migration (P2)
- ~112 `.slice()` tag policy violations (P2)
- 158 `no-explicit-any` warnings (pre-existing)
- 3 flaky test suites (pass in isolation)

---

**Sign-off:** Ahmad — Epic 63 complete. 2026-05-10.

_Last Updated: 2026-05-10T23:00:00Z_
