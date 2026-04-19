# Epic 47 Micro-Scope Delegation Pack (Updated)

**Date:** 2026-04-19  
**Purpose:** Delegation-ready micro scopes with strict P0/P1 guardrails and batch gates.  
**Current state:** Wave 0 gate re-review = **GO (Conditional)**.

---

## 1) Batch Matrix (Execution Order)

| Batch | Scope | Depends On | Primary Delegate |
|---|---|---|---|
| **B0** | Contract alignment verification (post-freeze) + route namespace freeze | None | `@bmad-architect` |
| **B1** | Story 47.1 hardening/closure | B0 | `@bmad-dev` |
| **B2A** | Story 47.2 drilldown & variance attribution | B1 | `@bmad-dev` |
| **B2B** | Story 47.5 period-close guardrails (parallel track) | B0 + Epic 32 readiness | `@bmad-dev` |
| **B3** | Story 47.3 supplier statements | B2A | `@bmad-dev` |
| **B4** | Story 47.4 AP exception worklist | B2A + B3 | `@bmad-dev` |
| **B5** | Story 47.6 snapshots + audit trail | B1 + B2B | `@bmad-dev` |

**Review rule:** each batch requires `@bmad-review` PASS (no unresolved P0/P1) before next dependent batch starts.

---

## 2) Global Guardrails (Attach to Every Delegation)

- Tenant isolation mandatory (`company_id` on all reads/writes; `outlet_id` when applicable)
- ACL must remain explicit resource-level (`module.resource`)
- Journals remain financial source of truth
- Money precision only (`DECIMAL`/scaled integer); no FLOAT/DOUBLE
- Finalized financial artifacts immutable (VOID/REFUND/corrections via explicit flows)
- Migrations rerunnable, MySQL/MariaDB portable, guarded for ALTER-style changes
- DB-backed tests use real DB, no DB mocks

---

## 3) Micro Scopes with Detailed Checklists

### B0 — Contract Alignment Verification (Post-Freeze) + Namespace Freeze
**Objective:** Verify and align docs/ACL/routes to the already-approved Wave 0 contract freeze.

**B0 decision log (2026-04-19):**
- Canonical namespace: `/api/purchasing/reports/ap-reconciliation/*`
- Temporary alias (deprecated): `/api/accounting/ap-reconciliation/*` for max 1 release cycle / 30 days
- Canonical ACL:
  - settings read/write: `accounting.accounts` + `MANAGE`
  - report/snapshot reads: `purchasing.reports` + `ANALYZE`
  - snapshot create: `purchasing.reports` + `CREATE`

**Likely files:**
- `_bmad-output/implementation-artifacts/stories/epic-47/story-47.1.md`
- `_bmad-output/implementation-artifacts/stories/epic-47/epic-47-readiness.md`
- `apps/api/src/routes/purchasing/reports/ap-reconciliation.ts` (or accounting route alias decision)

**Checklist:**
- [ ] Canonical route namespace chosen and documented (single source of truth)
- [ ] Compatibility alias policy decided (if needed)
- [ ] Response field names and error codes frozen
- [ ] ACL resource mapping per endpoint frozen

**P0/P1 guardrails:**
- **P1:** no dual-contract ambiguity after this batch
- **P1:** no module-only ACL fallback

**Tests:**
- [ ] Canonical route integration test
- [ ] Alias parity test (only if alias retained)

**Rollback trigger:** unresolved contract ambiguity.

---

### B1 — Story 47.1 Hardening/Closure
**Objective:** Finalize AP↔GL summary behavior with strict cutoff, tenant scope, and FX correctness.

**Likely files:**
- `apps/api/src/lib/purchasing/ap-reconciliation.ts`
- `apps/api/src/routes/purchasing/reports/ap-reconciliation.ts`
- `apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts`
- `packages/shared/src/schemas/purchasing.ts`
- `packages/shared/src/constants/purchasing.ts`

**Checklist:**
- [ ] AP subledger, GL control, and variance calculations verified
- [ ] Fail-closed settings behavior (409) preserved
- [ ] Strict account ownership/type validation preserved
- [ ] Timezone precedence enforced (`outlet.timezone -> company.timezone`, no UTC fallback)
- [ ] Contract fields documented and stable

