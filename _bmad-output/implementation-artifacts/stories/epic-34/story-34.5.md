# Story 34.5: Package Test Reorganization

## Overview

**Story:** Story 34.5: Package Test Reorganization  
**Epic:** Epic 34: Test Reorganization & Assessment  
**Estimate:** 8h  
**Priority:** P1

## Goal

Apply the `__test__/unit|integration` structure to all packages, moving tests from their current scattered locations to the canonical structure.

## Acceptance Criteria

1. All packages use `__test__/unit/` and `__test__/integration/` structure
2. Tests moved from old locations to new structure
3. Import paths updated in moved files
4. Vitest configs updated if needed

## Package-by-Package Plan

### packages/auth

| Current | Target | Count |
|---------|--------|-------|
| `src/passwords/hash.test.ts` | `__test__/unit/` | 1 |
| `src/rbac/roles.test.ts` | `__test__/unit/` | 1 |
| `src/tokens/access-tokens.test.ts` | `__test__/unit/` | 1 |
| `integration/email/tokens.integration.test.ts` | `__test__/integration/` | 1 |
| `integration/rbac/access-check.integration.test.ts` | `__test__/integration/` | 1 |
| `integration/throttle/login-throttle.integration.test.ts` | `__test__/integration/` | 1 |
| `integration/tokens/refresh-tokens.integration.test.ts` | `__test__/integration/` | 1 |

### packages/modules/accounting

| Current | Target | Count |
|---------|--------|-------|
| `src/posting.test.ts` | `__test__/unit/` | 1 |

### packages/modules/platform

| Current | Target | Count |
|---------|--------|-------|
| `src/sync/audit-service.integration.test.ts` | `__test__/integration/` | 1 |

### packages/modules/reservations

| Current | Target | Count |
|---------|--------|-------|
| `src/time/overlap.test.ts` | `__test__/unit/` | 1 |
| `src/time/timestamp.test.ts` | `__test__/unit/` | 1 |

### packages/modules/treasury

| Current | Target | Count |
|---------|--------|-------|
| `src/cash-bank-service.test.ts` | `__test__/unit/` | 1 |
| `src/helpers.test.ts` | `__test__/unit/` | 1 |
| `src/journal-builder.test.ts` | `__test__/unit/` | 1 |

### packages/notifications

| Current | Target | Count |
|---------|--------|-------|
| `tests/email-service.test.ts` | `__test__/integration/` | 1 |
| `tests/sendgrid.test.ts` | `__test__/integration/` | 1 |
| `tests/templates.test.ts` | `__test__/integration/` | 1 |

### packages/pos-sync

| Current | Target | Count |
|---------|--------|-------|
| `src/push/persist-push-batch.unit.test.ts` | `__test__/unit/` | 1 |
| `src/pos-sync-module.integration.test.ts` | `__test__/integration/` | 1 |
| `src/push/persist-push-batch.integration.test.ts` | `__test__/integration/` | 1 |

### packages/sync-core

| Current | Target | Count |
|---------|--------|-------|
| `src/idempotency/metrics-collector.test.ts` | `__test__/unit/` | 1 |
| `src/idempotency/sync-idempotency.test.ts` | `__test__/unit/` | 1 |
| `src/jobs/data-retention.integration.test.ts` | `__test__/integration/` | 1 |

### packages/shared

| Current | Target | Count |
|---------|--------|-------|
| `src/__tests__/table-reservation.test.ts` | `__test__/unit/` | 1 |

### packages/telemetry

| Current | Target | Count |
|---------|--------|-------|
| `src/__tests__/alert-config.test.ts` | `__test__/unit/` | 1 |
| `src/__tests__/correlation.test.ts` | `__test__/unit/` | 1 |
| `src/__tests__/labels.test.ts` | `__test__/unit/` | 1 |
| `src/__tests__/quality-gate.test.ts` | `__test__/unit/` | 1 |
| `src/__tests__/slo.test.ts` | `__test__/unit/` | 1 |
| `src/runtime/__tests__/alert-manager.test.ts` | `__test__/unit/` | 1 |

### apps/backoffice

| Current | Target | Count |
|---------|--------|-------|
| `src/**/*.test.ts` | `__test__/unit/` or `__test__/integration/` | ~12 |

## Deliverables

1. All packages restructured to use `__test__/unit/` and `__test__/integration/`
2. Updated import paths in all moved files
3. Updated vitest configs if not already done in Story 34.2

## Dependencies

- Story 34.2 (structure defined)

## Notes

- Packages with 0 tests (db, offline-db, modules/inventory, modules/inventory-costing, modules/reporting, modules/sales) don't need changes
- Run `npm run test -w @jurnapod/{pkg}` for each package after moving tests
