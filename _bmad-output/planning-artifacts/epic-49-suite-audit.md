# Epic 49 Suite Audit — Full Integration Test Determinism Scan

> **Epic:** 49 — Test Determinism + CI Reliability  
> **Story:** 49.1 (Kickoff Gate + Test Reliability Audit)  
> **Date:** 2026-04-21  
> **Owner:** @bmad-dev

---

## Purpose

This document captures the AC2 audit output: a structured scan of ALL integration test files under `apps/api/__test__/integration/` and `packages/*/__test__/integration/` for determinism categories:

- **Time-dependent**: `Date.now()`, `new Date()`, `Math.random()` in test assertions or fixture setup
- **Pool cleanup**: Missing `afterAll`/`afterEach` that closes the DB pool
- **RWLock usage**: Suites using `acquireReadLock`/`releaseReadLock`
- **Shared mutable state**: Ordering dependencies via persistent tables

Output table columns: `File`, `Line(s)`, `Pattern`, `Category`, `Severity`, `Story Assignment`

---

## Audit Commands Run

```bash
# Time dependence
grep -rn "Date.now\|new Date()" apps/api/__test__/integration/ --include="*.test.ts" | wc -l
# → 504 matches

grep -rn "Math.random" apps/api/__test__/integration/ --include="*.test.ts" | wc -l
# → 88 matches

# Cleanup coverage
grep -rn "afterAll\|afterEach" apps/api/__test__/integration/ --include="*.test.ts" | grep -v "pool.end\|db.pool" | wc -l
# → 292 matches (many without pool cleanup)

# RWLock usage
grep -rn "acquireReadLock\|releaseReadLock" apps/api/__test__/integration/ --include="*.test.ts"
# → 12 matches (only 4 suites)

# Package-level scan
grep -rn "Date.now\|new Date()\|Math.random" packages/ --include="*.test.ts" | wc -l
# → 36 matches

grep -rn "afterAll\|afterEach" packages/ --include="*.test.ts" | wc -l
# → 31 matches
```

---

## Section A — Time-Dependent Findings (P1)

### A1: `Date.now()` / `new Date()` in `apps/api/__test__/integration/`

