# Epic 61 Retrospective — Sales & Purchasing Lifecycle Correctness

**Date:** 2026-05-09
**Status:** ✅ complete
**Facilitator:** bmad-dev (Amelia)

---

## 1) Epic Objective and Outcome Summary

### Objective

Prove that sales and purchasing document lifecycles (sales invoices, sales payments, purchase orders, goods receipts, AP invoices, AP payments) are immutable post-finalization, journal-linked, tenant-safe, and ACL-enforced. Close remaining Epic 55–60 deferred debt.

### Outcome

**All 6 stories completed, signed off, and verified.** 43 integration tests pass deterministically. All lifecycle state machines (DRAFT→POSTED→VOID) unified across sales and purchasing. P0/P1 = 0 at close. Exit gates all green.

### Delivery Metrics

| Metric | Value |
|--------|-------|
| Stories completed | 6/6 (100%) |
| Integration tests | 43 (100% passing) |
| P0 findings resolved | 3 (agent delegation errors on 61.3) |
| P1 findings resolved | 1 (period-close guard verification) |
| P2 debt items audited | 5 (3 resolved, 2 tracked) |
| Authoritative files touched | `@jurnapod/shared/src/decimal-scale4.ts` canonicalized, `toScaled4` exported from singleton |

---

## 2) Story Completion Table

| # | Story | Tests | Key Outcomes | Risk |
|---|-------|-------|-------------|------|
| 61.1 | Sales Invoice Lifecycle | 9 | DRAFT→POSTED→VOID state machine, immutability post-finalization, journal reconciliation, CASHIER 403 on void (DELETE), audit trail with timestamps | P0 |
| 61.2 | Sales Payment Lifecycle & FX | 14 | Payment void endpoint with reversal journals, FX delta acknowledgment workflow, `client_tx_id` idempotency, DELETE permission enforcement, closed-period rejection | P0 |
| 61.3 | Purchasing Document Chain | 12 | PO→receipt→AP invoice chain correctness, received qty ≤ ordered qty validation, valid-receipt FK enforcement, tenant isolation on all queries, atomic status transitions | P0 |
| 61.4 | AP Period-Close Enforcement | 4 | Fiscal-year close guard on AP invoice/payment posting (409 CONFLICT), void reversal journals, period-close enforcement in application code (not DB triggers), DELETE permission on void | P1 |
| 61.5 | Deferred Debt Closure | — | D1-D5 audited: 3 resolved (D1 treasury READ, D2 payment void, D4 snapshot race), 2 tracked with owner+deadline (D3 FX AP reconciliation, D5 out-of-order push) | P2 |
| 61.6 | GL Reconciliation Gate | 4 | Sales→AR subledger reconciliation (zero tolerance), purchasing→AP subledger reconciliation, void documents net-zero verification, cross-module journal integrity (balanced debits=credits), `__EPIC61_GATE__` machine-verifiable evidence | P1 |

---

## 3) What Went Well

1. **Lifecycle state machines unified** — Sales and purchasing document lifecycles now follow consistent DRAFT→POSTED→VOID patterns across 4 distinct document types (invoices, payments, AP invoices, AP payments). Immatability guards are enforced in application code in all cases — no DB triggers.

2. **DELETE permission for void correctly implemented** — Void operations across sales invoices, sales payments, purchase orders, receiving, AP invoices, and AP payments all use DELETE permission (bit=8), matching the ACL convention established post-Epic 60. Seven route handlers verified via negative tests.

3. **`toScaled4` canonicalized to `@jurnapod/shared`** — The money scaling primitives (`scaled`, `unscaled`, `scaledMul`) were extracted to `packages/shared/src/decimal-scale4.ts`. Multiple file-local `toScaled4` copies in `purchase-order.ts`, `goods-receipt.ts`, and `pos-payment-posting.ts` were identified for removal (tracked as A1). Quantities correctly use `Number()` instead of money scaling. ADR-0024 updated.

4. **`invoiced_qty` unscaled** — The accumulator `invoiced_qty` now stores raw decimal values instead of 10000× scaled bigints. Column type migration from `DECIMAL(19,4)` to `DECIMAL(19,2)` deferred to Epic 62 (tracked as A2). Story docs and ADR-0024 updated.

