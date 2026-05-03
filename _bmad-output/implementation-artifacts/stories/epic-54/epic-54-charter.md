# Epic 54 — AP Lifecycle Correctness

> **Owner:** Architecture Program (Correctness > Safety > Speed)
> **Status:** backlog
> **Sprint:** 54 (per S48–S61 blueprint)
> **Theme:** Prove existing AP write paths are correct; no new features
> **Primary Module:** `modules-purchasing`, `modules-accounting` (journal posting)
> **Exit Gate:** No unresolved P0/P1 in AP write flows; all critical suites 3× consecutive green

---

## 0) HARD GATE — E51-A1 Carry-Over (MANDATORY)

> **RFC Keywords (Agent-Safe):** Implementation of ANY Epic 54 story MUST NOT begin until ALL of the following conditions are met:

| Gate ID | Requirement | Artifact | Status |
|---------|-------------|----------|--------|
| **E51-A1** | Auto-snapshot race from Epic 51 formally tracked | `action-items.md` entry with owner + target epic | ✅ Tracked for Epic 55 |
| **E54-A1** | Usage surface estimation for AP write path | Story 54.1 spec MUST include explicit "usage surface estimation" sub-task | MUST be present |
| **E54-A2** | Second-pass review checklist in every story spec | Each `story-54.X.md` | MUST be present |

**Rationale:** Epic 54 is the first correctness-hardening epic for the purchasing-ap module. It follows the same pattern as Epics 50–51 (ledger/fiscal correctness) and MUST include the same rigor.

---

## 1) Charter

### 1.1 Program Alignment

Epic 54 is Sprint 54 in the S48–S61 Correctness-First Architecture Blueprint (re-baselined 2026-05-28):

| Sprint | Blueprint Focus | Epic 54 Alignment |
|--------|-----------------|-------------------|
| 50 | Ledger correctness hardening | Posting integration tests (5 suites, 26 tests) delivered |
| 51 | Fiscal correctness hardening | Close/override concurrency proof; 4 subledger reconciliations |
| 52–53 | Drift prevention (datetime + idempotency) | Emergency epics; datetime API + idempotency contracts stabilized |
| **54** | **AP lifecycle correctness** | **This epic** — prove AP write path (invoice, payment, state machine) is correct |
| 55 | AP reconciliation/snapshot correctness | Reconciliation + snapshot audit consistency; E51-A1 auto-snapshot race fix |

### 1.2 What We Know from Exploration

**Epic 46 (done):** AP module built (PO → GRN → Invoice → Payment lifecycle). 8 stories, 155/155 tests passing. Currency conversion, journal posting, credit limits scaffolded. Three-way matching and approval workflows deferred.

**Epic 47 (done):** AP reconciliation + period close controls. 6 stories covering reconciliation summary, drilldown, supplier statement matching, exception worklist, period close guardrails, snapshot audit trail.

**Epic 51 (done):** Subledger reconciliations verified (AR, AP, Inventory). AP reconciliation (Story 51.3) proved purchase_invoices + purchase_payments + supplier_credit_notes balances to AP GL control account.

**What Epic 54 must prove:**
- AP invoice create → post → void is idempotent and journal-correct
- AP payment create → post → allocate is idempotent and reduces invoice balance correctly
- AP state machine (PO → GRN → Invoice → Payment) has no invalid bypasses
- Multi-currency AP transactions compute base amounts correctly
- Period-close enforcement blocks backdated postings

### 1.3 Non-Goals

- Net-new AP features (three-way matching, approval workflows remain deferred)
- AP reconciliation (already covered in Epic 47)
- AP snapshot infrastructure (covered in Epic 55)
- UI/backoffice changes (frozen per architecture-first scope freeze)

---

## 2) Story Breakdown

### Story 54.1 — AP Invoice Write-Path Correctness Hardening
**Status:** backlog
**Owner:** @bmad-dev
**Type:** Correctness risk resolution

