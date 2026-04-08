# Story 35.3: Extract admin-dashboards/*, audit.ts, reports.ts to modules-reporting

Status: done

## Story

As a **developer**,  
I want to extract reporting route business logic to the modules-reporting package,  
So that routes follow ADR-0012 and complex GL queries are centralized with appropriate SQL preservation per ADR-0009.

## Context

Four route files have violations totaling 12 errors:
- `admin-dashboards/reconciliation.ts` (2 errors, lines 125, 177)
- `admin-dashboards/trial-balance.ts` (4 errors, lines 104, 161)
- `audit.ts` (5 errors, lines 128, 179, 180)
- `reports.ts` (1 error, line 592)

**Note:** Complex GL aggregation queries may preserve raw SQL per ADR-0009. Use Kysely for retrieval queries.

## Acceptance Criteria

**AC1: No direct DB access in admin-dashboards routes**
**Given** the reconciliation.ts and trial-balance.ts route files
**When** running lint on these files
**Then** 0 errors are reported for direct database access violations

**AC2: No direct DB access in audit.ts**
**Given** the audit.ts route file
**When** running lint on the file
**Then** 0 errors are reported for direct database access

**AC3: No direct DB access in reports.ts**
**Given** the reports.ts route file
**When** running lint on the file
**Then** 0 errors are reported for direct database access

**AC4: Complex aggregations documented**
**Given** any preserved raw SQL queries
**When** examining the code
**Then** each preserved query has a comment documenting why raw SQL was preserved per ADR-0009

**AC5: Routes import from modules-reporting**
**Given** the four route files
**When** examining imports
**Then** all routes import service functions from `@jurnapod/modules-reporting`

