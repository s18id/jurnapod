# Epic 51 — Fiscal Correctness Hardening

> **Owner:** Architecture Program (Correctness > Safety > Speed)
> **Status:** backlog
> **Sprint:** 51 (2026-05-11 to 2026-05-22)
> **Theme:** Do actionables first and continue
> **Primary Module:** `accounting-ledger`, `modules-accounting`, `modules-sales`, `modules-purchasing`, `modules-inventory`
> **Exit Gate:** All 4 subledger reconciliations verified; no unresolved P0/P1 in Epic 51 scope

---

## 0) HARD GATE — E50-A1 / E50-A2 Carry-Over Prerequisites (MANDATORY)

> **RFC Keywords (Agent-Safe):** Implementation of ANY Epic 51 story MUST NOT begin until ALL of the following conditions are met:

| Gate ID | Requirement | Artifact | Status |
|---------|-------------|----------|--------|
| **E50-A1** | Usage surface estimation for P0 risk stories | Story 51.1 spec MUST include explicit "usage surface estimation" sub-task | MUST be present |
| **E50-A1** | Second-pass review checklist in every story spec | Each `story-51.X.md` | MUST be present |
| **E50-A2** | Concurrent story coordination protocol | Story 51.5 spec MUST include explicit "coordination protocol" section | MUST be present |

**Carry-over rationale:** Epic 50 retrospective (2026-04-25) generated 2 action items. E50-A1 and E50-A2 are both owned and due at Epic 51 retrospective. Both MUST be executed before Epic 51 midpoint.

**Gate enforcement language:**
- "MUST NOT begin implementation" — no ambiguity, no exceptions
- Implementors MUST verify gate artifacts are in place before starting any Epic 51 work
- Story 51.1 (fiscal year close) is a P0 risk resolution story — MUST include usage surface estimation per E50-A1
- Story 51.5 (follow-up closure bucket) is the catch-all — MUST include coordination protocol per E50-A2
- Reviewers MUST reject any PR that does not include E50-A1/E50-A2 evidence

---

## 1) Charter

### 1.1 Program Alignment

Epic 51 is Sprint 51 in the S48–S61 Correctness-First Architecture Blueprint:

| Sprint | Blueprint Focus | Epic 51 Alignment |
|--------|-----------------|-------------------|
| 49 | Test determinism + CI reliability | Q49-001 fixture extraction continues |
| 50 | Ledger correctness hardening | Posting integration tests (5 suites, 26 tests) delivered; FX acknowledgment delivered |
| **51** | **Fiscal correctness hardening** | **This epic** — fiscal year close + subledger reconciliations |
| 52 | Fiscal correctness continuation | TBD |

### 1.2 What We Know from Exploration

**Epic 50 (done):** 5/5 stories completed. Zero P0/P1 carryover. Posting integration tests established (5 suites, 26 tests, 3× consecutive green). R50-005 (subledger reconciliation gaps) explicitly deferred to Epic 51.

**Epic 49 (done):** Determinism hardening complete. Q49-001 fixture extraction ongoing — Pass 1 done, Pass 2+ in backlog.

**Subledger reconciliation gaps identified in Epic 50:**

| Finding | Severity | Implication |
|---------|----------|-------------|
| RECEIVABLES subledger not reconciled to GL | P1 | AR balance can drift from GL control account without detection |
| PAYABLES subledger not reconciled to GL | P1 | AP balance can drift from GL control account without detection |
| INVENTORY subledger not reconciled to GL | P1 | Inventory balance can drift from GL control account without detection |
| Fiscal year close has concurrent override paths | P1 | Race condition risk in close/override concurrency |

### 1.3 Non-Goals

- Net-new feature development (except explicit emergency/regulatory exception)
- POS offline-first correctness (frozen app per architecture-first scope freeze)
- Q49-001 Pass 2+ fixture extraction (already in backlog, separate track)
- Story 51.5 MUST NOT be used to introduce new scope — it is exclusively a follow-up closure bucket

---

## 2) Story Breakdown