| File | Lines | Pattern | Category | Severity | Story Assignment |
|------|-------|---------|----------|----------|------------------|
| `accounting/fiscal-year-close.test.ts` | 83, 90 | `Date.now()` in fixture code | Time-dependent | P1 | 49.2 |
| `purchasing/ap-reconciliation.test.ts` | 130, 155, 169, 351, 356, 386, 390, 440, 497, 528, 575, 606, 614, 634, 638, 654, 678, 732, 879, 895, 944, 976, 1014, 1065, 1100, 1175–1209, 1224–1258, 1446, 1450, 1482, 1486 | Multiple `Date.now()` in invoice codes and emails | Time-dependent | P1 | 49.3 |
| `purchasing/ap-reconciliation-snapshots.test.ts` | 59, 66, 78, 89, 95, 100, 261 | `Date.now()` in supplier codes and close request IDs | Time-dependent | P1 | 49.3 |
| `purchasing/supplier-soft-delete.regression.test.ts` | 49, 100, 136 | `Date.now()` in supplier codes | Time-dependent | P1 | 49.3 |
| `accounting/period-close-guardrail.test.ts` | 90, 96, 113, 130, 181, 186, 200, 275, 290, 318, 336, 350, 375, 391, 421, 439, 455, 484, 504, 544, 573, 596, 611 | Heavy `Date.now()` usage in invoice/credit codes | Time-dependent | P1 | 49.2 |
| `accounting/ap-exceptions.test.ts` | 102, 131, 163, 247, 303, 341, 398 | `Date.now()` + `Math.random()` in exception keys | Time-dependent | P1 | 49.2 |
| `purchasing/supplier-statements.test.ts` | 144, 170, 178, 194, 209, 348, 350, 477, 479, 537, 574, 576, 599, 629 | `Date.now()` in supplier codes and invoice numbers | Time-dependent | P1 | 49.3 |
| `purchasing/exchange-rates.test.ts` | 74 | `Math.random()` in date generation | Time-dependent | P1 | 49.3 |
| `purchasing/suppliers.test.ts` | 87, 116, 165, 213, 259, 292, 350, 409, 440, 483 | `Date.now()` + `Math.random()` in supplier codes | Time-dependent | P1 | 49.3 |
| `purchasing/suppliers-tenant-isolation.test.ts` | 71, 87, 144, 193, 218, 249 | `Date.now()` + `Math.random()` in supplier codes | Time-dependent | P1 | 49.3 |
| `purchasing/supplier-contacts.test.ts` | 41 | `Date.now()` + `Math.random()` in supplier code | Time-dependent | P1 | 49.3 |
| `sales/invoices-update.test.ts` | 115, 169, 224, 275, 329, 378, 488, 498, 539, 549, 590, 667, 708, 749, 759, 815, 825, 884, 939, 949 | `Date.now()` + `Math.random()` in SKU codes | Time-dependent | P1 | 49.3 |
| `sales/credit-notes-customer.test.ts` | 45, 168, 204, 304, 356, 407, 458, 508, 543, 552, 589 | `Date.now()` + `Math.random()` in SKUs | Time-dependent | P1 | 49.3 |
| `platform/customers.test.ts` | 92, 121, 156, 228, 287, 340, 387, 452, 483, 526 | `Date.now()` + `Math.random()` in customer codes | Time-dependent | P1 | 49.4 |
| `inventory/items/update.test.ts` | 47, 83, 131, 162 | `Math.random()` in SKU generation | Time-dependent | P1 | 49.5 |
| `settings/public-pages.test.ts` | 69, 107, 137, 179 | `Date.now()` + `Math.random()` in slugs | Time-dependent | P1 | 49.4 |
| `settings/pages-create.test.ts` | 107, 198, 262 | `Date.now()` + `Math.random()` in slugs | Time-dependent | P1 | 49.4 |
| `settings/pages-update.test.ts` | 109, 153, 197, 198, 257, 258 | `Date.now()` + `Math.random()` in slugs | Time-dependent | P1 | 49.4 |
| `settings/pages-unpublish.test.ts` | 105, 150 | `Date.now()` + `Math.random()` in slugs | Time-dependent | P1 | 49.4 |
| `settings/pages-publish.test.ts` | 105, 162 | `Date.now()` + `Math.random()` in slugs | Time-dependent | P1 | 49.4 |
| `reports/receivables-ageing-44-4.test.ts` | 73 | `Date.now()` + `Math.random()` in SKU | Time-dependent | P1 | 49.3 |

### A2: `Math.random()` Only in `apps/api/__test__/integration/`

| File | Lines | Pattern | Category | Severity | Story Assignment |
|------|-------|---------|----------|----------|------------------|
| `purchasing/po-order-no.concurrency.test.ts` | 5, 77, 82 | Comment explicitly noting `Math.random()` collision bug | Time-dependent (known bug) | P1 | 49.3 |
| `accounting/ap-exceptions.test.ts` | 247, 303, 341, 398 | `Date.now()` + `Math.random()` combined in exception keys | Time-dependent | P1 | 49.2 |
| `purchasing/exchange-rates.test.ts` | 74 | `Math.random()` in date construction | Time-dependent | P1 | 49.3 |
| `purchasing/suppliers.test.ts` | Multiple (see A1) | Combined with `Date.now()` in supplier codes | Time-dependent | P1 | 49.3 |
| `purchasing/suppliers-tenant-isolation.test.ts` | Multiple (see A1) | Combined with `Date.now()` in supplier codes | Time-dependent | P1 | 49.3 |
| `purchasing/supplier-contacts.test.ts` | 41 | Combined with `Date.now()` | Time-dependent | P1 | 49.3 |
| `sales/invoices-update.test.ts` | Multiple (see A1) | Combined with `Date.now()` in SKUs | Time-dependent | P1 | 49.3 |
| `sales/credit-notes-customer.test.ts` | Multiple (see A1) | Combined with `Date.now()` in SKUs | Time-dependent | P1 | 49.3 |
| `platform/customers.test.ts` | Multiple (see A1) | Combined with `Date.now()` in customer codes | Time-dependent | P1 | 49.4 |
| `inventory/items/update.test.ts` | Multiple (see A1) | `Math.random()` alone in SKU generation | Time-dependent | P1 | 49.5 |
| `settings/*.test.ts` | Multiple (see A1) | Combined with `Date.now()` in slugs | Time-dependent | P1 | 49.4 |

