# Sprint Plan: Epic 35

> **Epic:** Route Library Extraction + Kysely Compliance  
> **Duration:** 2 sprints (~80h)  
> **Goal:** Extract all route business logic to domain packages, replacing raw SQL with Kysely query builder calls. Resolve 27 lint violations across 12 route files per ADR-0012 and ADR-0009.

---

## Package-First Design Checkpoint

This epic completes the library-first architecture enforcement (ADR-0012) that began in Epic 12. After this epic, all API routes will delegate to package libraries with no direct database access.

**Cross-Cutting Concerns:**
- All extracted queries must use Kysely query builder (`selectFrom()`, `insertInto()`, etc.)
- Raw SQL may be preserved only for financial-critical aggregations (GL, reconciliation, reports) per ADR-0009
- All queries must enforce `company_id` tenant scoping
- Adapter shims in `apps/api/src/lib/{domain}/` must be deleted after route migration

---

## Hard Prerequisite Gate

- [x] Epic 34 complete (Test Reorganization)

---

## Route Violation Summary

| Route File | Violation Type | Target Package |
|------------|---------------|----------------|
| `accounts.ts` | Direct DB access | `@jurnapod/modules-accounting` |
| `companies.ts` | Direct DB access | `@jurnapod/modules-platform` |
| `outlets.ts` | Raw SQL | `@jurnapod/modules-platform` |
| `admin-runbook.ts` | Raw SQL | `@jurnapod/modules-platform` |
| `admin-dashboards/reconciliation.ts` | Direct DB access | `@jurnapod/modules-reporting` |
| `admin-dashboards/trial-balance.ts` | Direct DB access | `@jurnapod/modules-reporting` |
| `audit.ts` | Direct DB access (3x) | `@jurnapod/modules-reporting` |
| `cash-bank-transactions.ts` | Service instantiation | `@jurnapod/modules-treasury` |
| `reports.ts` | Direct DB access | `@jurnapod/modules-reporting` |
| `sales/invoices.ts` | Direct DB access + service | `@jurnapod/modules-sales` |
| `sales/orders.ts` | Direct DB access + service | `@jurnapod/modules-sales` |
| `sales/payments.ts` | Direct DB access | `@jurnapod/modules-sales` |

**Total:** 27 lint errors across 12 route files

---

## Dependency Graph

```
Story 35.1    Story 35.2    Story 35.3    Story 35.4    Story 35.5
(accounts)    (platform)     (reporting)    (treasury)    (sales)
    │              │              │              │              │
    └──────────────┴──────────────┴──────────────┴──────────────┘
                                 │
                            Story 35.6
                         (Final Lint Validation)
```

---

## Sprint Breakdown

### Week 1

#### Story 35.1: Extract accounts.ts to modules-accounting
- **Estimate:** 8h
- **Priority:** P1
- **Dependencies:** None
- **Focus:**
  - Identify all `pool.execute()` calls in `apps/api/src/routes/accounts.ts`
  - Create `accounts-service.ts` in `@jurnapod/modules-accounting`
  - Convert raw SQL to Kysely `selectFrom()`/`updateTable()`/`deleteFrom()`
  - Update route to import from package
  - Delete adapter shim if exists in `apps/api/src/lib/accounting/`
  - Verify `npm run lint -w @jurnapod/api` passes

#### Story 35.2: Extract companies.ts, outlets.ts, admin-runbook.ts to modules-platform
- **Estimate:** 12h
- **Priority:** P1
- **Dependencies:** None
- **Focus:**
  - Extract `companies.ts` queries to `companies-service.ts` in modules-platform
  - Extract `outlets.ts` raw SQL to Kysely in `outlets-service.ts`
  - Extract `admin-runbook.ts` raw SQL to Kysely in `runbook-service.ts`
  - Update all three routes to import from package
  - Delete adapter shims in `apps/api/src/lib/`
  - Verify lint passes

#### Story 35.3: Extract admin-dashboards/*, audit.ts, reports.ts to modules-reporting
- **Estimate:** 16h
- **Priority:** P1
- **Dependencies:** None
- **Focus:**
  - Extract `reconciliation.ts` and `trial-balance.ts` queries
  - Extract `audit.ts` queries (3 violation points)
  - Extract `reports.ts` queries
  - Preserve raw SQL for complex GL aggregations per ADR-0009
  - Use Kysely for retrieval queries
  - Delete adapter shims
  - Verify lint passes

### Week 2

#### Story 35.4: Extract cash-bank-transactions.ts to modules-treasury
- **Estimate:** 8h
- **Priority:** P1
- **Dependencies:** None
- **Focus:**
  - Move `createCashBankService()` factory to `@jurnapod/modules-treasury`
  - Extract direct DB access to treasury library functions
  - Update route to import from package
  - Verify lint passes

#### Story 35.5: Extract sales/invoices.ts, orders.ts, payments.ts to modules-sales
- **Estimate:** 16h
- **Priority:** P1
- **Dependencies:** None
- **Focus:**
  - Move `createInvoiceService()` and `createOrderService()` to modules-sales
  - Extract all direct DB access in invoices, orders, payments routes
  - Convert retrieval queries to Kysely
  - Preserve raw SQL for sales aggregations if any
  - Delete adapter shims
  - Verify lint passes

#### Story 35.6: Final Lint Validation
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 38.1, 38.2, 38.3, 38.4, 38.5
- **Focus:**
  - Run full `npm run lint -w @jurnapod/api`
  - Verify 0 errors across all workspaces
  - Run `npm run typecheck -w @jurnapod/api`
  - Verify `npm run build -w @jurnapod/api` succeeds
  - Update epic index to "done"

---

## Kysely Migration Pattern Reference

**Convert raw SQL to Kysely:**
```typescript
// BEFORE (raw SQL - flagged by lint)
const [rows] = await pool.execute(
  "SELECT * FROM accounts WHERE company_id = ? AND id = ?",
  [companyId, accountId]
);

// AFTER (Kysely query builder - typed and safe)
const row = await db
  .selectFrom("accounts")
  .selectAll()
  .where("company_id", "=", companyId)
  .where("id", "=", accountId)
  .executeTakeFirst();
```

**When to preserve raw SQL:**
- Complex GL aggregations with GROUP BY, SUM, CASE WHEN
- Reconciliation queries with multiple nullable joins
- Financial-critical operations where SQL readability matters

**When to use Kysely:**
- Simple CRUD operations
- Count/check queries
- Retrieval with filters
- Dynamic filter building

---

## Definition of Done

- [ ] `npm run lint -w @jurnapod/api` passes with 0 errors
- [ ] `npm run typecheck -w @jurnapod/api` passes
- [ ] `npm run build -w @jurnapod/api` succeeds
- [ ] All adapter shims deleted from `apps/api/src/lib/{domain}/`
- [ ] All routes import from package libraries, not direct DB access
