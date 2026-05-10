# Story 62.4: Projection READ-Only Boundary + ACL Enforcement

**Status:** ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 62 --story 62-4 --title projection-read-only-boundary-acl-enforcement --status done`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **security auditor**,
I want **the projection layer to have READ authority only with no write-path to financial tables, and full tenant isolation on all projection queries**,
so that **the read-model boundary is enforced and tenant data leakage is impossible**.

## Context

- **Source:** Epic 62 (FR2, FR6) — Projection Correctness Hardening
- **Predecessor:** Story 62.1 (boundary map establishes which tables each projection reads)
- **Scope:** All reporting routes in `apps/api/src/routes/`, `packages/modules/reporting`
- **Risk:** P0 (security) — write-path from projections would corrupt source-of-truth; tenant leakage violates data isolation

## Acceptance Criteria

**AC1: No reporting route writes to financial tables**
**Given** all registered reporting routes (`/reports/*`, `/purchasing/reports/*`, etc.),
**When** each route is audited for write-side effects,
**Then** no route executes `INSERT`, `UPDATE`, or `DELETE` against `sales_invoices`, `purchase_invoices`, `journal_lines`, `journal_batches`, `inventory_cost_layers`, `accounts`, `cash_bank_transactions`,
**And** the audit evidence is committed to this story file.

**AC2: Tenant isolation enforced on all projection queries**
**Given** a user authenticated for Company A,
**When** any reporting endpoint is called without Company A's `company_id` scope,
**Then** data from Company B is never returned,
**And** cross-tenant access returns 404 or empty results.

**AC3: `requireAccess()` with `resource` parameter on all reporting routes**
**Given** the ACL model (Epic 39),
**When** any reporting route is audited,
**Then** every route uses `requireAccess()` with explicit `resource` parameter (e.g., `accounting.reports`, `purchasing.reports`),
**And** no reporting route uses module-only permissions without `resource`.

**AC4: No projection logic exists outside canonical packages**
**Given** the reporting codebase,
**When** a code audit is performed,
**Then** all projection domain logic resides in `packages/modules/reporting` or `packages/modules/purchasing`,
**And** `apps/api/src/routes/` contains only thin adapter routes (authentication, parameter extraction, delegation).

**AC5: Negative tenant isolation tests for all projection endpoints**
**When** integration tests are run,
**Then** each projection endpoint has a negative test proving that Company A's token cannot access Company B's data,
**And** these tests use CASHIER or custom low-privilege roles (not OWNER/SUPER_ADMIN).

**AC6: Projected monetary values use DECIMAL precision — never FLOAT/DOUBLE**
**Given** all projection/reporting code paths,
**When** a precision audit is performed,
**Then** no monetary computation uses FLOAT, DOUBLE, or unrounded JavaScript number arithmetic,
**And** all monetary columns use DECIMAL(18,4) or DECIMAL(19,4) at the DB layer,
**And** all monetary calculations in TypeScript use bigint (scaled) or DECIMAL string representations,
**And** violation evidence is documented in story completion notes. (covers NFR5)

## Tasks / Subtasks

- [ ] Task 1: Route audit — read-only verification (AC: 1)
  - [ ] 1.1 Audit all `/reports/*` routes for write-side effects
  - [ ] 1.2 Audit `/purchasing/reports/*` routes for write-side effects
  - [ ] 1.3 Audit admin dashboard read-model helpers for write-side effects
  - [ ] 1.4 Document audit results in story completion notes
- [ ] Task 2: ACL enforcement audit (AC: 3)
  - [ ] 2.1 Verify `requireAccess()` with `resource` on all reporting routes
  - [ ] 2.2 Identify any routes using module-only (legacy) permissions
  - [ ] 2.3 Fix any non-compliant routes
- [ ] Task 3: Tenant isolation integration tests (AC: 2, 5)
  - [ ] 3.1 Create `apps/api/__test__/integration/reporting/tenant-isolation-projection.test.ts`
  - [ ] 3.2 Cross-tenant test for AR aging (Company A token → Company B data → 404/empty)
  - [ ] 3.3 Cross-tenant test for AP aging
  - [ ] 3.4 Cross-tenant test for GL trial balance
  - [ ] 3.5 Cross-tenant test for daily sales
  - [ ] 3.6 Use CASHIER role for negative tests (not OWNER)
- [ ] Task 4: Code location audit (AC: 4, 6)
  - [ ] 4.1 Audit `apps/api/src/lib/` for projection/logic that should be in packages
  - [ ] 4.2 Flag any non-thin adapter code in routes
  - [ ] 4.3 Audit monetary precision: scan for FLOAT, DOUBLE, Number() without rounding in reporting code
  - [ ] 4.4 Verify DECIMAL column types on source-of-truth tables used by projections
  - [ ] 4.5 Document precision audit results in story completion notes

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/__test__/integration/reporting/tenant-isolation-projection.test.ts` | Cross-tenant isolation tests for all projection endpoints |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/reports.ts` | Audit | Verify thin adapter pattern, `requireAccess()` compliance |
| `apps/api/src/routes/purchasing/reports/ap-aging.ts` | Audit | Same |
| Any route lacking `resource` parameter | Fix | Add explicit `resource` to `requireAccess()` calls |

## Estimated Effort

1.5 days

## Risk Level

P0 (security) — Projection write-paths would corrupt source-of-truth. Tenant leakage is a data breach.

## Dev Notes

### Projections to audit for read-only

| Projection | Route | Source Tables |
|-----------|-------|---------------|
| AR Aging | `GET /reports/receivables-ageing` | `sales_invoices`, `customers`, `outlets` |
| AP Aging | `GET /purchasing/reports/ap-aging` | `purchase_invoices`, `ap_payments`, `purchase_credits`, `suppliers` |
| GL Trial Balance | `GET /reports/trial-balance` | `journal_lines`, `accounts` |
| GL General Ledger | `GET /reports/general-ledger` | `journal_lines`, `journal_batches`, `accounts` |
| GL P&L | `GET /reports/profit-loss` | `journal_lines`, `accounts` |
| GL Balance Sheet | `GET /reports/worksheet` | `journal_lines`, `accounts` |
| Daily Sales | `GET /reports/daily-sales` | `pos_transactions` |
| Cash/Bank | `GET /cash-bank/...` | `cash_bank_transactions` |

### Required ACL permissions per endpoint

| Projection | Module.Resource | Permission |
|-----------|-----------------|------------|
| AR Aging, GL reports | `accounting.reports` | `ANALYZE` (16) |
| AP Aging | `purchasing.reports` | `ANALYZE` (16) |
| Daily Sales | `sales.reports` | `ANALYZE` (16) |
| Cash/Bank | `treasury.transactions` | `READ` (1) |

### Negative test pattern

```typescript
// Company A token, Company B data → 404 or empty
const resA = await fetch(`${baseUrl}/api/reports/receivables-ageing?company_id=${companyB.id}`, {
  headers: { 'Authorization': `Bearer ${tokenA}` }
});
expect([404, 403]).toContain(resA.status);
```

## Dependencies

- Story 62.1 — boundary map identifies all projection endpoints
- Epic 39 ACL model — `requireAccess()` with `resource` parameter

---

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