---

## Section B — Pool Cleanup Findings (P1)

### B1: Suites WITH `afterAll` Pool Cleanup

The following suites have `afterAll` and appear to call `pool.end()` (based on grep, need per-file verification):

| File | Evidence | Status |
|------|----------|--------|
| `accounting/fiscal-year-close.test.ts` | Has `afterAll` with pool cleanup | ✅ Needs per-file verification |
| `purchasing/ap-reconciliation.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `purchasing/ap-reconciliation-snapshots.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `accounting/period-close-guardrail.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `accounting/ap-exceptions.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `purchasing/purchase-invoices.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `purchasing/ap-payments.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `purchasing/goods-receipts.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `purchasing/ap-aging-report.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `purchasing/purchase-credits.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `purchasing/purchase-orders.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `purchasing/exchange-rates.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `purchasing/suppliers.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `purchasing/suppliers-tenant-isolation.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `purchasing/supplier-contacts.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `purchasing/supplier-statements.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `purchasing/supplier-soft-delete.regression.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `purchasing/po-order-no.concurrency.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `packages/auth/__test__/integration/resource-level-acl.integration.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `packages/auth/__test__/integration/access-check.integration.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `packages/auth/__test__/integration/tokens.integration.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `packages/auth/__test__/integration/refresh-tokens.integration.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `packages/auth/__test__/integration/login-throttle.integration.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `packages/pos-sync/__test__/integration/pos-sync-module.integration.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `packages/pos-sync/__test__/integration/persist-push-batch.integration.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `packages/sync-core/__test__/integration/data-retention.integration.test.ts` | Has `afterAll` | ✅ Needs per-file verification |
| `packages/backoffice-sync/__test__/integration/backoffice-sync-module.integration.test.ts` | Has `afterAll` | ✅ Needs per-file verification |

### B2: Suites Requiring Pool Cleanup Verification (P1 — all others)

**ALL other integration suites** that have `afterAll` but haven't been verified to call `pool.end()`. This is the full list from the glob scan that did NOT appear in the "with cleanup" list above.

**Priority: All ~50 critical suites need per-file verification that `afterAll` calls `pool.end()`.**

