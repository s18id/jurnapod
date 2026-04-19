# Story 47.1 — AP↔GL Reconciliation Summary — Completion Report

## Story
- **ID:** 47.1
- **Title:** AP↔GL Reconciliation Summary
- **Epic:** 47 — AP Reconciliation & Period Close Controls
- **Status:** ✅ DONE

---

## Implementation Summary

- Canonical route namespace enforced: `/api/purchasing/reports/ap-reconciliation/*`
- Settings contract enforced with fail-closed behavior:
  - unresolved settings return `409 AP_RECONCILIATION_SETTINGS_REQUIRED`
  - compatibility bridge to `purchasing_default_ap_account_id` remains explicit
- Account-set ownership validation enforced per `company_id`
- Timezone precedence enforced for cutoff behavior: `outlet.timezone -> company.timezone` (no UTC fallback)
- FX semantics enforced: `base = original * rate` (scaled math)
- ACL mapping hardened:
  - settings read/write: `accounting.accounts` + `MANAGE`
  - summary read: `purchasing.reports` + `ANALYZE`

---

## Test & Validation Evidence

- `__test__/integration/purchasing/ap-reconciliation.test.ts` → ✅ 21/21
- `__test__/integration/purchasing` subset → ✅ 188/188
- `npm run build -w @jurnapod/shared` → ✅
- `npm run typecheck -w @jurnapod/api` → ✅

---

## Files Changed (B1 scope)

- `apps/api/src/routes/purchasing/reports/ap-reconciliation.ts`
- `apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts`

---

## Review Gate Result

- `@bmad-review` B1 gate: ✅ PASS (no unresolved P0/P1 in B1 package)