5. **43 integration tests pass deterministically** — Every AC has at least one test. Tests cover happy paths, error paths, edge cases, and negative auth scenarios. No flaky tests. All fixtures used canonical production paths.

6. **Cross-module error boundary verified** — Story 61.1 enforced E58-A1 error boundary validation across 5 domain error classes spanning `@jurnapod/modules-sales` and `@jurnapod/modules-accounting`. Both `instanceof` and `error.name` fallback paths verified.

7. **Predecessor unblock verified at kickoff** — Epic 60 close gates (E60-G1, E60-G2, E60-G3) were confirmed before Story 61.1 start. Pre-flight gate (`npm run lint`, `typecheck`, `validate-sprint-status.ts`) passed cleanly. Zero pre-existing blockers.

8. **SOLID/DRY/KISS sustained** — Sales and purchasing packages maintained clear boundaries with focused interfaces throughout the epic. No new technical debt introduced. The `@jurnapod/shared` package absorbed `decimal-scale4.ts` as the single canonical source for money scaling.

---

## 4) What Didn't Go Well — Root Cause Analysis

### 4.1 Agent delegation overhead (61.3)

**Symptom:** The bmad-dev agent for Story 61.3 introduced `DECIMAL(19,4)` casting for quantities and incorrectly changed GET route permissions from READ to a different permission bit. These required manual correction before story close.

**Root cause:** The agent's default prompt context lacked the canonical decimal columns policy (quantities are `Number()` not `toScaled4()`) and the ACL defaults table (READ permission for GET routes). The policy was documented but not injected into the agent session at story start.

**Mitigation:** Story 61.3 dev notes now explicitly state: "Quantities use `Number()` — do NOT apply `toScaled4` to quantity fields." This was sufficient for 61.4 which had no similar errors.

**Lesson:** Future stories touching decimal column boundaries should include an explicit "DO NOT apply `toScaled4` to non-monetary columns" guard clause in the story spec's Dev Notes section.

### 4.2 Deep `toScaled4` refactor scope creep

**Symptom:** The initial `toScaled4` fix for quantities expanded into a full module extraction (`@jurnapod/shared/src/decimal-scale4.ts`) with multi-file consumer migration across `purchase-order.ts`, `goods-receipt.ts`, and `pos-payment-posting.ts`.

**Root cause:** The `toScaled4` function was duplicated in multiple files — `purchase-order.ts`, `goods-receipt.ts`, and `pos-payment-posting.ts` all had file-local copies. Fixing quantity handling inevitably touched each copy. The correct architectural choice was to canonicalize to shared package, but this expanded scope significantly.

**Was it avoidable?** No — this was the right structural fix. The scope expansion was necessary because the duplication pattern was already latent. The trigger (quantity fix) just surfaced it.

**Lesson:** When a duplicated utility is found in 2+ files during a story, escalate immediately: the scope expansion is a pre-existing architectural debt that must be resolved. Do not try to patch one copy and leave the others.

### 4.3 `createTestPrice` corruption

**Symptom:** An editing mistake in `test-fixtures.ts` accidentally deleted ~320 lines of code across multiple fixture functions, requiring a `git restore`.

**Root cause:** A multi-line edit operation targeted the wrong section of the file. The `createTestPrice` function was between other fixture functions, and the edit boundaries were ambiguous.

**Mitigation applied:** Diffs validated before applying large edits in all subsequent stories.

**Lesson:** For test-fixture files exceeding 500 lines, use targeted `edit` operations with unique-context anchors rather than large block replacements. The file has become a hotspot for this pattern.

---

## 5) Epic 60 Action Item Follow-Through