| File | Status |
|------|--------|
| `sales/invoices-discounts.test.ts` | ⚠️ Needs verification |
| `sales/invoices-update.test.ts` | ⚠️ Needs verification |
| `reports/receivables-ageing-44-4.test.ts` | ⚠️ Needs verification |
| `sales/credit-notes-customer.test.ts` | ⚠️ Needs verification |
| `platform/customers.test.ts` | ⚠️ Needs verification |
| `stock/outlet-access.test.ts` | ⚠️ Needs verification |
| `import/apply.test.ts` | ⚠️ Needs verification |
| `inventory/items/update.test.ts` | ⚠️ Needs verification |
| `inventory/item-groups/bulk-create.test.ts` | ⚠️ Needs verification |
| `admin-dashboards/trial-balance.test.ts` | ⚠️ Needs verification |
| `outlets/tenant-scope.test.ts` | ⚠️ Needs verification |
| `outlets/create.test.ts` | ⚠️ Needs verification |
| `companies/update.test.ts` | ⚠️ Needs verification |
| `companies/get-by-id.test.ts` | ⚠️ Needs verification |
| `companies/list.test.ts` | ⚠️ Needs verification |
| `users/create.test.ts` | ⚠️ Needs verification |
| `settings/modules-update.test.ts` | ⚠️ Needs verification |
| `settings/module-roles.test.ts` | ⚠️ Needs verification |
| `settings/modules-extended-update.test.ts` | ⚠️ Needs verification |
| `tax-rates/delete.test.ts` | ⚠️ Needs verification |
| `tax-rates/update.test.ts` | ⚠️ Needs verification |
| `roles/delete.test.ts` | ⚠️ Needs verification |
| `admin-dashboards/period-close.test.ts` | ⚠️ Needs verification |
| `tax-rates/create.test.ts` | ⚠️ Needs verification |
| `inventory/items/variant-stats.test.ts` | ⚠️ Needs verification |
| `companies/create.test.ts` | ⚠️ Needs verification |
| `supplies/list.test.ts` | ⚠️ Needs verification |
| `inventory/items/create.test.ts` | ⚠️ Needs verification |
| `inventory/item-prices/active.test.ts` | ⚠️ Needs verification |
| `inventory/item-prices/update.test.ts` | ⚠️ Needs verification |
| `recipes/ingredients-delete.test.ts` | ⚠️ Needs verification |
| `recipes/ingredients-list.test.ts` | ⚠️ Needs verification |
| `recipes/ingredients-update.test.ts` | ⚠️ Needs verification |
| `recipes/cost.test.ts` | ⚠️ Needs verification |
| `pos/item-variants.test.ts` | ⚠️ Needs verification |
| `inventory/item-prices/variant-prices.test.ts` | ⚠️ Needs verification |
| `inventory/item-prices/create.test.ts` | ⚠️ Needs verification |
| `pos/cart-line.test.ts` | ⚠️ Needs verification |
| `recipes/ingredients-create.test.ts` | ⚠️ Needs verification |
| `pos/cart-validate.test.ts` | ⚠️ Needs verification |
| `import/upload.test.ts` | ⚠️ Needs verification |
| `users/update.test.ts` | ⚠️ Needs verification |
| `users/roles.test.ts` | ⚠️ Needs verification |
| `users/tenant-scope.test.ts` | ⚠️ Needs verification |
| `users/list.test.ts` | ⚠️ Needs verification |
| `stock/low-stock.test.ts` | ⚠️ Needs verification |
| `stock/adjustments.test.ts` | ⚠️ Needs verification |
| `uploader/item-image-adapter.test.ts` | ⚠️ Needs verification |
| `swagger/swagger.test.ts` | ⚠️ Needs verification |
| `inventory/item-groups/update.test.ts` | ⚠️ Needs verification |
| `inventory/items/get-by-id.test.ts` | ⚠️ Needs verification |
| `operations/status.test.ts` | ⚠️ Needs verification |
| `admin-dashboards/reconciliation.test.ts` | ⚠️ Needs verification |
| `health/basic.test.ts` | ⚠️ Needs verification |
| `export/download.test.ts` | ⚠️ Needs verification |
| `supplies/delete.test.ts` | ⚠️ Needs verification |
| `supplies/update.test.ts` | ⚠️ Needs verification |
| `supplies/create.test.ts` | ⚠️ Needs verification |
| `supplies/get-by-id.test.ts` | ⚠️ Needs verification |
| `import/validate.test.ts` | ⚠️ Needs verification |
| `import/resume.test.ts` | ⚠️ Needs verification |
| `import/session-expiry.test.ts` | ⚠️ Needs verification |
| `import/template.test.ts` | ⚠️ Needs verification |
| `inventory/item-prices/delete.test.ts` | ⚠️ Needs verification |
| `inventory/item-prices/get-by-id.test.ts` | ⚠️ Needs verification |
| `inventory/item-prices/list.test.ts` | ⚠️ Needs verification |
| `inventory/item-groups/delete.test.ts` | ⚠️ Needs verification |
| `inventory/item-groups/create.test.ts` | ⚠️ Needs verification |
| `inventory/item-groups/get-by-id.test.ts` | ⚠️ Needs verification |
| `inventory/item-groups/list.test.ts` | ⚠️ Needs verification |
| `inventory/items/delete.test.ts` | ⚠️ Needs verification |
| `inventory/items/list.test.ts` | ⚠️ Needs verification |
| `tax-rates/update-tax-defaults.test.ts` | ⚠️ Needs verification |
| `tax-rates/get-tax-defaults.test.ts` | ⚠️ Needs verification |
| `stock/transactions.test.ts` | ⚠️ Needs verification |
| `stock/levels.test.ts` | ⚠️ Needs verification |
| `tax-rates/get-defaults.test.ts` | ⚠️ Needs verification |
| `tax-rates/list.test.ts` | ⚠️ Needs verification |
| `users/activate.test.ts` | ⚠️ Needs verification |
| `users/password.test.ts` | ⚠️ Needs verification |
| `users/outlets.test.ts` | ⚠️ Needs verification |
| `users/get-by-id.test.ts` | ⚠️ Needs verification |
| `users/me.test.ts` | ⚠️ Needs verification |
| `sync/idempotency.test.ts` | ⚠️ Needs verification |
| `sync/push.test.ts` | ⚠️ Needs verification |
| `sync/endpoints.test.ts` | ⚠️ Needs verification |
| `sales/orders.test.ts` | ⚠️ Needs verification |
| `items/crud.test.ts` | ⚠️ Needs verification |
| `accounts/crud.test.ts` | ⚠️ Needs verification |
| `auth/login.test.ts` | ⚠️ Needs verification |
| `outlets/access.test.ts` | ⚠️ Needs verification |
| `outlets/delete.test.ts` | ⚠️ Needs verification |
| `outlets/get-by-id.test.ts` | ⚠️ Needs verification |
| `outlets/list.test.ts` | ⚠️ Needs verification |

