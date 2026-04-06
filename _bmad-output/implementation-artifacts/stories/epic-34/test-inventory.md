# Test Inventory - Epic 34

**Generated:** 2026-04-06  
**Purpose:** Catalog all tests for reorganization into `__test__/unit` and `__test__/integration`

---

## Summary

| Package | Total Tests | Unit | Integration | e2e |
|---------|------------|------|-------------|-----|
| `apps/api` | 125 | ~5 | ~120 | - |
| `apps/backoffice` | 24 | ~24 | ~0 | - |
| `packages/auth` | 7 | 3 | 4 | - |
| `packages/db` | 2 | 2 | 0 | - |
| `packages/modules/accounting` | 1 | 1 | 0 | - |
| `packages/modules/platform` | 1 | 0 | 1 | - |
| `packages/modules/reservations` | 2 | 2 | 0 | - |
| `packages/modules/treasury` | 3 | 3 | 0 | - |
| `packages/notifications` | 3 | 0 | 3 | - |
| `packages/pos-sync` | 3 | 1 | 2 | - |
| `packages/shared` | 1 | 1 | 0 | - |
| `packages/sync-core` | 3 | 2 | 1 | - |
| `packages/telemetry` | 6 | 6 | 0 | - |
| **TOTAL** | **181** | **~50** | **~131** | **-** |

---

## apps/api

### Route Tests (26 files) → ALL INTEGRATION