> **HARD GATE:** Implementation MUST NOT begin until E54-A1 usage surface estimation is present in this spec.

Prove that AP invoice create, post, and void operations are correct, idempotent, and produce valid journal entries.

**AC1:** Usage surface documented (pattern search scope, call-site count, concurrency surface)  
**AC2:** Invoice create idempotency proven (duplicate `idempotency_key` returns same invoice, no duplicate journal)  
**AC3:** Invoice post produces correct GL entries (debit AP, credit expense/liability)  
**AC4:** Invoice void reverses GL entries correctly (debit reversal, credit reversal)  
**AC5:** Multi-currency invoice computes base amount correctly (`base = original * rate`)  
**AC6:** Concurrent invoice post with same ID is safe (row-locking or idempotency prevents duplicate posting)  
**AC7:** Integration tests written and 3× consecutive green  
**AC8:** Code review GO required

---

### Story 54.2 — AP Payment Write-Path Correctness Hardening
**Status:** backlog
**Owner:** @bmad-dev
**Type:** Correctness risk resolution

Prove that AP payment create, post, and allocate operations are correct, idempotent, and reduce invoice balances accurately.

**AC1:** Payment create idempotency proven (duplicate `idempotency_key` returns same payment)  
**AC2:** Payment post produces correct GL entries (debit AP, credit bank/cash)  
**AC3:** Partial payment reduces invoice open amount correctly  
**AC4:** Full payment sets invoice balance to zero without changing status to PAID incorrectly  
**AC5:** Overpayment is rejected or handled per business rules  
**AC6:** Payment allocation to multiple invoices is proportional and correct  
**AC7:** Concurrent payment post with same ID is safe  
**AC8:** Integration tests written and 3× consecutive green  
**AC9:** Code review GO required

---

### Story 54.3 — AP State Machine Integrity
**Status:** backlog
**Owner:** @bmad-dev
**Type:** Correctness risk resolution

Prove that the AP state machine (PO → GRN → Invoice → Payment) has valid transitions and no bypass paths.

**AC1:** All valid state transitions documented (PO: DRAFT→CONFIRMED→RECEIVED; Invoice: DRAFT→POSTED→VOIDED; Payment: DRAFT→POSTED→VOIDED)  
**AC2:** Invalid transitions are rejected (e.g., VOIDED → POSTED, DRAFT → VOIDED without posting)  
**AC3:** GRN-to-Invoice linkage is enforced (invoice line references valid GRN line)  
**AC4:** Payment-to-Invoice linkage is enforced (payment allocation references valid invoice)  
**AC5:** No bypass path exists to post invoice without GRN (if three-way matching is enabled)  
**AC6:** Integration tests written and 3× consecutive green  
**AC7:** Code review GO required

---

### Story 54.4 — Multi-Currency AP Correctness
**Status:** backlog
**Owner:** @bmad-dev
**Type:** Correctness risk resolution

Prove that multi-currency AP transactions (invoice, payment, credit note) handle exchange rates and base amounts correctly.

**AC1:** Exchange rate temporal lookup is deterministic (rate at transaction date, not current rate)  
**AC2:** Base amount precision is correct (DECIMAL(19,4), no floating-point drift)  
**AC3:** Multi-currency payment allocation uses correct rate for each invoice line  
**AC4:** FX gain/loss is computed and posted correctly when rate changes between invoice and payment  
**AC5:** Integration tests written and 3× consecutive green  
**AC6:** Code review GO required

---

### Story 54.5 — AP Period-Close Enforcement Hardening
**Status:** backlog
**Owner:** @bmad-dev
**Type:** Correctness risk resolution

Prove that AP period-close guardrails (from Epic 47) correctly block transactions in closed periods.

**AC1:** Posting to closed AP period is rejected with clear error  
**AC2:** Override path requires high privilege (COMPANY_ADMIN+) and is audited  
**AC3:** Backdated entries crossing period boundaries are blocked  
**AC4:** Timezone-aware period boundary is correct (company timezone, not UTC)  
**AC5:** Integration tests written and 3× consecutive green  
**AC6:** Code review GO required