**P0/P1 guardrails:**
- **P0:** `base = original * rate` remains true
- **P1:** no cross-tenant leakage
- **P1:** no silent UTC fallback

**Tests:**
- [ ] AP reconciliation integration suite green
- [ ] Purchasing integration suite green
- [ ] `npm run build -w @jurnapod/shared` green
- [ ] `npm run typecheck -w @jurnapod/api` green

**Rollback trigger:** P0/P1 regression in FX, cutoff, tenant scoping, or ACL.

---

### B2A — Story 47.2 Drilldown & Variance Attribution
**Objective:** Explain variance with deterministic attribution and traceable AP↔GL details.

**Likely files:**
- `packages/modules/accounting/src/services/ap-reconciliation-drilldown-service.ts`
- `apps/api/src/routes/accounting/ap-reconciliation-drilldown.ts`
- `packages/shared/src/schemas/ap-reconciliation.ts`
- `apps/api/__test__/integration/accounting/ap-reconciliation-drilldown.test.ts`

**Checklist:**
- [ ] Attribution categories implemented: timing/posting/missing/rounding
- [ ] AP detail and GL detail endpoints implemented with traceability keys
- [ ] Matching logic deterministic for same inputs
- [ ] CSV export path defined and tested

**P0/P1 guardrails:**
- **P1:** deterministic and idempotent attribution output
- **P1:** strict tenant scoping on all joins

**Tests:**
- [ ] Category attribution accuracy test
- [ ] Matched/unmatched linkage tests
- [ ] Export response test

**Rollback trigger:** materially wrong attribution or non-deterministic output.

---

### B2B — Story 47.5 Period-Close Guardrails (Parallel)
**Objective:** Enforce closed-period AP protection with controlled, audited override.

**Likely files:**
- `packages/modules/accounting/src/services/period-close-guardrail-service.ts`
- `apps/api/src/middleware/period-close-guardrail.ts`
- `apps/api/src/routes/purchasing/purchase-invoices.ts`
- `apps/api/src/routes/purchasing/ap-payments.ts`
- `apps/api/src/routes/purchasing/supplier-credit-notes.ts`
- `apps/api/__test__/integration/accounting/period-close-guardrail.test.ts`

**Checklist:**
- [ ] Reusable guardrail service runs before AP posting logic
- [ ] Closed-period requests blocked with 409
- [ ] Override path requires MANAGE permission + mandatory reason
- [ ] `period_close_overrides` append-only audit behavior
- [ ] Bulk fail-fast behavior validated

**P0/P1 guardrails:**
- **P0:** no posting into closed periods without valid override
- **P1:** override must be auditable and immutable

**Tests:**
- [ ] Block path test
- [ ] Override success + audit trail test
- [ ] Bulk fail-fast test

**Rollback trigger:** any bypass of closed-period block.

---

### B3 — Story 47.3 Supplier Statement Matching
**Objective:** Manual supplier statements with per-supplier reconciliation and controlled status flow.

**Likely files:**
- `packages/modules/purchasing/src/services/supplier-statement-service.ts`
- `apps/api/src/routes/purchasing/supplier-statements.ts`
- `packages/shared/src/schemas/supplier-statements.ts`
- `apps/api/__test__/integration/purchasing/supplier-statements.test.ts`

**Checklist:**
- [ ] Statement create/list/reconcile endpoints implemented
- [ ] Variance and tolerance behavior defined in statement currency
- [ ] `reconciled_at`/`reconciled_by` status flow implemented
- [ ] Drilldown to supplier AP details for variance investigation

**P0/P1 guardrails:**
- **P1:** tenant-safe statement read/write only
- **P1:** decimal-safe monetary math only

**Tests:**
- [ ] Lifecycle tests (create/list/reconcile)
- [ ] Variance threshold tests
- [ ] Tenant isolation tests

**Rollback trigger:** incorrect per-supplier balance calculation impacting status decisions.

---

