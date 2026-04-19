# Coordination: Epic 47 B2A — Story 47.2 Drilldown & Variance Attribution

**Date:** 2026-04-19  
**Owner:** BMAD build agent  
**Implementation delegate:** `@bmad-dev`  
**Review delegate:** `@bmad-review`

## Objective
Implement Story 47.2 drilldown, GL-detail, AP-detail, and variance attribution aligned to canonical namespace and ACL.

## Scope Checklist

- [ ] Drilldown endpoint implemented: `GET /api/purchasing/reports/ap-reconciliation/drilldown`
- [ ] GL detail endpoint implemented: `GET /api/purchasing/reports/ap-reconciliation/gl-detail`
- [ ] AP detail endpoint implemented: `GET /api/purchasing/reports/ap-reconciliation/ap-detail`
- [ ] Variance categories implemented (timing, posting, missing, rounding)
- [ ] Deterministic matching via `source_id`/`source_type`
- [ ] Tenant scoping enforced on all joins/queries
- [ ] ACL enforced: `purchasing.reports` + `ANALYZE`
- [ ] Integration tests added/updated for attribution correctness
- [ ] Build/typecheck/test evidence collected

## Guardrails

- **P0:** No cross-tenant leakage in detail endpoints
- **P1:** Deterministic attribution output for same inputs
- **P1:** No mismatch with B1 cutoff/timezone semantics
- **P1:** No ACL weakening

## Evidence Required

- Target drilldown integration test output
- Purchasing integration subset output (at minimum reconciliation + drilldown paths)
- Shared build output
- API typecheck output
- File diff summary

## Gate

- `@bmad-review` must return PASS with no unresolved P0/P1 before moving to B3/B4.