| File | Current Location | Target Location | Has DB? | Notes |
|------|-----------------|-----------------|---------|-------|
| `accounts.fixed-assets.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `accounts.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `auth.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `dinein.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `export.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `fiscal-year-close.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `import.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `inventory.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `journals.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `period-close-workspace.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `permissions.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `reports.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `sales/invoices.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `sales/orders.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `sales/payments.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `settings-config.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `settings-module-roles.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `settings-modules.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `settings-pages.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `stock.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `sync/pull.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `sync/push-variant.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `sync/push.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `sync/sync.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `tax-rates.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |
| `users.test.ts` | `src/routes/` | `__test__/integration/` | Yes | Route test with DB |

### Lib Tests (58 files)

#### TRUE UNIT (5 files) → `__test__/unit/`

| File | Current Location | Target Location | Has DB? | Notes |
|------|-----------------|-----------------|---------|-------|
| `date-helpers.test.ts` | `src/lib/` | `__test__/unit/` | No | Pure date logic, no imports from DB |
| `retry.test.ts` | `src/lib/` | `__test__/unit/` | No | Pure retry logic, no DB |
| `cost-tracking.unit.test.ts` | `src/lib/` | `__test__/unit/` | No | Explicitly marked as unit, pure functions |
| `metrics/metrics.test.ts` | `src/lib/metrics/` | `__test__/unit/` | No | Tests singleton metrics collectors |
| `metrics/dashboard-metrics.test.ts` | `src/lib/metrics/` | `__test__/unit/` | No | Tests metrics, no DB |

#### INTEGRATION (53 files) → `__test__/integration/`

| File | Current Location | Target Location | Has DB? | Notes |
|------|-----------------|-----------------|---------|-------|
| `account-mappings-scope.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `alerts/alert-manager.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `auth.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `auth/permissions.test.ts` | `src/lib/auth/` | `__test__/integration/` | Yes | Uses createTestUser, closeDbPool |
| `batch.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `cash-bank.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `cogs-posting.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB - CRITICAL: keep both unit+int |
| `cost-auditability.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `cost-tracking.db.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `export/export.test.ts` | `src/lib/export/` | `__test__/integration/` | Yes | Uses DB |
| `export/query-builder.test.ts` | `src/lib/export/` | `__test__/integration/` | Yes | Uses DB |
| `export/streaming.test.ts` | `src/lib/export/` | `__test__/integration/` | Yes | Uses DB |
| `import/batch-operations.test.ts` | `src/lib/import/` | `__test__/integration/` | Yes | Uses DB |
| `import/batch-recovery.test.ts` | `src/lib/import/` | `__test__/integration/` | Yes | Uses DB |
| `import/checkpoint-resume.test.ts` | `src/lib/import/` | `__test__/integration/` | Yes | Uses DB |
| `import/import.test.ts` | `src/lib/import/` | `__test__/integration/` | Yes | Uses DB |
| `import/parsers.test.ts` | `src/lib/import/` | `__test__/integration/` | Yes | Uses DB |
| `import/session-store.test.ts` | `src/lib/import/` | `__test__/integration/` | Yes | Uses DB |
| `import/validation.test.ts` | `src/lib/import/` | `__test__/integration/` | Yes | Uses DB |
| `import/validator.test.ts` | `src/lib/import/` | `__test__/integration/` | Yes | Uses DB |
| `inventory/access-check.test.ts` | `src/lib/inventory/` | `__test__/integration/` | Yes | Uses DB |
| `inventory/variant-stock.test.ts` | `src/lib/inventory/` | `__test__/integration/` | Yes | Uses DB |
| `item-barcodes.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `item-images.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `item-variants.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `master-data.item-prices.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `master-data.supplies.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `metrics/__tests__/journal-metrics.test.ts` | `src/lib/metrics/` | `__test__/integration/` | Yes | Uses DB |
| `outlet-tables.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `phase3-batch.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `phase4.contracts.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `pricing/variant-price-resolver.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `progress/progress-store.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `recipe-composition.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `reconciliation-service.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `report-telemetry.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `reservation-groups.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `reservations.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `sales.cogs-feature-gate.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `sales.idempotency.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `sales.payment-variance.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `sales.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `service-sessions.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `settings-modules.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `settings.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `stock.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `sync-modules.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `sync/audit-adapter.test.ts` | `src/lib/sync/` | `__test__/integration/` | Yes | Uses DB |
| `sync/check-duplicate.test.ts` | `src/lib/sync/` | `__test__/integration/` | Yes | Uses DB |
| `sync/push/adapters.test.ts` | `src/lib/sync/` | `__test__/integration/` | Yes | Uses DB |
| `table-occupancy.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `taxes.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |
| `users.test.ts` | `src/lib/` | `__test__/integration/` | Yes | Uses DB |

### API Integration Tests (41 files) → `__test__/integration/`

All these tests are already integration tests and will be moved from `tests/integration/` to `__test__/integration/`:

| File |
|------|
| `accounts.classification.integration.test.mjs` |
| `auth.integration.test.mjs` |
| `cash-bank.acl.integration.test.mjs` |
| `cash-bank.integration.test.mjs` |
| `cogs-posting.integration.test.mjs` |
| `companies.integration.test.mjs` |
| `depreciation.integration.test.mjs` |
| `export-streaming.integration.test.mjs` |
| `export.integration.test.mjs` |
| `fiscal-years.integration.test.mjs` |
| `fixed-asset-categories.integration.test.mjs` |
| `fixed-assets-lifecycle.integration.test.mjs` |
| `fixed-assets.integration.test.mjs` |
| `import-fk-validation.integration.test.mjs` |
| `import.integration.test.mjs` |
| `item-groups-bulk.integration.test.mjs` |
| `item-groups.integration.test.mjs` |
| `master-data.integration.test.mjs` |
| `module-permissions-acl.integration.test.mjs` |
| `modules.integration.test.mjs` |
| `outlet-role-acl.integration.test.mjs` |
| `outlets.integration.test.mjs` |
| `period-transition-audit.integration.test.mjs` |
| `recipe-composition.integration.test.mjs` |
| `reports.access.integration.test.mjs` |
| `reports.daily-sales.integration.test.mjs` |
| `reports.general-ledger.integration.test.mjs` |
| `reports.journals.integration.test.mjs` |
| `reports.pos.integration.test.mjs` |
| `reports.profit-loss.integration.test.mjs` |
| `reports.receivables-ageing.integration.test.mjs` |
| `reports.smoke.integration.test.mjs` |
| `sales-payments.acl.integration.test.mjs` |
| `sales.integration.test.mjs` |
| `settings-config.integration.test.mjs` |
| `settings.integration.test.mjs` |
| `static-pages.integration.test.mjs` |
| `sync-push.integration.test.mjs` |
| `tax-rates.acl.integration.test.mjs` |
| `tax-rates.integration.test.mjs` |
| `users.integration.test.mjs` |

---

## packages/auth

| File | Current Location | Target Location | Type | Has DB? |
|------|-----------------|-----------------|------|---------|
| `src/passwords/hash.test.ts` | `src/` | `__test__/unit/` | unit | No |
| `src/rbac/roles.test.ts` | `src/` | `__test__/unit/` | unit | No |
| `src/tokens/access-tokens.test.ts` | `src/` | `__test__/unit/` | unit | No |
| `integration/email/tokens.integration.test.ts` | `integration/` | `__test__/integration/` | integration | Yes |
| `integration/rbac/access-check.integration.test.ts` | `integration/` | `__test__/integration/` | integration | Yes |
| `integration/throttle/login-throttle.integration.test.ts` | `integration/` | `__test__/integration/` | integration | Yes |
| `integration/tokens/refresh-tokens.integration.test.ts` | `integration/` | `__test__/integration/` | integration | Yes |

---

## packages/db

| File | Current Location | Target Location | Type | Has DB? |
|------|-----------------|-----------------|------|---------|
| `src/kysely/index.test.ts` | `src/` | `__test__/unit/` | unit | No |
| `src/pool.test.ts` | `src/` | `__test__/unit/` | unit | No |

---

## packages/modules/accounting

| File | Current Location | Target Location | Type | Has DB? |
|------|-----------------|-----------------|------|---------|
| `src/posting.test.ts` | `src/` | `__test__/unit/` | unit | No |

---

## packages/modules/platform

| File | Current Location | Target Location | Type | Has DB? |
|------|-----------------|-----------------|------|---------|
| `src/sync/audit-service.integration.test.ts` | `src/sync/` | `__test__/integration/` | integration | Yes |

---

## packages/modules/reservations

| File | Current Location | Target Location | Type | Has DB? |
|------|-----------------|-----------------|------|---------|
| `src/time/overlap.test.ts` | `src/time/` | `__test__/unit/` | unit | No |
| `src/time/timestamp.test.ts` | `src/time/` | `__test__/unit/` | unit | No |

---

## packages/modules/treasury

| File | Current Location | Target Location | Type | Has DB? |
|------|-----------------|-----------------|------|---------|
| `src/cash-bank-service.test.ts` | `src/` | `__test__/unit/` | unit | No |
| `src/helpers.test.ts` | `src/` | `__test__/unit/` | unit | No |
| `src/journal-builder.test.ts` | `src/` | `__test__/unit/` | unit | No |

---

## packages/notifications

| File | Current Location | Target Location | Type | Has DB? |
|------|-----------------|-----------------|------|---------|
| `tests/email-service.test.ts` | `tests/` | `__test__/integration/` | integration | Yes |
| `tests/sendgrid.test.ts` | `tests/` | `__test__/integration/` | integration | Yes |
| `tests/templates.test.ts` | `tests/` | `__test__/integration/` | integration | Yes |

---

## packages/pos-sync

| File | Current Location | Target Location | Type | Has DB? |
|------|-----------------|-----------------|------|---------|
| `src/push/persist-push-batch.unit.test.ts` | `src/push/` | `__test__/unit/` | unit | No |
| `src/pos-sync-module.integration.test.ts` | `src/` | `__test__/integration/` | integration | Yes |
| `src/push/persist-push-batch.integration.test.ts` | `src/push/` | `__test__/integration/` | integration | Yes |

---

## packages/shared

| File | Current Location | Target Location | Type | Has DB? |
|------|-----------------|-----------------|------|---------|
| `src/__tests__/table-reservation.test.ts` | `src/__tests__/` | `__test__/unit/` | unit | No |

---

## packages/sync-core

| File | Current Location | Target Location | Type | Has DB? |
|------|-----------------|-----------------|------|---------|
| `src/idempotency/metrics-collector.test.ts` | `src/` | `__test__/unit/` | unit | No |
| `src/idempotency/sync-idempotency.test.ts` | `src/` | `__test__/unit/` | unit | No |
| `src/jobs/data-retention.integration.test.ts` | `src/jobs/` | `__test__/integration/` | integration | Yes |

---

## packages/telemetry

| File | Current Location | Target Location | Type | Has DB? |
|------|-----------------|-----------------|------|---------|
| `src/__tests__/alert-config.test.ts` | `src/__tests__/` | `__test__/unit/` | unit | No |
| `src/__tests__/correlation.test.ts` | `src/__tests__/` | `__test__/unit/` | unit | No |
| `src/__tests__/labels.test.ts` | `src/__tests__/` | `__test__/unit/` | unit | No |
| `src/__tests__/quality-gate.test.ts` | `src/__tests__/` | `__test__/unit/` | unit | No |
| `src/__tests__/slo.test.ts` | `src/__tests__/` | `__test__/unit/` | unit | No |
| `src/runtime/__tests__/alert-manager.test.ts` | `src/runtime/` | `__test__/unit/` | unit | No |

---

## apps/backoffice (24 tests)

These are React component/hook tests. Most are likely unit tests (testing React components with mocks).

| Category | Count | Target Location |
|----------|-------|----------------|
| Component tests | ~6 | `__test__/unit/` |
| Hook tests | ~10 | `__test__/unit/` |
| Feature tests | ~5 | `__test__/unit/` |
| Other tests | ~3 | `__test__/unit/` |

---

## e2e Tests (OUT OF SCOPE)

e2e tests remain in their current location:
- `apps/backoffice/e2e/` - 8 spec files
- `apps/pos/e2e/` - 5 spec files

---

## Duplicates & Overlap Analysis

### API Route vs Integration Tests (DELETE route tests, KEEP integration)

| Route Test | Integration Test | Action |
|------------|-----------------|--------|
| `routes/auth.test.ts` | `auth.integration.test.mjs` | DELETE route test |
| `routes/accounts.test.ts` | `accounts.classification.integration.test.mjs` | DELETE route test |
| `routes/sales/orders.test.ts` | `sales.integration.test.mjs` | DELETE route test |
| `routes/sales/invoices.test.ts` | `sales.integration.test.mjs` | DELETE route test |
| `routes/sales/payments.test.ts` | `sales-payments.acl.integration.test.mjs` | DELETE route test |
| `routes/settings-config.test.ts` | `settings-config.integration.test.mjs` | DELETE route test |
| `routes/settings-modules.test.ts` | `settings.integration.test.mjs` | DELETE route test |
| `routes/stock.test.ts` | Multiple inventory integrations | DELETE route test |
| `routes/reports.test.ts` | 8 reports integration tests | DELETE route test |
| `routes/sync/push.test.ts` | `sync-push.integration.test.mjs` | DELETE route test |
| `routes/import.test.ts` | `import.integration.test.mjs` | DELETE route test |
| `routes/tax-rates.test.ts` | `tax-rates.integration.test.mjs` | DELETE route test |

### API Lib vs Integration Tests (SELECTIVE)

| Lib Test | Integration Test | Action |
|----------|-----------------|--------|
| `lib/cogs-posting.test.ts` | `cogs-posting.integration.test.mjs` | **KEEP BOTH** - COGS critical |
| `lib/sales.test.ts` | `sales.integration.test.mjs` | DELETE lib test |
| `lib/cash-bank.test.ts` | `cash-bank.integration.test.mjs` | DELETE lib test |
| `lib/recipe-composition.test.ts` | `recipe-composition.integration.test.mjs` | DELETE lib test |

### Expected Deletions: ~15-20 tests

---

## Migration Checklist

### Move to `__test__/unit/` (TRUE UNIT)
- [ ] API: `date-helpers.test.ts`
- [ ] API: `retry.test.ts`
- [ ] API: `cost-tracking.unit.test.ts`
- [ ] API: `metrics/metrics.test.ts`
- [ ] API: `metrics/dashboard-metrics.test.ts`
- [ ] auth: 3 unit tests
- [ ] db: 2 unit tests
- [ ] modules/accounting: 1 unit test
- [ ] modules/reservations: 2 unit tests
- [ ] modules/treasury: 3 unit tests
- [ ] pos-sync: 1 unit test
- [ ] shared: 1 unit test
- [ ] sync-core: 2 unit tests
- [ ] telemetry: 6 unit tests

### Move to `__test__/integration/`
- [ ] API: All 26 route tests (then DELETE)
- [ ] API: All 53 lib integration tests
- [ ] API: All 41 existing integration tests (from `tests/integration/`)
- [ ] auth: 4 integration tests
- [ ] modules/platform: 1 integration test
- [ ] notifications: 3 integration tests
- [ ] pos-sync: 2 integration tests
- [ ] sync-core: 1 integration test

### DELETE (after verifying integration tests cover same)
- [ ] ~15-20 overlapping tests (see Duplicates section above)