### B4 — Story 47.4 AP Exception Worklist
**Objective:** Unified exception detection and resolution workflow.

**Likely files:**
- `packages/modules/accounting/src/services/ap-exception-service.ts`
- `apps/api/src/routes/accounting/ap-exceptions.ts`
- `packages/shared/src/schemas/ap-exceptions.ts`
- `apps/api/__test__/integration/accounting/ap-exceptions.test.ts`

**Checklist:**
- [ ] Exception aggregation from AP/GL + statement + disputed + overdue
- [ ] Deterministic prioritization implemented
- [ ] Assign and resolve flows implemented (resolution note mandatory)
- [ ] Detection idempotency ensured via deterministic key strategy

**P0/P1 guardrails:**
- **P1:** idempotent exception generation (no duplicate inflation)
- **P1:** tenant-safe update/query behavior

**Tests:**
- [ ] Detection idempotency tests
- [ ] Assignment/resolution workflow tests
- [ ] Filtering/sorting tests

**Rollback trigger:** duplicate exception inflation or cross-tenant exception leakage.

---

### B5 — Story 47.6 Snapshots + Audit Trail
**Objective:** Implement immutable, append-only reconciliation snapshots using the approved design note.

**Primary design input:**
- `_bmad-output/implementation-artifacts/stories/epic-47/story-47.6-snapshot-immutability-design.md`

**Likely files:**
- `packages/modules/accounting/src/services/ap-reconciliation-snapshot-service.ts`
- `apps/api/src/routes/accounting/ap-reconciliation-snapshots.ts`
- `packages/shared/src/schemas/ap-reconciliation-snapshots.ts`
- `apps/api/__test__/integration/accounting/ap-reconciliation-snapshots.test.ts`

**Checklist:**
- [ ] Snapshot persistence implemented with append-only versioning
- [ ] Immutable financial fields enforced
- [ ] Deterministic `inputs_hash` persisted
- [ ] Compare/list/export endpoints implemented
- [ ] Period-close auto snapshot hook integrated

**P0/P1 guardrails:**
- **P0:** no retroactive mutation of stored snapshot balances
- **P1:** configuration changes affect future snapshots only
- **P1:** strict tenant scoping + ACL on read/write

**Tests:**
- [ ] Version increment on re-run same `as_of_date`
- [ ] Update/delete rejection tests
- [ ] Auto snapshot on period-close integration test
- [ ] Compare delta correctness test

**Rollback trigger:** any snapshot mutability or broken version chain.

---

## 4) Batch Gates (GO/NO-GO)

- **Gate G0 (after B0):** contract/route/ACL freeze complete
- **Gate G1 (after B1):** summary stack PASS, no unresolved P0/P1
- **Gate G2 (after B2A + B2B):** drilldown + period-close both PASS
- **Gate G3 (after B3 + B4):** statement + exception workflows PASS
- **Gate G4 (after B5):** snapshot immutability + audit trail PASS

**Hard stop rule:** Any unresolved P0/P1 at any gate = **NO-GO** for next dependent batch.

---

## 5) Delegation Routing by Batch

| Batch | Implementation | Review | Supporting |
|---|---|---|---|
| B0 | `@bmad-architect` | `@bmad-review` | `@bmad-sm` |
| B1 | `@bmad-dev` | `@bmad-review` | `@bmad-qa` |
| B2A | `@bmad-dev` | `@bmad-review` | `@bmad-qa` |
| B2B | `@bmad-dev` | `@bmad-review` | `@bmad-architect`, `@bmad-qa` |
| B3 | `@bmad-dev` | `@bmad-review` | `@bmad-qa` |
| B4 | `@bmad-dev` | `@bmad-review` | `@bmad-qa` |
| B5 | `@bmad-dev` | `@bmad-review` | `@bmad-architect`, `@bmad-qa` |

---

## 6) Immediate Ready-to-Run Next Step

- [x] Execute **B0** verification + namespace freeze decision
- [x] Update core Epic 47 docs to canonical namespace
- [ ] Run `@bmad-review` on B0 alignment package
- [ ] If PASS, start **B1** implementation delegation
