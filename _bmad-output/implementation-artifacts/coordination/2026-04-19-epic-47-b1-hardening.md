# Coordination: Epic 47 B1 — Story 47.1 Hardening

**Date:** 2026-04-19  
**Owner:** BMAD build agent  
**Implementation delegate:** `@bmad-dev`  
**Review delegate:** `@bmad-review`

## Objective
Close Story 47.1 hardening with no unresolved P0/P1 by enforcing canonical contract, ACL mapping, tenant scoping, cutoff semantics, and FX correctness.

## Scope Checklist

- [x] Canonical namespace consistency confirmed in API behavior (`/api/purchasing/reports/ap-reconciliation/*`)
- [x] ACL mapping enforced:
  - settings read/write: `accounting.accounts` + `MANAGE`
  - summary read: `purchasing.reports` + `ANALYZE`
- [x] Fail-closed behavior preserved when settings unresolved
- [x] Tenant ownership validation preserved for configured account IDs
- [x] Timezone precedence enforced (`outlet.timezone` -> `company.timezone`, no UTC fallback)
- [x] FX semantics validated (`base = original * rate`, effective rate on transaction date)
- [x] Integration tests updated/passing
- [x] `npm run build -w @jurnapod/shared` passing
- [x] `npm run typecheck -w @jurnapod/api` passing

## Guardrails

- **P0:** No FX semantic regression
- **P1:** No cross-tenant leakage
- **P1:** No ACL weakening or ambiguous resource mapping
- **P1:** No UTC fallback in business cutoff logic

## Evidence Required

- Target reconciliation integration test output
- Purchasing integration subset output
- Shared build output
- API typecheck output
- File diff summary

## Gate

- `@bmad-review` must return PASS with no unresolved P0/P1 before moving to B2A/B2B.
- **Result (2026-04-19):** ✅ PASS for B1 scope (no unresolved P0/P1 in B1 package).
