# Epic 47 Readiness — AP Reconciliation & Period Close Controls

**Date:** 2026-04-19
**Prepared by:** BMAD build agent
**Status:** Ready with blockers tracked

---

## 1) Retro Action Items Status (from Epic 46)

### ✅ Action Item 1 — Monetary Conversion Regression Guard
- Added/verified integration regression test in:
  - `apps/api/__test__/integration/purchasing/purchase-invoices.test.ts`
  - Test: `posts PI with non-IDR currency and verifies base amount = original * rate`
- Enforcement style: integration-level journal verification, not unit-only.

### ✅ Action Item 2 — Canonical Purchasing Fixtures
- Confirmed canonical helper in use:
  - `createTestPurchasingAccounts()`
- Added missing canonical helper:
  - `createTestPurchasingSettings(companyId, apAccountId, expenseAccountId)`
- Exported fixture helpers via:
  - `apps/api/__test__/fixtures/index.ts`

### ✅ P0 Fixture Policy Cleanups Completed
- Removed ad-hoc setup SQL where canonical fixture existed:
  - `ap-payments.test.ts` now uses canonical account fixtures
  - `goods-receipts.test.ts` now uses `createTestSupplier()`
  - `purchase-invoices.test.ts` FX regression setup removed ad-hoc account/company_modules/exchange-rate inserts in favor of canonical/API setup

Validation evidence:
- `npm run typecheck -w @jurnapod/api` ✅
- Purchasing integration subset ✅
  - `purchase-invoices.test.ts` 16/16
  - `ap-payments.test.ts` 27/27
  - `goods-receipts.test.ts` 21/21
  - Total 64/64

---

## 2) Epic 47 Story Dependency Map

| Story | Title | Depends On | Ready? |
|------|-------|------------|--------|
| 47.1 | AP↔GL Reconciliation Summary | Epic 46 complete | ⚠️ Needs reconciliation settings contract + fiscal-period table decision |
| 47.2 | Reconciliation Drilldown & Variance Attribution | 47.1 | ⏸️ Blocked by 47.1 |
| 47.3 | Supplier Statement Matching (Manual MVP) | 47.2 | ⚠️ Needs `supplier_statements` schema |
| 47.4 | AP Exception Worklist | 47.1, 47.2, 47.3 | ⚠️ Needs `ap_exceptions` schema |
| 47.5 | Period Close Guardrails for AP | Epic 32 + period status data | ⚠️ Needs fiscal period schema alignment |
| 47.6 | Reconciliation Snapshot & Audit Trail | 47.1–47.5 | ⏸️ Depends on earlier stories |

---

## 3) Schema/Contract Readiness Check

### Available now
- `fiscal_years` table available for fixture setup.
- `settings_strings` can store reconciliation config key/value for test setup (`ap_reconciliation_account_ids`).

### Blockers to resolve before implementing dependent stories
1. **`fiscal_periods` table missing**
   - Impacts Story 47.1 cutoff + Story 47.5 period-close guardrails.
2. **`supplier_statements` table missing**
   - Impacts Story 47.3.
3. **`ap_exceptions` table missing**
   - Impacts Story 47.4.

---

## 4) New Fixture Coverage Added for Epic 47

Added in `apps/api/src/lib/test-fixtures.ts`:
- `createTestFiscalYear(...)`
- `createTestFiscalPeriod(...)` *(throws clear schema-gap error until table exists)*
- `createTestAPReconciliationSettings(...)`
- `createTestSupplierStatement(...)` *(throws clear schema-gap error until table exists)*
- `createTestAPException(...)` *(throws clear schema-gap error until table exists)*

These functions make story-level setup deterministic and avoid ad-hoc SQL in tests.

---

## 5) Pre-Epic 47 Execution Plan

### Phase A — Story 47.1 enablement
1. Finalize AP reconciliation settings storage contract (key names + shape).
2. Add missing migration(s) for period granularity if `fiscal_periods` is required.
3. Implement summary endpoint with strict company scoping and base-currency reconciliation rules.

### Phase B — Story 47.3/47.4 schema gates
1. Add migrations for `supplier_statements` and `ap_exceptions`.
2. Add ACL + route scaffolding only after schema lands.

### Phase C — Period-close enforcement
1. Reuse Epic 32 period-close semantics.
2. Add AP post/create guardrails with explicit 409 conflict behavior and audited override path.

---

## 6) Mandatory Process Checkpoints (from Epic 46 retro)