### Story 51.1 — Fiscal Year Close Correctness Hardening (Close/Override Concurrency Proof)
**Status:** backlog
**Owner:** @bmad-dev
**Type:** Correctness risk resolution

> **E50-A1 carry-over:** This story MUST include explicit "usage surface estimation" sub-task per E50-A1 action item.

Investigate fiscal year close close/override concurrency paths, produce a deterministic proof that concurrent close operations are safe, and apply any required fixes.

**AC1:** Usage surface documented (pattern search scope, call-site count, concurrency surface)  
**AC2:** Concurrent close/override paths analyzed for race conditions  
**AC3:** Deterministic proof established (lock ordering, transaction isolation, or equivalent)  
**AC4:** Any defects fixed with evidence  
**AC5:** Code review GO required

---

### Story 51.2 — Receivables Subledger Reconciliation
**Status:** backlog
**Owner:** @bmad-dev
**Type:** Correctness verification + defect resolution

> **HARD GATE:** Implementation MUST NOT begin until E50-A1/E50-A2 prerequisites are verified present in this spec.

Implement AR subledger reconciliation: prove that `sales_invoices + sales_payments + credit_notes` balances to the `accounts_receivable` GL control account.

**AC1:** AR subledger-to-GL reconciliation implemented  
**AC2:** Reconciliation report endpoint created or updated  
**AC3:** Variances surfaced with drilldown capability  
**AC4:** All gaps/defects fixed with evidence  
**AC5:** Integration tests written and 3× consecutive green  
**AC6:** Code review GO required

---

### Story 51.3 — Payables Subledger Reconciliation
**Status:** backlog
**Owner:** @bmad-dev
**Type:** Correctness verification + defect resolution

> **HARD GATE:** Implementation MUST NOT begin until E50-A1/E50-A2 prerequisites are verified present in this spec.

Implement AP subledger reconciliation: prove that `purchase_invoices + purchase_payments + supplier_credit_notes` balances to the `accounts_payable` GL control account.

**AC1:** AP subledger-to-GL reconciliation implemented  
**AC2:** Reconciliation report endpoint created or updated  
**AC3:** Variances surfaced with drilldown capability  
**AC4:** All gaps/defects fixed with evidence  
**AC5:** Integration tests written and 3× consecutive green  
**AC6:** Code review GO required

---

### Story 51.4 — Inventory Subledger Reconciliation
**Status:** backlog
**Owner:** @bmad-dev
**Type:** Correctness verification + defect resolution

> **HARD GATE:** Implementation MUST NOT begin until E50-A1/E50-A2 prerequisites are verified present in this spec.

Implement inventory subledger reconciliation: prove that `stock_movements + costing_adjustments` balances to the `inventory` GL control account.

**AC1:** Inventory subledger-to-GL reconciliation implemented  
**AC2:** Reconciliation report endpoint created or updated  
**AC3:** Variances surfaced with drilldown capability  
**AC4:** All gaps/defects fixed with evidence  
**AC5:** Integration tests written and 3× consecutive green  
**AC6:** Code review GO required

---

### Story 51.5 — Follow-Up Closure Bucket
**Status:** backlog
**Owner:** @bmad-dev
**Type:** Defect resolution (follow-up)

> **E50-A2 carry-over:** This story MUST include explicit "coordination protocol" section per E50-A2 action item. Story 51.5 MUST NOT introduce new scope — it is exclusively a follow-up closure bucket for defects/gaps surfaced by Stories 51.1–51.4.

Capture and resolve all defects and gaps surfaced by Stories 51.1–51.4. Epic 51 cannot close until this story is done.

**AC1:** All Story 51.1–51.4 defects captured with evidence  
**AC2:** All captured defects resolved with evidence  
**AC3:** No new P1/P2 defects introduced in fixes  
**AC4:** Post-fix 3-consecutive-green on all affected suites  
**AC5:** Risk register updated  
**AC6:** Sprint status updated

---

## 3) Epic 51 Risk Register