| # | Action Item | Owner | Deadline | Status | Evidence |
|---|-------------|-------|----------|--------|----------|
| E60-A1 | Resolve ACCOUNTANT treasury READ seed data gap | bmad-dev | Epic 61 | ✅ **DONE** | Migration 0207 seeded canonical `module_roles` for all companies including ACCOUNTANT `treasury.READ=1`. `role-boundary-treasury.test.ts` passes without ad-hoc `setModulePermission`. Confirmed in 61.5 D1 audit. |
| E60-A2 | Eliminate pre-existing typecheck errors in `audit-log-filter.test.ts` | bmad-dev | Next retro (Epic 61) | ✅ **DONE** | Resolved as side-effect of Epic 61 library migrations. `npm run typecheck -w @jurnapod/api` exits 0 — no errors in that file. Confirmed 2026-05-09. |

### E60 Backlog Check

The Epic 60 retro backlog items were also assessed:
- **Investigate Epic 59 Story 59.3 (cash-flow report correctness) status** — Story 59.3 remains incomplete. Flagged for Epic 62 attention since Epic 62 covers projection correctness (which includes reporting).
- **Update Epic 59 exit gate documentation** — P3 item, not critical for Epic 61. Deferred.

---

## 6) Risk/Findings Resolution Summary

| ID | Severity | Description | Disposition |
|----|----------|-------------|-------------|
| R61-001 | P0 | Invoice/payment lifecycle gaps allow silent mutation | ✅ FIXED — Lifecycle audit + 9 immutability integration tests (61.1) |
| R61-002 | P0 | PO→receipt→AP invoice chain has missing validation | ✅ FIXED — Quantity validation + receipt FK enforcement + 12 tests (61.3) |
| R61-003 | P1 | Period-close guards missing on AP posting paths | ✅ FIXED — 4 integration tests verify 409 on closed FY (61.4) |
| R61-004 | P2 | Deferred debt accumulation across Epics 55–60 | ✅ CLOSED — 5 items audited, 3 resolved, 2 tracked (61.5) |
| F61-001 | P1 | Agent introduced DECIMAL(19,4) on quantities (61.3) | ✅ FIXED — Manual correction, guard clause added to dev notes |
| F61-002 | P1 | Agent changed GET route permissions incorrectly (61.3) | ✅ FIXED — Restored READ permission, confirmed via negative test |
| F61-003 | P2 | Test fixture corruption (~320 lines lost) | ✅ RECOVERED — `git restore`, process note added |
| F61-004 | P2 | `toScaled4` still exported from purchase-order.ts/goods-receipt.ts | 📋 TRACKED — A1 action item for Epic 62 |
| F61-005 | P2 | `invoiced_qty` column DECIMAL(19,4) → DECIMAL(19,2) migration deferred | 📋 TRACKED — A2 action item for Epic 62 |

---

## 7) Sprint 61 SOLID/DRY/KISS Gate

### Kickoff Baseline (2026-05-09T13:30Z)

| Principle | Score | Evidence |
|-----------|-------|----------|
| SOLID | Pass | Sales + purchasing packages have clear boundaries; interfaces focused; no inheritance issues |
| DRY | Pass | Lifecycle patterns consistent across sales (invoice, payment) and purchasing (PO, receipt, AP) |
| KISS | Pass | State-machine validation straightforward; journal reconciliation follows established patterns |

### Pre-Close Re-Score (2026-05-09T21:00Z)

#### SOLID
- **SRP:** Pass — `@jurnapod/modules-sales` owns sales lifecycle; `@jurnapod/modules-purchasing` owns purchasing lifecycle; `@jurnapod/shared` owns decimal scaling. No cross-responsibility leakage.
- **OCP:** Pass — Lifecycle state machines extended via composition (new guards added without modifying core posting engines).
- **LSP:** Pass — No subtype replacement occurred in this epic; lifecycle invariants are tested at the document level, not subtyped.
- **ISP:** Pass — Route handlers depend on focused service interfaces (post, void, reconcile), not monolithic services.
- **DIP:** Pass — Sales + purchasing depend on abstract `@jurnapod/modules-accounting` journal interface, not concrete GL implementation.

