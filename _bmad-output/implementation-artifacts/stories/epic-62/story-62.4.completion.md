# Story 62.4 Completion Report: Projection READ-Only Boundary + ACL Enforcement

**Status:** done
**Date:** 2026-05-10
**Reviewer:** bmad-code-review

---

## AC Evidence

| AC | Description | Evidence |
|----|-------------|----------|
| AC1 | No reporting route writes to financial tables | Audit: zero INSERT/UPDATE/DELETE in all `/reports/*`, `/purchasing/reports/*` routes ✅ |
| AC2 | Tenant isolation on all projection queries | `tenant-isolation-projection.test.ts` — 10 tests: CASHIER 403 (AR/AP/GL/cash-bank), OWNER cross-company, 401 unauth |
| AC3 | requireAccess() with resource on all routes | Audit: all routes use explicit `resource` parameter, no legacy module-only ✅ |
| AC4 | No projection logic outside canonical packages | Audit: routes are thin adapters, logic in `@jurnapod/modules-reporting` ✅ |
| AC5 | Negative tenant isolation tests | CASHIER 403 + OWNER cross-company + 401 — all pass ✅ |
| AC6 | DECIMAL precision — no FLOAT/DOUBLE | Audit: zero FLOAT/DOUBLE in reporting code; monetary uses `toNumber()`; DB uses DECIMAL(18,2) ✅ |

## Files

| Action | File | Lines |
|--------|------|:---:|
| Created | `tenant-isolation-projection.test.ts` | 219 |

## Reviewer Sign-off
Code review GO — all audits clean.