---

### Story 54.6 — Follow-Up Closure Bucket
**Status:** backlog
**Owner:** @bmad-dev
**Type:** Defect resolution (follow-up)

> **Scope enforcement:** Story 54.6 MUST NOT introduce new scope. It is exclusively a follow-up closure bucket for defects/gaps surfaced by Stories 54.1–54.5.

Capture and resolve all defects and gaps surfaced by Stories 54.1–54.5. Epic 54 cannot close until this story is done.

**AC1:** All Story 54.1–54.5 defects captured with evidence  
**AC2:** All captured defects resolved with evidence  
**AC3:** No new P1/P2 defects introduced in fixes  
**AC4:** Post-fix 3-consecutive-green on all affected suites  
**AC5:** Risk register updated  
**AC6:** Sprint status updated

---

## 3) Epic 54 Risk Register

| Risk | Severity | Mitigation | Status |
|------|----------|------------|--------|
| R54-001: AP invoice post creates unbalanced journal | P0 | Story 54.1 AC3 | backlog |
| R54-002: AP payment allocation corrupts invoice balance | P0 | Story 54.2 AC3–AC4 | backlog |
| R54-003: AP state machine has invalid bypass path | P1 | Story 54.3 AC2–AC5 | backlog |
| R54-004: Multi-currency base amount precision loss | P1 | Story 54.4 AC2 | backlog |
| R54-005: Period-close enforcement has timezone bug | P1 | Story 54.5 AC4 | backlog |
| R54-006: Story 54.6 scope creep | P2 | Story 54.6 scope enforcement; epic gate | backlog |

---

## 4) Sprint 54 Kickoff Checkpoint Evidence

> **To be recorded at Sprint 54 kickoff**
> **Baseline:** SOLID/DRY/KISS initial assessment + P1/P2 risk register

### 4.1 SOLID/DRY/KISS Baseline

| Principle | Item | Status | Notes |
|-----------|------|--------|-------|
| **SRP** | Each AP correctness story targets one write path | Pass | Invoice, payment, state machine, FX, period close each have one focus in separate stories |
| **OCP** | AP write paths are open for extension without modifying core | Pass | `modules-purchasing` uses `modules-accounting` journal abstraction; adding new doc types doesn't modify post logic |
| **LSP** | AP subledger behaves consistently with AR subledger | Pass | Both use `modules-accounting` reconciliation service from Epic 51 with symmetric GL control account pattern |
| **ISP** | AP interfaces are lean (create, post, void, allocate) | Pass | Core operations only — no unnecessary method surface |
| **DIP** | AP posting depends on abstract journal interface | Pass | `modules-purchasing` posts via `modules-accounting` journal service, not directly to GL |
| **DRY** | Business logic: invoice balance update in one place | Pass | Balance updates via `updateInvoiceBalance()` in `ap-balance.ts` — single source of truth |
| **DRY** | Schema: AP Zod contracts in `packages/shared` | Pass | Invoice/Payment schemas in `packages/shared/src/schemas/purchasing/` |
| **DRY** | SQL: AP query patterns in `modules-purchasing` repositories | Unknown | Verify during story 54.1 — `purchase-invoice-repo.ts`, `ap-payment-repo.ts` have some repetition |
| **DRY** | ACL: `requireAccess()` centralized for AP routes | Pass | AP routes use canonical `requireAccess({ module: 'purchasing', resource: '...', permission: '...' })` |
| **DRY** | Test fixtures: canonical AP fixtures from owner package | Pass | `@jurnapod/modules-purchasing/test-fixtures` exports `createSupplierFixture`, purchasing accounts/settings fixtures |
| **KISS** | No over-engineering: simple correctness proofs | Pass | Direct assertions (balance = {expected}) over elaborate test frameworks |
| **KISS** | Readable over clever: explicit state transitions | Pass | State machine documented as explicit DRAFT→POSTED→VOIDED in story 54.3 |
| **KISS** | Small interfaces: AP service methods focused | Pass | Each AP method handles one operation (create, post, void, allocate) |
| **KISS** | Flat over nested: AP posting flow is linear | Pass | Invoice→Journal post is single `createAPInvoice`→`postJournalEntries` flow |
| **KISS** | Deferred complexity: three-way matching stays deferred | Pass | Explicitly documented as non-goal in charter §1.3 |