**Note:** `packages/notifications/__test__/integration/*.test.ts` uses `afterEach` + `vi.useFakeTimers()` — different cleanup pattern (no DB pool).

---

## Section C — RWLock Usage Findings

### C1: Suites WITH RWLock (4 suites — hardened in Epic 48)

| File | Lines | Pattern | Status |
|------|-------|---------|--------|
| `accounting/fiscal-year-close.test.ts` | 20, 78, 110 | `acquireReadLock` at line 78, `releaseReadLock` at line 110 | ✅ Epic 48 hardened |
| `purchasing/ap-reconciliation.test.ts` | 8, 123, 224 | `acquireReadLock` at line 123, `releaseReadLock` at line 224 | ✅ Epic 48 hardened |
| `purchasing/ap-reconciliation-snapshots.test.ts` | 7, 54, 114 | `acquireReadLock` at line 54, `releaseReadLock` at line 114 | ✅ Epic 48 hardened |
| `accounting/period-close-guardrail.test.ts` | 35, 83, 264 | `acquireReadLock` at line 83, `releaseReadLock` at line 264 | ✅ Epic 48 hardened |

### C2: Suites WITHOUT RWLock (all others — need assessment)

**All ~46 remaining critical suites do NOT use RWLock.** This does not automatically mean they need it — assessment is required per story in 49.2–49.5. Suits that modify shared fiscal/sync state should adopt RWLock.

---

## Section D — Package-Level Findings

### D1: `packages/*` Integration Suites — Time-Dependent

| Package | File | Lines | Pattern | Category | Severity | Story Assignment |
|---------|------|-------|---------|----------|----------|------------------|
| `packages/pos-sync` | `pos-sync-module.integration.test.ts` | 184, 200, 306 | `Date.now()` + `Math.random()` in correlation IDs | Time-dependent | P1 | 49.5 |
| `packages/auth` | `tokens.integration.test.ts` | 91, 99, 131, 139, 171, 179, 593 | `Date.now()` in token expiry assertions | Time-dependent | P1 | 49.4 |
| `packages/auth` | `refresh-tokens.integration.test.ts` | 97, 247, 357 | `Date.now()` and `new Date()` in expiry logic | Time-dependent | P1 | 49.4 |
| `packages/sync-core` | `data-retention.integration.test.ts` | 148, 206, 253, 259, 293, 309, 359 | `new Date()` in cutoff/recent date logic | Time-dependent | P1 | 49.5 |
| `packages/backoffice-sync` | `backoffice-sync-module.integration.test.ts` | 169, 432, 587 | `Date.now()` and `new Date()` in timestamps | Time-dependent | P1 | 49.5 |
| `packages/pos-sync` (unit) | `persist-push-batch.unit.test.ts` | 165 | `Date.now()` + `Math.random()` in `client_tx_id` | Time-dependent | P1 | 49.5 |

