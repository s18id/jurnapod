# Epic 47 Wave 0 Gate Report (No-P0/P1 Prep)

**Date:** 2026-04-19
**Scopes:** MS-47-A1, MS-47-A2, MS-47-A3
**Owners:** @bmad-architect, @bmad-analyst
**Coordination Source:** `_bmad-output/implementation-artifacts/coordination/2026-04-19-epic-47-wave0-no-p0-p1.md`

---

## Executive Result

- **Wave 0 Decision:** ✅ **GO (Conditional)**
- **Condition:** Wave 1 blocked until schema package and contract lock checks are complete and reviewed.

---

## Scope Outcomes

### MS-47-A1 — Reconciliation Settings Contract Freeze
**Status:** ✅ Conditional Go

**Locked decisions:**
- canonical setting key: `ap_reconciliation_account_ids`
- storage: company-scoped `settings_strings`, JSON array
- strict ownership/type validation for all account IDs
- explicit compatibility bridge to `purchasing_default_ap_account_id`
- fail-closed if no valid account set resolves

### MS-47-A2 — Schema/Migration Blockers
**Status:** ✅ Conditional Go

**Required schema additions:**
- `fiscal_periods`
- `supplier_statements`
- `ap_exceptions`

**Sequencing:** `fiscal_periods` → `supplier_statements` → `ap_exceptions`

**Migration policy:** guarded, rerunnable, MySQL/MariaDB portable DDL.

### MS-47-A3 — ER + Temporal/Immutability
**Status:** ✅ Conditional Go

**Locked rules:**
- timezone precedence: `outlet.timezone` → `company.timezone`
- cutoff inclusion: through end of local business day
- posting-time immutable values must not be altered by later config changes
- snapshot behavior must preserve historical interpretation

---

## P0/P1 Register Summary

| Severity | Risk | Mitigation |
|---|---|---|
| P0 | Missing `fiscal_periods` dependency blocks period-close guardrails | Create/approve migration package before Wave 1 |
| P0 | Wrong FX semantics in reconciliation math | Enforce `base = original * rate` integration assertions |
| P1 | Cross-tenant leakage via unscoped account IDs/settings | Strict `company_id` ownership validation on write/read |
| P1 | Silent fallback ambiguity in account-set resolution | Explicit bridge behavior + fail-closed when unresolved |
| P1 | Timezone ambiguity causes off-by-one cutoff errors | Lock timezone precedence and UTC-range conversion rule |
| P1 | Non-rerunnable/non-portable migrations | Guarded DDL strategy with information_schema checks |
| P1 | Mutable settings alter historical financial interpretation | Snapshot immutability and posting-time lock rules |

---

## Wave 1 Entry Checklist (Must Pass)

- [ ] A1 contract documented in implementation checklist and route validation plan
- [ ] A2 migration designs reviewed for portability/rerunnable behavior
- [ ] A3 temporal/immutability rules attached to Story 47.1/47.5/47.6 checklists
- [ ] `@bmad-review` confirms no unresolved P0/P1

---

## Recommended Delegation Sequence

1. `@bmad-architect` → finalize migration spec package (`fiscal_periods`, `supplier_statements`, `ap_exceptions`)
2. `@bmad-sm` → attach Wave 1 entry checklist to sprint board
3. `@bmad-qa` → prepare AC-to-integration-test matrix for Story 47.1 and 47.5 first
4. `@bmad-review` → run gate review before first implementation PR