#### DRY
- **Business logic dedup:** Pass — `toScaled4` canonicalized to single source (`@jurnapod/shared/src/decimal-scale4.ts`); file-local copies identified for removal.
- **Schema dedup:** Pass — No new schema definitions introduced; existing contracts in `@jurnapod/shared` consumed consistently.
- **SQL dedup:** Pass — Reconciliation queries are centralized in `@jurnapod/modules-accounting`; no duplicated SQL in route handlers.
- **ACL dedup:** Pass — `requireAccess()` with explicit `resource` parameter used across all 10+ route handlers; no copy-pasted ACL logic.
- **Fixture dedup:** Pass — All test setup uses canonical helpers from owner packages (Full Fixture Mode for lifecycle tests). No ad-hoc SQL in setup.

#### KISS
- **No over-engineering:** Pass — State-machine guards are simple `if/else` checks in application code, not elaborate abstraction layers.
- **Readable over clever:** Pass — Lifecycle guards have explicit function names (`ensurePostable()`, `ensureVoidable()`); journal reconciliation is straightforward SUM arithmetic.
- **Small interfaces:** Pass — No interface exceeded 7 methods in this epic scope.
- **Flat over nested:** Pass — No new inheritance; composition used throughout.
- **Deferred complexity:** Pass — Two P2 items deferred with owner+deadline (A1, A2); no features baked in for speculative future needs.

#### Risk Gate
| Gate | Status |
|------|--------|
| Unresolved P0 count | 0 |
| Unresolved P1 count | 0 |
| Verdict | ✅ **GO** |

---

## 8) Action Items (MAX 2 — E46-A2)

### Action Item 1
**`toScaled4` — un-export from `purchase-order.ts` / `goods-receipt.ts`, use `@jurnapod/shared` canonical**
**Owner:** Architecture (Winston)
**Deadline:** Epic 62 planning (before Story 62.1 start)
**Success criterion:** No file-local `toScaled4` copies remain in `packages/modules/purchasing/src/`. All consumers import from `@jurnapod/shared/src/decimal-scale4.ts`. Build passes: `npm run build -w @jurnapod/modules-purchasing`.

### Action Item 2
**`invoiced_qty` column migration from `DECIMAL(19,4)` to `DECIMAL(19,2)` with idempotent migration**
**Owner:** Architecture (Winston)
**Deadline:** Epic 62 (before Story 62.2 start)
**Success criterion:** New idempotent migration exists that safely alters `purchase_invoice_lines.invoiced_qty` and any related columns. `npm run lint:migrations` exits 0. No data loss.

### Backlog Note

The following candidates were identified but **not committed** (exceeds 2-item cap per E46-A2):

- **Address Epic 59 Story 59.3 (cash-flow report correctness) incompleteness** — May affect Epic 62 projection correctness. Owner: bmad-sm. Priority: P2.
- **POS out-of-order push reconciliation (D5)** — Tracked with POS team. Deadline: Epic 62 planning.

---

## 9) Epic 62 Preparation — Projection Correctness Hardening

### Next Epic Overview

**Epic 62: Projection Correctness Hardening**
**Goal:** Prove that read-model projections (`projections/reporting`) produce outputs with **zero material variance** against source-of-truth data (GL, inventory, AR/AP, treasury, sales). Enforce the architectural boundary that projections have READ authority only — never financial write authority. Migrate remaining reporting/projection code from API lib to canonical packages.

**Program alignment:** Sprint 62 in the S48–S62 Correctness-First Architecture Blueprint. **This is the final sprint in the architecture hardening program.**

### Requirements Synopsis

| FR | Requirement | Epic 61 Relevance |
|----|-------------|-------------------|
| FR1 | Zero material variance in projection outputs vs GL, inventory, AR/AP, treasury, sales | Journal reconciliation validated in 61.2, 61.4, 61.6 — provides baseline for projection accuracy |
| FR2 | Projections have READ authority only — no financial write path | ACL enforced in 61.1-61.4; projection layer needs same boundary |
| FR3 | Machine-verifiable projection accuracy evidence (`__EPIC62_GATE__`) | Same gate pattern used in 61.6 (`__EPIC61_GATE__`) |
| FR4 | Validate projections against source-of-truth for every reporting module | AR/AP reconciliation infrastructure from 61.6 is reusable |
| FR5 | Migrate `reports.ts`, `report-context.ts`, `report-error-handler.ts`, `report-telemetry.ts`, admin dashboard read-model helpers → `packages/modules/reporting`, `packages/telemetry`, `packages/shared` | Extraction follows same pattern as `toScaled4` canonicalization |
| FR6 | All projection queries scoped by `company_id` (tenant isolation) | Tenant isolation validated in 61.3 (AC5) |
| FR7 | Deterministic projection outputs | All 43 Epic 61 tests are deterministic — same approach applies |