### D2: `packages/*` Integration Suites — Pool Cleanup

| Package | File | Lines | Pattern | Status |
|---------|------|-------|---------|--------|
| `packages/auth` | `access-check.integration.test.ts` | 25 | `afterAll` present | ⚠️ Needs per-file verification |
| `packages/auth` | `resource-level-acl.integration.test.ts` | 27 | `afterAll` present | ⚠️ Needs per-file verification |
| `packages/auth` | `tokens.integration.test.ts` | 628 | `afterAll` present | ⚠️ Needs per-file verification |
| `packages/auth` | `refresh-tokens.integration.test.ts` | 384 | `afterAll` present | ⚠️ Needs per-file verification |
| `packages/auth` | `login-throttle.integration.test.ts` | 21 | `afterAll` present | ⚠️ Needs per-file verification |
| `packages/pos-sync` | `pos-sync-module.integration.test.ts` | 187 | `afterAll` present | ⚠️ Needs per-file verification |
| `packages/pos-sync` | `persist-push-batch.integration.test.ts` | 160 | `afterAll` present | ⚠️ Needs per-file verification |
| `packages/sync-core` | `data-retention.integration.test.ts` | 183 | `afterAll` present | ⚠️ Needs per-file verification |
| `packages/backoffice-sync` | `backoffice-sync-module.integration.test.ts` | 140 | `afterAll` present | ⚠️ Needs per-file verification |
| `packages/notifications` | `sendgrid.test.ts` | 22 | `afterEach` + `vi.useFakeTimers()` | ⚠️ Unit test (no DB pool) |
| `packages/notifications` | `templates.test.ts` | 25 | `afterEach` | ⚠️ Unit test (no DB pool) |
| `packages/notifications` | `email-service.test.ts` | 56, 480 | `afterEach` | ⚠️ Unit test (no DB pool) |
| `packages/db` | `pool.test.ts` | Multiple | `pool.end()` explicit | ✅ Unit test (verified) |

---

## Section E — Suite Classification (AC3)

### Critical Suites (Sprint-Close Blockers)

Per Story 49.1 AC3 and Epic 49 sprint plan, the following suites are classified as **critical** (sprint-close blocker):

| Suite | Category | Hardened By | Notes |
|-------|----------|-------------|-------|
| `accounting/fiscal-year-close.test.ts` | Financial | Epic 48 (48.4) | ✅ 3× green |
| `accounting/period-close-guardrail.test.ts` | Financial | Epic 48 (48.4) | ✅ 3× green |
| `purchasing/ap-reconciliation.test.ts` | Financial | Epic 48 (48.4) | ✅ 3× green |
| `purchasing/ap-reconciliation-snapshots.test.ts` | Financial | Epic 48 (48.4) | ✅ 3× green |
| `accounting/ap-exceptions.test.ts` | Financial | Story 49.2 | ⚠️ Has time-dependence |
| `sync/idempotency.test.ts` | Sync | Story 49.5 | ⚠️ Needs audit |
| `sync/push.test.ts` | Sync | Story 49.5 | ⚠️ Needs audit |
| `purchasing/purchase-orders.test.ts` | Financial | Story 49.3 | ⚠️ Has time-dependence |
| `purchasing/goods-receipts.test.ts` | Financial | Story 49.3 | ⚠️ Has time-dependence |
| `purchasing/purchase-invoices.test.ts` | Financial | Story 49.3 | ⚠️ Has time-dependence |
| `purchasing/ap-payments.test.ts` | Financial | Story 49.3 | ⚠️ Has time-dependence |
| `purchasing/purchase-credits.test.ts` | Financial | Story 49.3 | ⚠️ Has time-dependence |
| `purchasing/po-order-no.concurrency.test.ts` | Financial | Story 49.3 | ⚠️ Known `Math.random()` issue |
| `platform/users/tenant-scope.test.ts` | Platform/ACL | Story 49.4 | ⚠️ Needs audit |
| `outlets/tenant-scope.test.ts` | Platform | Story 49.4 | ⚠️ Needs audit |
| `purchasing/suppliers-tenant-isolation.test.ts` | Platform | Story 49.3 | ⚠️ Has time-dependence |
| `packages/auth/resource-level-acl.integration.test.ts` | ACL | Story 49.4 | ⚠️ Needs pool cleanup verification |

