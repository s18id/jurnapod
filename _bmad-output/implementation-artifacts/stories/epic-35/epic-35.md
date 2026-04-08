# Epic 35: Route Library Extraction + Kysely Compliance

## Status

**in-progress**

## Epic Goal

Extract all route business logic to domain packages, replacing raw SQL with Kysely query builder calls. Resolve 27 lint violations across 12 route files per ADR-0012 (Library-First Architecture) and ADR-0009 (Kysely Type-Safe Query Builder).

## Background

Epic 12 established Library-First Architecture (ADR-0012), but 27 lint violations remain in API routes. These violations indicate routes are doing direct database access instead of delegating to package library functions.

Additionally, ADR-0009 establishes Kysely as the query builder standard. New queries and migrated queries should use Kysely's typed query builder (`selectFrom()`, `insertInto()`, `updateTable()`, `deleteFrom()`) with raw SQL preserved only for financial-critical aggregations.

## Scope

This epic covers 12 route files with 27 total lint violations:

| Route | Package | Violations |
|-------|---------|------------|
| `accounts.ts` | `@jurnapod/modules-accounting` | 2 |
| `companies.ts` | `@jurnapod/modules-platform` | 1 |
| `outlets.ts` | `@jurnapod/modules-platform` | 1 |
| `admin-runbook.ts` | `@jurnapod/modules-platform` | 1 |
| `admin-dashboards/reconciliation.ts` | `@jurnapod/modules-reporting` | 2 |
| `admin-dashboards/trial-balance.ts` | `@jurnapod/modules-reporting` | 4 |
| `audit.ts` | `@jurnapod/modules-reporting` | 5 |
| `cash-bank-transactions.ts` | `@jurnapod/modules-treasury` | 4 |
| `reports.ts` | `@jurnapod/modules-reporting` | 1 |
| `sales/invoices.ts` | `@jurnapod/modules-sales` | 3 |
| `sales/orders.ts` | `@jurnapod/modules-sales` | 3 |
| `sales/payments.ts` | `@jurnapod/modules-sales` | 2 |

## Cross-Cutting Concerns

1. **Kysely Query Builder**: All extracted queries must use Kysely's typed query builder
2. **Raw SQL Preservation**: Complex GL aggregations and financial-critical queries may preserve raw SQL per ADR-0009
3. **Tenant Isolation**: All queries must enforce `company_id` scoping
4. **Adapter Shim Cleanup**: Delete adapter shims in `apps/api/src/lib/{domain}/` after route migration
5. **Lint Gate**: `npm run lint -w @jurnapod/api` must pass with 0 errors

## Stories

- [Story 35.1](story-35.1.md): Extract accounts.ts to modules-accounting
- [Story 35.2](story-35.2.md): Extract companies.ts, outlets.ts, admin-runbook.ts to modules-platform
- [Story 35.3](story-35.3.md): Extract admin-dashboards/*, audit.ts, reports.ts to modules-reporting
- [Story 35.4](story-35.4.md): Extract cash-bank-transactions.ts to modules-treasury
- [Story 35.5](story-35.5.md): Extract sales/invoices.ts, orders.ts, payments.ts to modules-sales
- [Story 35.6](story-35.6.md): Final lint validation

## Definition of Done

- [ ] `npm run lint -w @jurnapod/api` passes with 0 errors
- [ ] `npm run typecheck -w @jurnapod/api` passes
- [ ] `npm run build -w @jurnapod/api` succeeds
- [ ] All adapter shims deleted from `apps/api/src/lib/{domain}/`
- [ ] All routes import from package libraries, not direct DB access
