# Epic 61: Sales & Purchasing Lifecycle Correctness

**Status:** planned
**Sprint:** 61
**Theme:** Prove sales and purchasing document lifecycles are immutable post-finalization, journal-linked, and tenant-safe. Close remaining Epic 55–60 deferred debt.
**Primary Modules:** `apps/api`, `@jurnapod/modules-sales`, `@jurnapod/modules-purchasing`, `@jurnapod/modules-accounting`
**Predecessor:** Epic 60 (Tenant + ACL Correctness Hardening)
**Exit Gate:** P0/P1 = 0 in epic scope; sales + purchasing critical suites green; `validate-sprint-status.ts` exits 0.

---

## 0) Predecessor Unblock

Epic 61 MUST NOT begin before Epic 60 close gates are confirmed.

| Gate ID | Requirement | Artifact | Status |
|---------|-------------|----------|--------|
| E60-G1 | No unresolved P0/P1 in Epic 60 scope | sprint-status + review output | required |
| E60-G2 | Tenant scoping + ACL suites green | Epic 60 gate evidence | required |
| E60-G3 | Epic 60 retrospective complete | epic-60.retrospective.md | required |

---

## 1) Charter

### 1.1 Program Alignment

Epic 61 continues S48–S61 correctness-first sequencing. Building on:
- Epic 58 (Inventory/Costing) — stock movement + COGS correctness
- Epic 59 (POS) — push lifecycle + idempotency + reversal
- Epic 60 (Tenant/ACL) — scoping + resource enforcement + role boundaries

Epic 61 targets **sales and purchasing document lifecycles**: immutable finalization, journal reconciliation, and closing deferred debt from the Epic 55–60 wave.

### 1.2 What We Know

- Sales documents: invoices, orders, payments, credit notes. Each has a lifecycle (DRAFT → POSTED → VOID).
- Purchasing documents: purchase orders, goods receipts, AP invoices, AP payments, supplier credits. Each has a lifecycle.
- Finalized records are immutable — correction is VOID/REFUND only (reinforced in Epic 59).
- All documents must reconcile to journal effects (accounting/GL as source of truth).
- Tenant isolation and ACL enforcement are verified across all modules (Epic 60).
- Void operations use DELETE permission (ACL convention established post-Epic 60).

### 1.3 Non-Goals

- No net-new features or modules.
- No frozen-app scope expansion without explicit exception.
- No business-logic DB triggers.
- No new per-epic gate scripts — use generic validators only.

---

## 2) Requirements Inventory

### Functional Requirements

| FR | Requirement | Enforcement |
|----|-------------|-------------|
| FR1 | Sales invoice lifecycle transitions MUST be valid and immutable post-finalization. | lifecycle audit + integration tests |
| FR2 | Sales payment lifecycle MUST enforce status integrity and FX delta handling. | state machine audit |
| FR3 | Purchase order → goods receipt → AP invoice chain MUST be consistent. | document flow integration tests |
| FR4 | AP invoice/payment lifecycle MUST enforce period-close guards. | close window integration tests |
| FR5 | All finalized sales/purchasing documents MUST reconcile to journals. | reconciliation tests |
| FR6 | Remaining Epic 55–60 deferred debt items MUST be closed or formally tracked. | debt register audit |

### Non-Functional Requirements

| NFR | Requirement | Validation |
|-----|-------------|------------|
| NFR1 | P0/P1 defects in epic scope MUST be zero at close gate. | review gate |
| NFR2 | No regression on existing tenant/ACL enforcement. | cross-module negative tests still green |
| NFR3 | All lifecycle guards enforced in app code — no DB triggers. | `npm run lint:migrations` |

---

## 3) Story Breakdown

### Story 61.1 — Sales Invoice Lifecycle Correctness
**Status:** planned
**Type:** lifecycle correctness
**Risk:** P0
**FR Coverage:** FR1, FR5

Prove invoice lifecycle transitions (DRAFT→POSTED→VOID) are state-machine-valid and immutable post-finalization. Verify POSTED invoices reject mutation and only accept VOID via DELETE permission. Reconcile invoice journal postings.