### Non-Critical Suites (CI Runs — Not Sprint-Close Blockers)

All remaining integration suites not listed above as critical are classified as **non-critical** — they must still pass CI, but their flakiness does not block sprint close:

- All `settings/*.test.ts` suites
- All `inventory/item-groups/*.test.ts` suites
- All `recipes/*.test.ts` suites
- All `supplies/*.test.ts` suites
- All `outlets/*.test.ts` suites except `tenant-scope.test.ts`
- All `companies/*.test.ts` suites
- All `users/*.test.ts` suites except `tenant-scope.test.ts`
- All `tax-rates/*.test.ts` suites
- All `stock/*.test.ts` suites
- All `inventory/items/*.test.ts` suites except already-listed critical suites
- All `inventory/item-prices/*.test.ts` suites
- All `import/*.test.ts` suites
- `swagger/swagger.test.ts`, `health/basic.test.ts`
- `admin-dashboards/period-close.test.ts`, `admin-dashboards/trial-balance.test.ts`
- `packages/notifications/*.test.ts`
- `packages/db/__test__/unit/*.test.ts`

---

## Section F — Critical vs Non-Critical Summary

### Critical Suite Count

| Category | Count | Notes |
|----------|-------|-------|
| Already hardened (Epic 48) | 4 | ✅ 3× green confirmed |
| Epic 49 critical (new) | ~13 | Must achieve 3× green by sprint end |
| **Total critical** | ~17 | Sprint-close blockers |

### Findings Count

| Category | Count | Severity |
|----------|-------|----------|
| `Date.now()` usages | 504 | P1 |
| `Math.random()` usages | 88 | P1 |
| Suites needing pool cleanup verification | ~80 | P1 |
| Suites needing RWLock assessment | ~46 | P2 |
| Package-level time-dependence | 36 | P1 |

---

## Section G — AC5 Baseline Run Evidence (2026-04-21)

> **Purpose:** Address Story 49.1 review blocker — AC5 baseline run evidence was missing.
> **Date:** 2026-04-21 06:37–06:38 UTC
> **Policy:** background + PID + log files (see `_bmad-output/planning-artifacts/epic-49-logs/PID-manifest.txt`)

### G1: Suite Run Results — 17/17 PASSED ✅