1. **Pre-epic ER review** — map new entities against existing tables before coding.
2. **Temporal/immutability checkpoint** — identify values locked at posting time and timezone-sensitive calculations.
3. **UX danger-point review** for multi-step financial workflows (pre-story).
4. **Sprint-status validation utility** at epic close (E46-A1/A4 becomes standard).

---

## 7) Go/No-Go

**Go for Story 47.1 prep work** ✅
- Existing action items complete.
- Key regression protections in place.

**Conditional go for Stories 47.3/47.4/47.5** ⚠️
- Requires schema migrations for missing tables and/or period model alignment.

**Recommendation:** Start Epic 47 with Story 47.1 only, while parallelizing migration design for 47.3/47.4/47.5.

---

## 8) Wave 0 Agent Findings (Detailed)

### A1 — Reconciliation Settings Contract Freeze (`@bmad-architect`)

**Decisions frozen:**
- Canonical settings storage uses `settings_strings` with:
  - `setting_key = ap_reconciliation_account_ids`
  - `setting_value = JSON array of account IDs`
  - company-scoped (`company_id`, `outlet_id=NULL`)
- `account_ids` validation: integer, unique, min 1, max 50.
- Tenant ownership: every account in set must belong to authenticated `company_id` and be AP-control compatible.
- Absent-setting behavior: explicit compatibility bridge to `purchasing_default_ap_account_id` if valid; otherwise fail closed with explicit error.

**A1 P0/P1 risk highlights:**
- **P0:** wrong FX semantics in reconciliation (`base != original * rate`).
- **P1:** cross-tenant account leakage if ownership validation is skipped.
- **P1:** silent fallback ambiguity if unset settings auto-resolve without explicit source.

**A1 status:** ✅ Conditional Go.

### A2 — Schema/Migration Blockers (`@bmad-architect`)

**Schema requirements confirmed:**
1. `fiscal_periods` (required for Story 47.5 closed-period enforcement; supports 47.1/47.6 cutoff logic)
2. `supplier_statements` (required for 47.3)
3. `ap_exceptions` (required for 47.4)

**Migration sequencing:**
1. `fiscal_periods`
2. `supplier_statements`
3. `ap_exceptions`

**Portability strategy:**
- guarded DDL with `information_schema` checks
- rerunnable additive migrations only
- no non-portable `ADD COLUMN IF NOT EXISTS`

**A2 P0/P1 risk highlights:**
- **P1:** tenant leakage if `company_id` and scoped indexes are missing.
- **P1:** deploy instability with non-rerunnable migration design.
- **P1:** duplicate exception inflation without deterministic idempotency key.

**A2 status:** ✅ Conditional Go.

### A3 — ER + Temporal/Immutability Review (`@bmad-analyst`)

**Core decisions:**
- Timezone precedence: `outlet.timezone` → `company.timezone` (no UTC fallback).
- Cutoff inclusion: `<= as_of_date` means through end of local business day.
- Locked-at-posting fields: transaction amounts, exchange-rate used, GL mapping, supplier reference, transaction date.
- Mutable-forward-only settings: reconciliation account set, tolerances, guardrail policy.
- Historical snapshots must not change when settings change.

**A3 ambiguities flagged for story clarifications:**
- exchange-rate effective-window semantics
- outlet-vs-company timezone behavior for AP reconciliation boundaries
- snapshot versioning/retention policy

**A3 P0/P1 risk highlights:**
- **P0:** `fiscal_periods` dependency missing for period-close guardrails.
- **P1:** off-by-one reconciliation errors from timezone ambiguity.
- **P1:** mutable config impacting historical interpretation without snapshot locking.

**A3 status:** ✅ Conditional Go (after blocker closure).

---

## 9) Updated No-P0/P1 Entry Criteria for Wave 1

Wave 1 cannot start until all are true:

1. `fiscal_periods` migration package is designed and accepted (portable/rerunnable).
2. Reconciliation settings contract (A1) is locked and implementation checklist includes fail-closed behavior.
3. Story checklists include explicit temporal/immutability rules from A3.
4. `@bmad-review` gate returns **no unresolved P0/P1**.

**Latest gate state:** `@bmad-review` currently returns **FAIL** (unresolved P0/P1).  
Wave 1 implementation remains blocked until blocker fixes are implemented and gate is re-run.

---

## 10) Delegation Pack Reference

Execution-ready micro-scope prompts are documented in:

- `_bmad-output/implementation-artifacts/coordination/2026-04-19-epic-47-micro-scope-delegation-pack.md`

This pack includes Wave 0 + Wave 1 prompts, hard stop conditions, and required evidence per scope.