| Risk | Severity | Mitigation | Status |
|------|----------|------------|--------|
| R51-001: Fiscal year close concurrent override race condition | P1 | Story 51.1 | backlog |
| R51-002: AR subledger drift from GL control account | P1 | Story 51.2 | backlog |
| R51-003: AP subledger drift from GL control account | P1 | Story 51.3 | backlog |
| R51-004: Inventory subledger drift from GL control account | P1 | Story 51.4 | backlog |
| R51-005: Story 51.5 scope creep (non-follow-up items) | P2 | Story 51.5 scope enforcement; epic gate | backlog |
| R51-006: E50-A1/E50-A2 prerequisites not executed before midpoint | P1 | HARD GATE block; implementors verify before starting | backlog |

---

## 4) Sprint 51 Kickoff Checkpoint Evidence

> **Recorded:** 2026-04-25 (Sprint 51 kickoff)
> **Baseline:** SOLID/DRY/KISS initial assessment + P1/P2 risk register

### 4.1 SOLID/DRY/KISS Baseline

| Principle | Item | Status | Notes |
|-----------|------|--------|-------|
| **SRP** | Reconciliation service per subledger type | Unknown | AR/AP/Inventory each have one reason to change |
| **OCP** | Reconciliation reporters open for extension | Unknown | New subledger types must not require core modification |
| **LSP** | Subledger reconciliation behaves consistently | Unknown | AR/AP/Inventory share same balance assertion pattern |
| **ISP** | Lean interfaces (balance check + variance drilldown) | Unknown | Focus on two operations only |
| **DIP** | Modules depend on abstract interface | Unknown | ReconciliationRepository abstraction needed |
| **DRY** | Business logic dedup (balance assertion in one place) | Unknown | Shared reconciliation utility pattern |
| **DRY** | Schema dedup (Zod contracts in `packages/shared`) | Unknown | Contracts consumed by all reconciliation modules |
| **DRY** | SQL dedup (reconciliation query patterns) | Unknown | Repository helpers for repeated patterns |
| **DRY** | ACL dedup (`requireAccess()` centralized) | Unknown | Story 51.2–51.4 share same pattern |
| **DRY** | Test fixtures dedup (canonical fixtures from owner packages) | Unknown | E50-A2 carry-over — coordination protocol needed |
| **KISS** | No over-engineering (simple balance check) | Unknown | Direct GL vs subledger comparison |
| **KISS** | Readable over clever | Unknown | Explicit aggregation, no cleverness |
| **KISS** | Small interfaces (focused ReconciliationRepository methods) | Unknown | Lean by design |
| **KISS** | Flat over nested (linear reconciliation flow) | Unknown | No deep nesting |
| **KISS** | Explicit variance drilldown | Unknown | No hidden abstraction layers |

**Initial SOLID/DRY/KISS Assessment:**
- **SOLID:** 5 Unknown — all five principles need validation during implementation
- **DRY:** 5 Unknown — fixture/correction dedup requires cross-story coordination (E50-A2)
- **KISS:** 5 Unknown — architecture must stay lean; over-engineering is the primary risk

### 4.2 Initial Risk Baseline (P1/P2)

| Risk ID | Description | Severity | Initial Status | Mitigation Owner |
|---------|-------------|----------|----------------|------------------|
| R51-001 | Fiscal year close concurrent override race condition | P1 | Unknown | Story 51.1 |
| R51-002 | AR subledger drift from GL control account | P1 | Unknown | Story 51.2 |
| R51-003 | AP subledger drift from GL control account | P1 | Unknown | Story 51.3 |
| R51-004 | Inventory subledger drift from GL control account | P1 | Unknown | Story 51.4 |
| R51-005 | Story 51.5 scope creep (non-follow-up items) | P2 | Unknown | Story 51.5 scope enforcement |
| R51-006 | E50-A1/E50-A2 prerequisites not executed before midpoint | P1 | Unknown | HARD GATE block |

### 4.3 Hard Gate Status