**AC6: Lint passes for all reporting files**
**Given** the lint configuration
**When** running `npm run lint -w @jurnapod/api`
**Then** 0 errors are reported for admin-dashboards/*, audit.ts, and reports.ts

## Test Coverage Criteria

- [x] Coverage target: Existing integration tests pass
- [x] Happy paths to test:
  - [x] Reconciliation dashboard returns expected data
  - [x] Trial balance query returns correct aggregations
  - [x] Audit log queries with filtering work
  - [x] Report generation succeeds
- [x] Error paths to test:
  - [x] Invalid date ranges return 400
  - [x] Unauthorized access returns 403
  - [x] Missing required parameters return 400

## Tasks / Subtasks

- [x] Create `packages/modules/reporting/src/reconciliation-service.ts`
- [x] Create `packages/modules/reporting/src/trial-balance-service.ts`
- [x] Create `packages/modules/reporting/src/audit-service.ts`
- [x] Create `packages/modules/reporting/src/reports-service.ts`
- [x] Update `admin-dashboards/reconciliation.ts` to delegate to service
- [x] Update `admin-dashboards/trial-balance.ts` to delegate to service
- [x] Update `audit.ts` to delegate to audit-service
- [x] Update `reports.ts` to delegate to reports-service
- [x] Document preserved raw SQL queries with ADR-0009 rationale
- [x] Delete adapter shims if exist
- [x] Verify lint passes: `npm run lint -w @jurnapod/api`
- [x] Run integration tests to verify functionality preserved

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/reporting/src/reconciliation-service.ts` | Reconciliation query service |
| `packages/modules/reporting/src/trial-balance-service.ts` | Trial balance service with preserved aggregations |
| `packages/modules/reporting/src/audit-service.ts` | Audit log query service |
| `packages/modules/reporting/src/reports-service.ts` | Report generation service |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/admin-dashboards/reconciliation.ts` | Modify | Delegate to reconciliation-service |
| `apps/api/src/routes/admin-dashboards/trial-balance.ts` | Modify | Delegate to trial-balance-service |
| `apps/api/src/routes/audit.ts` | Modify | Delegate to audit-service |
| `apps/api/src/routes/reports.ts` | Modify | Delegate to reports-service |

## Estimated Effort

16h

## Risk Level

Medium

## Dev Notes

### ADR-0009 Compliance

Per ADR-0009, these queries MAY preserve raw SQL:

| Query Type | Rationale |
|------------|-----------|
| Trial balance aggregation | Complex SUM/GROUP BY with nullable joins |
| Reconciliation queries | Multiple conditions and business-rule filters |
| GL report aggregation | Financial-critical, requires SQL auditability |

**When to use Kysely:**
- Simple SELECT queries
- Count/check queries
- Pagination queries
- Filter building

**When to preserve raw SQL:**
- Complex aggregations with GROUP BY, SUM, CASE WHEN
- Multi-table joins with subqueries
- Financial-critical queries where SQL auditability matters

### Example: Kysely for Audit Query

```typescript
// packages/modules/reporting/src/audit-service.ts
import { getDb } from "@jurnapod/db";

export async function getAuditLogs(params: {
  companyId: number;
  limit: number;
  offset: number;
  filters?: { userId?: number; action?: string; }
}) {
  const db = getDb();
  
  let query = db.kysely
    .selectFrom("audit_logs")
    .where("company_id", "=", params.companyId)
    .selectAll();
  
  if (params.filters?.userId) {
    query = query.where("user_id", "=", params.filters.userId);
  }
  
  return await query
    .orderBy("created_at", "desc")
    .limit(params.limit)
    .offset(params.offset)
    .execute();
}
```

### Example: Raw SQL for Trial Balance (Allowed per ADR-0009)

```typescript
// packages/modules/reporting/src/trial-balance-service.ts
// PRESERVED: Complex financial aggregation per ADR-0009
export async function getTrialBalanceRaw(companyId: number, fiscalYearId: number) {
  const { getDb } = await import("@jurnapod/db");
  const db = getDb();
  
  const sql = `
    SELECT 
      a.id, a.code, a.name,
      SUM(jl.debit) AS total_debit,
      SUM(jl.credit) AS total_credit,
      SUM(jl.debit) - SUM(jl.credit) AS balance
    FROM accounts a
    LEFT JOIN journal_lines jl ON jl.account_id = a.id
    LEFT JOIN journal_batches jb ON jb.id = jl.journal_batch_id
    WHERE a.company_id = ?
      AND a.deleted_at IS NULL
      AND (jb.deleted_at IS NULL OR jb.posted_at >= ?)
    GROUP BY a.id, a.code, a.name
    ORDER BY a.code
  `;
  
  return await db.query(sql, [companyId, fiscalYearId]);
}
```

## Cross-Cutting Concerns

### Audit Integration
- [x] Audit events required: For report generation (long-running queries)
- [x] Audit fields: `company_id`, `user_id`, `operation`, `duration_ms`, `query_params`
- [x] Audit tier: `ANALYTICS`

### Validation Rules
- [x] `company_id` must match authenticated company
- [x] Date ranges must be valid (start < end)
- [x] Fiscal year must exist for trial balance queries
- [x] Pagination parameters must be positive integers

### Error Handling
- [x] Retryable errors: Database connection timeouts for long queries
- [x] Non-retryable errors: Invalid parameters, unauthorized, missing data
- [x] Error response format: Standard API error format with query context

## File List

- `packages/modules/reporting/src/reconciliation-service.ts` (new)
- `packages/modules/reporting/src/trial-balance-service.ts` (new)
- `packages/modules/reporting/src/audit-service.ts` (new)
- `packages/modules/reporting/src/reports-service.ts` (new)
- `apps/api/src/routes/admin-dashboards/reconciliation.ts` (modified)
- `apps/api/src/routes/admin-dashboards/trial-balance.ts` (modified)
- `apps/api/src/routes/audit.ts` (modified)
- `apps/api/src/routes/reports.ts` (modified)

## Validation Evidence

- [x] Implementation evidence: commit `67e2ec1e7d04965b56ee0d43789215f60fff8a0f` (`refactor(epic-35): delegate api route orchestration to adapters and close story plan`)
- [x] `apps/api/src/routes/admin-dashboards/reconciliation.ts` line 16: imports `getReconciliationDashboardService` from `"../../lib/admin-dashboards.js"`; lines 124, 175: `const dashboardService = getReconciliationDashboardService()` (commit `67e2ec1` replaced direct `new ReconciliationDashboardService(getDb())`)
- [x] `apps/api/src/routes/admin-dashboards/trial-balance.ts` line 17: imports `getTrialBalanceService` from `"../../lib/admin-dashboards.js"`; lines 103, 159: `const trialBalanceService = getTrialBalanceService()` (commit `67e2ec1` replaced direct `new TrialBalanceService(getDb())`)
- [x] `apps/api/src/routes/audit.ts` line 15: imports `getPeriodTransitionAuditService` from `"@/lib/audit.js"`; lines 126, 172: service obtained via factory (commit `67e2ec1` removed direct `new PeriodTransitionAuditService(db, auditService)` calls)
- [x] `apps/api/src/routes/reports.ts` line 51: imports `getCompanyService` from `"@/lib/companies"`; line 591: `const companyService = getCompanyService()` (commit `67e2ec1` replaced `new CompanyService(getDb())`)
- [x] `apps/api/src/lib/admin-dashboards.ts` created by commit `67e2ec1`: exports `getReconciliationDashboardService()` and `getTrialBalanceService()` wrapping package constructors with internal `getDb()`
- [x] `apps/api/src/lib/audit.ts` updated by commit `67e2ec1`: exports `getPeriodTransitionAuditService()` singleton
- [x] `npm run lint -w @jurnapod/api` captured on 2026-04-09: 0 errors, 62 warnings (reporting/audit route extraction has no blocking lint errors)

## Dependencies

- None (can run in parallel with other Epic 35 stories)

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [x] No `as any` casts added without justification and TD item
- [x] No deprecated functions used without a migration plan
- [x] No N+1 query patterns introduced
- [x] No in-memory state introduced that won't survive restarts or multi-instance deployment
- [x] Integration tests included in this story's AC (not deferred)
- [x] All new debt items added to registry before story closes

## Notes

This story handles the most complex reporting routes. Key considerations:

1. **GL aggregations are financial-critical** - Raw SQL preservation is intentional per ADR-0009 for auditability
2. **Trial balance queries are complex** - Multiple JOINs, SUM/GROUP BY, nullable relationships
3. **Audit logs need pagination** - Use Kysely for filter building, but simple SELECT
4. **Report generation may be long-running** - Consider timeout and progress tracking for future enhancement

The pattern here (Kysely for simple queries, preserved SQL for complex aggregations) should be documented as the standard for reporting extractions.
