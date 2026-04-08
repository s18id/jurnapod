# Story 35.3: Extract admin-dashboards/*, audit.ts, reports.ts to modules-reporting

## Story Details

| Field | Value |
|-------|-------|
| **Epic** | Epic 35 |
| **Status** | pending |
| **Estimate** | 16h |
| **Priority** | P1 |
| **Dependencies** | None |

## Context

Three route files have violations totaling 6 errors:
- `admin-dashboards/reconciliation.ts` (2 errors, lines 125, 177)
- `admin-dashboards/trial-balance.ts` (2 errors, lines 104, 161)
- `audit.ts` (3 errors, lines 128, 179, 180)
- `reports.ts` (1 error, line 592)

**Note:** Complex GL aggregation queries may preserve raw SQL per ADR-0009. Use Kysely for retrieval queries.

## File-by-File Analysis

### 35.3.1: admin-dashboards/reconciliation.ts — Lines 125, 177

**Violation:** Direct database access at lines 125 and 177.

**Context:** Reconciliation queries typically involve complex GL joins.

**Fix:** 
- Extract retrieval logic to Kysely
- Preserve raw SQL for complex aggregation if needed per ADR-0009

### 35.3.2: admin-dashboards/trial-balance.ts — Lines 104, 161

**Violation:** Direct database access at lines 104 and 161.

**Context:** Trial balance queries aggregate GL data with SUM/GROUP BY.

**Fix:**
- Extract retrieval logic to Kysely
- Preserve raw SQL for complex aggregations

### 35.3.3: audit.ts — Lines 128, 179, 180

**Violation:** Direct database access at lines 128, 179, and 180.

**Context:** Audit log queries with filtering and pagination.

**Fix:** Extract to `audit-service.ts` using Kysely.

### 35.3.4: reports.ts — Line 592

**Violation:** Direct database access at line 592.

**Context:** Report data retrieval.

**Fix:** Extract to report-specific service in modules-reporting.

## ADR-0009 Compliance

Per ADR-0009, these queries MAY preserve raw SQL:

| Query Type | Rationale |
|------------|-----------|
| Trial balance aggregation | Complex SUM/GROUP BY with nullable joins |
| Reconciliation queries | Multiple conditions and business-rule filters |
| GL report aggregation | Financial-critical, requires SQL readability |

**When to use Kysely:**
- Simple SELECT queries
- Count/check queries  
- Pagination queries
- Filter building

**When to preserve raw SQL:**
- Complex aggregations with GROUP BY, SUM, CASE WHEN
- Multi-table joins with subqueries
- Financial-critical queries where SQL auditability matters

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/routes/admin-dashboards/reconciliation.ts` | Delegate to package |
| `apps/api/src/routes/admin-dashboards/trial-balance.ts` | Delegate to package |
| `apps/api/src/routes/audit.ts` | Delegate to package |
| `apps/api/src/routes/reports.ts` | Delegate to package |
| `packages/modules/reporting/src/reconciliation-service.ts` | Create |
| `packages/modules/reporting/src/trial-balance-service.ts` | Create |
| `packages/modules/reporting/src/audit-service.ts` | Create |
| `packages/modules/reporting/src/reports-service.ts` | Create |

## Acceptance Criteria

| # | Criteria | Verification |
|---|----------|--------------|
| 1 | No direct DB access in admin-dashboards routes | Lint passes |
| 2 | No direct DB access in audit.ts | Lint passes |
| 3 | No direct DB access in reports.ts | Lint passes |
| 4 | Complex aggregations use raw SQL (allowed) or Kysely | Document choice |
| 5 | Routes import from `@jurnapod/modules-reporting` | Import statements present |
| 6 | `npm run lint -w @jurnapod/api` passes for these files | 0 errors |

## Example: Kysely for Audit Query

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
  
  const results = await query
    .orderBy("created_at", "desc")
    .limit(params.limit)
    .offset(params.offset)
    .execute();
    
  return results;
}
```

## Example: Raw SQL for Trial Balance (Allowed per ADR-0009)

```typescript
// packages/modules/reporting/src/trial-balance-service.ts
// PRESERVED: Complex financial aggregation
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
  
  const results = await db.query(sql, [companyId, fiscalYearId]);
  return results;
}
```