### Story 61.2 — Sales Payment Lifecycle & FX Correctness
**Status:** planned
**Type:** lifecycle + multicurrency correctness
**Risk:** P0
**FR Coverage:** FR2, FR5

Prove payment lifecycle transitions are valid and idempotent. Verify FX delta acknowledgment workflow is correct. Test that posted payments have balanced journal effects and cannot be silently mutated.

### Story 61.3 — Purchasing Document Chain Correctness
**Status:** planned
**Type:** document flow correctness
**Risk:** P0
**FR Coverage:** FR3

Prove the PO→receipt→AP invoice chain is consistent. Test that received quantities match ordered quantities, AP invoices reference valid receipts, and document status transitions are atomic. Add integration tests for the full procurement flow.

### Story 61.4 — AP Invoice/Payment Lifecycle & Period-Close Enforcement
**Status:** planned
**Type:** lifecycle + close-guard correctness
**Risk:** P1
**FR Coverage:** FR4

Prove AP invoice and payment lifecycles enforce period-close guards. Test that posting to a closed fiscal year is rejected. Verify void/correction flows use DELETE permission and create reversal journals.

### Story 61.5 — Deferred Debt Closure (Epic 55–60 Carry-Over)
**Status:** planned
**Type:** debt closure
**Risk:** P2
**FR Coverage:** FR6

Audit and close or formally track all remaining P2/P3 deferred items from Epics 55–60. Key items include:
- ACCOUNTANT treasury READ blocked (seed data or matrix)
- No void route for payments (feature gap assessment)
- Epic 54 F5 (multi-currency AP reconciliation edge case)
- Epic 55 F1 (snapshot race condition follow-up)
- Story 59.8c descoped (out-of-order push reconciliation)

### Story 61.6 — Sales↔Purchasing↔GL Reconciliation Gate
**Status:** planned
**Type:** cross-module reconciliation correctness
**Risk:** P1
**FR Coverage:** FR5

Prove that sales and purchasing journal postings reconcile to their respective subledgers (AR aging, AP aging). Add integration tests verifying sales revenue↔AR and purchasing expense↔AP. Gate automation: machine-verifiable reconciliation thresholds.

---

## 4) Epic Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R61-001 | P0 | Invoice/payment lifecycle gaps allow silent mutation of finalized records | Lifecycle audit + immutability integration tests |
| R61-002 | P0 | PO→receipt→AP invoice chain has missing validation | Document flow integration tests |
| R61-003 | P1 | Period-close guards missing on AP posting paths | Close window integration tests |
| R61-004 | P2 | Deferred debt accumulation across multiple epics | Dedicated debt closure story (61.5) |

---

## 5) Preconditions

| # | Precondition | Enforcement |
|---|--------------|-------------|
| 1 | Epic 60 close gate complete | MUST verify before Story 61.1 |
| 2 | `npm run lint -w @jurnapod/api` passes at kickoff | pre-flight gate |
| 3 | `npm run typecheck -w @jurnapod/api` passes at kickoff | pre-flight gate |
| 4 | Sprint-status append-only protocol active | MUST use update utility |

---

## 6) Exit Gate

1. **Correctness Gate:** Sales + purchasing lifecycle suites green.
2. **Risk Gate:** Unresolved P0/P1 in epic scope = 0.
3. **Evidence Gate:** All generic validators exit 0.
4. **Debt Gate:** Epic 55–60 deferred items audited and either closed or tracked with owner + deadline.

---

## 7) Sprint Kickoff Checkpoint

### 7.1 Pre-Flight Gate

```bash
npm run lint -w @jurnapod/api
npm run typecheck -w @jurnapod/api
npx tsx scripts/validate-sprint-status.ts
```

### 7.2 SOLID/DRY/KISS Baseline

| Principle | Score |
|-----------|-------|
| SOLID | Unknown |
| DRY | Unknown |
| KISS | Unknown |

---

## 8) Validation Commands

```bash
npm run lint -w @jurnapod/api
npm run typecheck -w @jurnapod/api
npm run test:integration -w @jurnapod/api
npx tsx scripts/validate-sprint-status.ts
npx tsx scripts/validate-structure-conformance.ts
npx tsx scripts/validate-fixture-flow.ts -w @jurnapod/api
```

---

_Last Updated: 2026-05-09_
