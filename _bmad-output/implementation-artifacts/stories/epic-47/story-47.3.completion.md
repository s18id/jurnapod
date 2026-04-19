# Story 47.3 Completion — Supplier Statement Matching (Manual Entry MVP)

**Story:** 47.3  
**Epic:** 47  
**Closed:** 2026-04-19  
**Status:** done

---

## Summary

Delivered a manual supplier statement entry and reconciliation MVP for AP reconciliation. Users can input supplier statement balances per supplier per date and compare them against the AP subledger balance as of the same date.

---

## What Was Built

### Endpoints
| Method | Path | ACL |
|--------|------|-----|
| POST | `/api/purchasing/supplier-statements` | CREATE |
| GET | `/api/purchasing/supplier-statements` | ANALYZE |
| GET | `/api/purchasing/supplier-statements/:id/reconcile` | ANALYZE |
| PUT | `/api/purchasing/supplier-statements/:id/reconcile` | UPDATE |

### Files Created/Modified
| File | Change |
|------|--------|
| `packages/db/migrations/0187_supplier_statements.sql` | New migration for `supplier_statements` table |
| `apps/api/src/lib/purchasing/supplier-statements.ts` | Service: create/list/reconcile/mark-reconciled |
| `apps/api/src/routes/purchasing/supplier-statements.ts` | Thin route adapters |
| `apps/api/src/routes/purchasing/index.ts` | Route registration |
| `apps/api/src/lib/test-fixtures.ts` | Added `createTestSupplierStatement` fixture |
| `apps/api/__test__/integration/purchasing/supplier-statements.test.ts` | 34 integration tests |
| `packages/shared/src/schemas/purchasing.ts` | Added `SupplierStatementCreateSchema`, `ReconcileQuerySchema`, etc. |
| `packages/shared/src/constants/purchasing.ts` | Added `SUPPLIER_STATEMENT_STATUS` constants |

---

## Key Design Decisions

1. **ACL POST = CREATE** — Despite early story draft using ANALYZE, implementation uses CREATE to enforce proper write authorization on statement creation. Story AC1 updated accordingly.

2. **Transaction-date FX basis** — Exchange rate conversion uses each invoice's transaction-level rate and date (not statement-date revaluation). Documented in code; aligns with how AP invoices are posted.

3. **Full-day credit application cutoff** — Credit applications are filtered by `pca.applied_at < nextDay(asOfDate)` for full-day inclusive semantics without wrapping indexed columns.

4. **Sign-aware half-up rounding** — Both `computeBaseAmount` and `convertBaseToCurrency` use symmetric half-up rounding for negative amounts, avoiding positive-only bias.

5. **Race-safe duplicate detection** — Statement creation relies on DB unique key `(company_id, supplier_id, statement_date)` with `ER_DUP_ENTRY` catch, not pre-check SELECT.

---

## Guardrail Wave Fixes

### Wave 1 (P0/P1 gate fixes)
- Fixed `createTestSupplierStatement` schema drift (`currency` → `currency_code`)
- Replaced 3 raw SQL test setup inserts with canonical fixture
- Fixed ACL ANALYZE → CREATE for POST
- Fixed negative closing_balance schema rejection

### Wave 2 (P1 financial correctness)
- Fixed `computeBaseAmount` sign-aware rounding
- Fixed same-day credit application boundary (`pca.applied_at < nextDay(asOfDate)`)
- Added CASHIER-negative test for PUT reconcile

---

## Validation Evidence

| Check | Result | Log |
|-------|--------|-----|
| Integration tests | **34/34 passed** | `logs/story-47.3-guardrail-wave2-test.log` |
| TypeScript | **pass** | `logs/story-47.3-guardrail-wave2-typecheck.log` |
| `@bmad-review` gate | **No P0/P1 blockers** | |

---

## Review Decisions

| Finding | Decision | Rationale |
|---------|----------|-----------|
| POST ACL = ANALYZE vs CREATE | **CREATE** (changed) | Write operations should require CREATE permission; ANALYZE is for reads/reports |
| FX conversion basis | **Keep transaction-date** | Matches how invoices are posted; subledger reflects historical recorded amounts |
| Credit application cutoff | **Full-day inclusive via `nextDay()`** | Aligns with DATE-based invoice/payment filters; index-safe |

---

## Remaining Work

- **Epic 47.4** — AP Exception Worklist (disputed transactions drill-down)
- **Epic 47.5** — Period Close Guardrails for AP
- **Epic 47.6** — Reconciliation Snapshot Audit Trail

---

## Deferred Items (P2/P3)

| Item | Severity | Note |
|------|----------|------|
| `ap.payment_date` may have same DATE-vs-DATETIME boundary issue | P2 | `payment_date` column type not confirmed; may need same `nextDay()` treatment |
| `pi.invoice_date` same consideration | P2 | Column type not confirmed |
| `nextDay()` DST edge case | P3 | Pure string-increment variant possible; current JS Date approach safe for non-DST Asia/Jakarta |
| `createTestSupplierStatement` registry integration | P3 | Helper doesn't call `registerFixtureCleanup()`; manual DELETE in afterAll sufficient for now |