| # | Suite | PID | Result | Tests | Duration |
|---|-------|-----|--------|-------|----------|
| 01 | `accounting/fiscal-year-close.test.ts` (Epic-48 hardened) | 284125 | ✅ PASS | 6/6 | 3.07s |
| 02 | `accounting/period-close-guardrail.test.ts` (Epic-48 hardened) | 284192 | ✅ PASS | 16/16 | 4.33s |
| 03 | `purchasing/ap-reconciliation.test.ts` (Epic-48 hardened) | 284294 | ✅ PASS | 54/54 | 18.06s |
| 04 | `purchasing/ap-reconciliation-snapshots.test.ts` (Epic-48 hardened) | 284400 | ✅ PASS | 8/8 | 3.76s |
| 05 | `accounting/ap-exceptions.test.ts` (Epic-49 critical) | 284470 | ✅ PASS | 11/11 | 3.88s |
| 06 | `sync/idempotency.test.ts` (Epic-49 critical) | 284602 | ✅ PASS | 2/2 | 1.94s |
| 07 | `sync/push.test.ts` (Epic-49 critical) | 284700 | ✅ PASS | 2/2 | 1.81s |
| 08 | `purchasing/purchase-orders.test.ts` (Epic-49 critical) | 284797 | ✅ PASS | 27/27 | 2.95s |
| 09 | `purchasing/goods-receipts.test.ts` (Epic-49 critical) | 284880 | ✅ PASS | 21/21 | 3.33s |
| 10 | `purchasing/purchase-invoices.test.ts` (Epic-49 critical) | 285017 | ✅ PASS | 16/16 | 3.50s |
| 11 | `purchasing/ap-payments.test.ts` (Epic-49 critical) | 285086 | ✅ PASS | 27/27 | 5.08s |
| 12 | `purchasing/purchase-credits.test.ts` (Epic-49 critical) | 285172 | ✅ PASS | 6/6 | 3.61s |
| 13 | `purchasing/po-order-no.concurrency.test.ts` (Epic-49 critical) | 285299 | ✅ PASS | 2/2 | 2.14s |
| 14 | `users/tenant-scope.test.ts` (Epic-49 critical — **substitute** for missing `platform/users/tenant-scope.test.ts`) | 285370 | ✅ PASS | 3/3 | 2.07s |
| 15 | `outlets/tenant-scope.test.ts` (Epic-49 critical) | 285493 | ✅ PASS | 6/6 | 1.92s |
| 16 | `purchasing/suppliers-tenant-isolation.test.ts` (Epic-49 critical) | 285617 | ✅ PASS | 5/5 | 3.32s |
| 17 | `packages/auth/resource-level-acl.integration.test.ts` (ACL — Epic-49 critical) | 285834 | ✅ PASS | 6/6 | 1.35s |

**Total: 17 suites run, 17 suites passed, 0 failures.**

### G2: Path Mismatch Note

- `platform/users/tenant-scope.test.ts` was specified in the audit as `platform/users/tenant-scope` path.
- Actual path on disk: `apps/api/__test__/integration/users/tenant-scope.test.ts`.
- **Substituted** with `users/tenant-scope.test.ts` for the baseline run (3/3 tests passed).
- The `platform/users` subdirectory does not exist under `apps/api/__test__/integration/`.
- The `users/tenant-scope.test.ts` suite covers the same ACL/tenant-scoping concern as the intended `platform/users` path.

### G3: Log Files

All log files stored at: `_bmad-output/planning-artifacts/epic-49-logs/`

| Log | Path |
|-----|------|
| PID manifest | `_bmad-output/planning-artifacts/epic-49-logs/PID-manifest.txt` |
| Suite logs 01–16 | `_bmad-output/planning-artifacts/epic-49-logs/01-fiscal-year-close.log` … `16-suppliers-tenant-isolation.log` |
| ACL suite | `_bmad-output/planning-artifacts/epic-49-logs/17-auth-resource-level-acl.log` |

### G4: Lint Run (R49-003 Evidence)

| Field | Value |
|-------|-------|
| Command | `npm run lint -w @jurnapod/api` |
| PID | 285896 |
| Log | `_bmad-output/planning-artifacts/epic-49-logs/lint-api.log` |
| Result | ✅ PASS — 0 errors, 178 warnings |
| Exit | 0 (green) |

Lint output excerpt: `✖ 178 problems (0 errors, 178 warnings)` — no blocking errors.

---

## References

- Story 49.1 spec: `_bmad-output/implementation-artifacts/stories/epic-49/story-49.1.md`
- Epic 49 sprint plan: `_bmad-output/planning-artifacts/epic-49-sprint-plan.md`
- Risk register: `_bmad-output/planning-artifacts/epic-49-risk-register.md`
- SOLID/DRY/KISS scorecard: `_bmad-output/planning-artifacts/epic-49-solid-dry-kiss-scorecard.md`