| Gate ID | Requirement | Status |
|---------|-------------|--------|
| E50-A1 | Usage surface estimation in Story 51.1 spec | **NOT VERIFIED** — must be confirmed before story start |
| E50-A1 | Second-pass review checklist in every story spec | **NOT VERIFIED** — must be confirmed before story start |
| E50-A2 | Coordination protocol in Story 51.5 spec | **NOT VERIFIED** — must be confirmed before story start |

> **Enforcement:** Implementors MUST verify E50-A1/E50-A2 presence before starting any Epic 51 work. Reviewers MUST reject PRs without E50-A1/E50-A2 evidence.

### 4.4 Sprint 51 SOLID/DRY/KISS Checklist

Apply at kickoff, midpoint, and pre-close per Sprint 51 loop.

### SOLID
- [ ] SRP: Each reconciliation service has one reason to change (one subledger type)
- [ ] OCP: Reconciliation reporters are open for extension (new subledger types) without modifying core
- [ ] LSP: Subledger reconciliation behaves consistently across AR, AP, inventory
- [ ] ISP: Reconciliation interfaces are lean and focused (balance check + variance drilldown)
- [ ] DIP: Modules depend on abstract reconciliation interface, not concrete implementations

### DRY
- [ ] Business logic dedup: balance assertion in one place only (shared reconciliation utility)
- [ ] Schema dedup: Zod contracts in `packages/shared`, consumed by reconciliation
- [ ] SQL dedup: repeated reconciliation query patterns become repository helpers
- [ ] ACL dedup: `requireAccess()` centralized, not copy-pasted
- [ ] Test fixtures dedup: canonical fixtures from owner packages used across all reconciliation tests

### KISS
- [ ] No over-engineering: simple balance check over elaborate reconciliation abstraction
- [ ] Readable over clever: explicit GL vs subledger comparison over clever aggregation
- [ ] Small interfaces: ReconciliationRepository has focused methods only
- [ ] Flat over nested: reconciliation flow is linear, not deeply nested
- [ ] Variance drilldown is explicit, not hidden behind abstraction layers

---

## 5) Exit Gate Criteria

Epic 51 can be marked `done` only when:

1. Story 51.1: Fiscal year close concurrency proof established, reviewer GO attached
2. Story 51.2: AR subledger reconciliation verified, 3× consecutive green, reviewer GO attached
3. Story 51.3: AP subledger reconciliation verified, 3× consecutive green, reviewer GO attached
4. Story 51.4: Inventory subledger reconciliation verified, 3× consecutive green, reviewer GO attached
5. Story 51.5: All defects from 51.1–51.4 resolved, 3× green post-fix, risk register updated
6. No unresolved P0/P1 in Epic 51 scope
7. Sprint status validated: `npx tsx scripts/validate-sprint-status.ts --epic 51` exits 0

---

## 6) Retrospective (Max 2 Action Items)

```
## Epic 51 Retrospective — Max 2 Action Items

1. Action item:
   - Owner:
   - Deadline:
   - Success criterion:

2. Action item:
   - Owner:
   - Deadline:
   - Success criterion:
```

---

## 7) Validation Commands

```bash
# Story 51.1
rg 'fiscalYearClose\|closeFiscalYear\|overrideFiscalYear' --type ts -l

# Story 51.2
npm run test:single -- "packages/modules/sales/__test__/integration/reconciliation/ar-subledger-reconciliation.test.ts" -w @jurnapod/modules-sales

# Story 51.3
npm run test:single -- "packages/modules/purchasing/__test__/integration/reconciliation/ap-subledger-reconciliation.test.ts" -w @jurnapod/modules-purchasing

# Story 51.4
npm run test:single -- "packages/modules/inventory/__test__/integration/reconciliation/inventory-subledger-reconciliation.test.ts" -w @jurnapod/modules-inventory

# Story 51.5
# All above suites must be 3× green after fixes

# Epic close gate
npx tsx scripts/validate-sprint-status.ts --epic 51
# Expected: exit 0 — "Sprint 51 closure gate: GO"
```