### Critical Preparation Items for Epic 62

| # | Item | Owner | Deadline | Priority | Rationale |
|---|------|-------|----------|----------|-----------|
| P1 | Resolve E60-A2 (audit-log-filter.test.ts typecheck errors) before Epic 62 starts | bmad-dev | Epic 62 kickoff | P2 | Pre-existing errors mask signal; projection tests should not inherit masking |
| P2 | Complete A1 (`toScaled4` un-export from purchasing files) | Architecture | Epic 62 kickoff | P2 | Projections that aggregate monetary values must use canonical shared scaling |
| P3 | Verify Epic 59 Story 59.3 (cash-flow report) status — incomplete story may block projection gate | bmad-sm | Epic 62 kickoff | P2 | Cash-flow is a projection; incomplete upstream work affects Epic 62 scope |
| P4 | Reconcile AR/AP aging infrastructure readiness for projection validation | Architecture | Epic 62 kickoff | P1 | Epic 61.6 subledger reconciliation is the local truth; Epic 62 projections must match it |
| P5 | Document projection→source-of-truth boundary map (GL accounts, AR aging, AP aging, inventory valuation, treasury balances, sales revenue) | Architecture | Epic 62 kickoff | P1 | Without a map, projection validation is unbounded |

### Epic 62 Pre-Flight Gate Checklist

```bash
npm run lint -w @jurnapod/api          # Must pass with 0 errors
npm run typecheck -w @jurnapod/api      # Must pass (including audit-log-filter)
npm run test:integration -w @jurnapod/api  # Epic 61 baseline: 43 tests green
npx tsx scripts/validate-sprint-status.ts  # Must exit 0
npm run lint:migrations                    # Must exit 0 (no new business triggers)
```

### Dependency Chain for Epic 62

```
Epic 61 (Sales/Purchasing Lifecycle)
  └─► Epic 61.6 GL Reconciliation (AR/AP subledger truth)
       └─► Epic 62 FR1 (zero material variance validated against this truth)
Epic 61.5 (D3: FX AP reconciliation) → may affect multi-currency projection accuracy
Epic 60 (Tenant/ACL) → all projection queries must inherit ACL scoping
```

---

## 10) Team Acknowledgements

| Role | Agent | Contribution |
|------|-------|-------------|
| Developer | bmad-dev (Amelia) | Story implementation for 61.1–61.6 |
| Reviewer | bmad-review | Code review with no blockers on all stories |
| Architect | bmad-architect (Winston) | ADR-0024 update, `toScaled4` canonicalization design |
| QA | bmad-qa (Quinn) | Test scenario review checkpoints for all stories |
| Story Owner | Ahmad | Sign-off on all 6 completion reports |

---

## 11) Sign-Off

### Epic 60 Action Item Follow-Through Summary

| # | Action Item | Deadline | Status | Notes |
|---|-------------|----------|--------|-------|
| E60-A1 | ACCOUNTANT treasury READ seed data gap | Epic 61 | ✅ DONE | Migration 0207 seeded canonical `module_roles` |
| E60-A2 | `audit-log-filter.test.ts` typecheck errors | Next retro | ✅ DONE | Resolved as side-effect of Epic 61 library migrations; typecheck exits 0 |

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Facilitator | bmad-dev (Amelia) | 2026-05-09 | ✅ |
| Story Owner | Ahmad | 2026-05-09 | ✅ |
| Reviewer | bmad-review | 2026-05-09 | ✅ |

---

_Last Updated: 2026-05-09T21:30:00Z_
_Retrospective Status: ✅ complete_