### 4.2 Initial Risk Baseline (P1/P2)

| Risk ID | Description | Severity | Initial Status | Mitigation Owner |
|---------|-------------|----------|----------------|------------------|
| R54-001 | AP invoice post creates unbalanced journal | P0 | backlog — must proof by story 54.1 AC3 | Story 54.1 |
| R54-002 | AP payment allocation corrupts invoice balance | P0 | backlog — must proof by story 54.2 AC3–AC4 | Story 54.2 |
| R54-003 | AP state machine has invalid bypass path | P1 | backlog — must proof by story 54.3 AC2–AC5 | Story 54.3 |
| R54-004 | Multi-currency base amount precision loss | P1 | backlog — must proof by story 54.4 AC2 | Story 54.4 |
| R54-005 | Period-close enforcement has timezone bug | P1 | backlog — must proof by story 54.5 AC4 | Story 54.5 |
| R54-006 | Story 54.6 scope creep | P2 | backlog — gate enforcement | Epic gate |

### 4.3 Hard Gate Status

| Gate ID | Requirement | Status |
|---------|-------------|--------|
| E54-A1 | Usage surface estimation in Story 54.1 spec | ✅ **VERIFIED** — present in story-54.1.md §E54-A1 |
| E54-A2 | Second-pass review checklist in every story spec | ✅ **VERIFIED** — present in all 6 story specs (54.1–54.6) |

> **Enforcement:** Implementors MUST verify E54-A1/E54-A2 presence before starting any Epic 54 work.

---

## 5) Exit Gate Criteria

Epic 54 can be marked `done` only when:

1. Story 54.1: AP invoice write-path correctness proven, 3× consecutive green, reviewer GO attached
2. Story 54.2: AP payment write-path correctness proven, 3× consecutive green, reviewer GO attached
3. Story 54.3: AP state machine integrity proven, 3× consecutive green, reviewer GO attached
4. Story 54.4: Multi-currency AP correctness proven, 3× consecutive green, reviewer GO attached
5. Story 54.5: AP period-close enforcement hardened, 3× consecutive green, reviewer GO attached
6. Story 54.6: All defects from 54.1–54.5 resolved, 3× green post-fix, risk register updated
7. No unresolved P0/P1 in Epic 54 scope
8. Sprint status validated: `npx tsx scripts/validate-sprint-status.ts --epic 54` exits 0

---

## 6) Retrospective (Max 2 Action Items)

```
## Epic 54 Retrospective — Max 2 Action Items

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
# Story 54.1 — AP Invoice Correctness
npm run test:single -- "apps/api/__test__/integration/purchasing/purchase-invoices.test.ts" -w @jurnapod/api

# Story 54.2 — AP Payment Correctness
npm run test:single -- "apps/api/__test__/integration/purchasing/ap-payments.test.ts" -w @jurnapod/api

# Story 54.3 — AP State Machine
# (new test suite to be created)

# Story 54.4 — Multi-Currency AP
npm run test:single -- "apps/api/__test__/integration/purchasing/exchange-rates.test.ts" -w @jurnapod/api

# Story 54.5 — Period-Close Enforcement
npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts" -w @jurnapod/api

# Story 54.6 — All affected suites 3× green

# Epic close gate
npx tsx scripts/validate-sprint-status.ts --epic 54
# Expected: exit 0 — "Sprint 54 closure gate: GO"
```
