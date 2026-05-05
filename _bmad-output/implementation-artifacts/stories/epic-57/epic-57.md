# Epic 57 — AR + Treasury Correctness

> **Owner:** Architecture Program (Correctness > Safety > Speed)
> **Status:** planned
> **Sprint:** 57 (per S48–S64 blueprint, re-baselined 2026-05-05)
> **Theme:** Prove AR invoice lifecycle, payment posting, and credit/void/refund invariants are correct; prove treasury handoff and reconciliation consistency.
> **Primary Modules:** `modules-sales` (AR), `modules-treasury`
> **Predecessor:** Epic 56 (Correctness Infrastructure) — archive flow unblocked, trigger 0201 active, CI lint gate operational
> **Exit Gate:** No unresolved P0/P1 in AR/treasury scope; handoff and posting consistency proven with tests

---

## 0) Epic 56 Unblock Evidence

Epic 56 (Correctness Infrastructure) closed both E55-A1 and E55-A2, unblocking this epic:

| Item | Evidence | Status |
|------|----------|--------|
| Archive flow unblocked | Migration 0201 allows `status='ARCHIVED'`; trigger 0201 active; 24/24 tests pass | ✅ done |
| CI lint gate operational | `npm run lint:migrations` exits 0; 16 triggers grandfathered | ✅ done |
| Trigger 0201 verified for AP | Story 56.1 AC2 passes; archive transition allowed | ✅ done |

**Trigger 0201 applicability to AR:** The trigger (`trg_ap_reconciliation_snapshots_before_update`) operates on `ap_reconciliation_snapshots` — the shared AP/AR reconciliation snapshot table. AR invoice voids write to `sales_invoices` (not `ap_reconciliation_snapshots`) and are **not** blocked by trigger 0201 (different table). AR invoice immutability is application-enforced via status checks in `invoice-service.ts:971-973` (payment status guard) and `sales-db.ts:572-574` (idempotent re-void guard). Story 57.1 must verify this trigger does not block AR snapshot archive paths before Stories 57.2–57.4 proceed.

---

## 1) Charter

### 1.1 Program Alignment

Epic 57 is Sprint 57 in the S48–S64 Correctness-First Architecture Blueprint:

| Sprint | Blueprint Focus | Epic 57 Alignment |
|--------|-----------------|-------------------|
| 56 | Correctness infrastructure | **This epic's predecessor** — archive flow unblocked, trigger 0201 active |
| **57** | **AR + Treasury correctness** | **This epic** — AR invoice lifecycle, payment posting, credit/void/refund, treasury handoff |
| 58 | Inventory/costing correctness | Depends on Epic 57 AR/treasury handoff correctness |
| 59+ | POS, Tenant/ACL, Sync, etc. | Downstream correctness pipeline |

### 1.2 What We Know

**Epic 55 (done):** AP reconciliation/snapshot correctness. Established pattern for snapshot chain, audit trail, and archive lifecycle for AP.

**Epic 56 (done):** Correctness Infrastructure. Trigger 0201 now allows `status='ARCHIVED'` on `ap_reconciliation_snapshots`. The `ap_reconciliation_audit_trail` table captures `action_type: 'ARCHIVED'` for AP.

**AR context:** Accounts Receivable correctness shares the same `ap_reconciliation_snapshots` table with AP. Trigger 0201 applies to AR snapshot rows identically to AP. Archive path is the same: `status='ARCHIVED'`, `archived_at`, `archive_version`. AR invoice voids write to `audit_logs` (entity_type=`sales_invoice`, action=`VOID`), not to `ap_reconciliation_audit_trail`.

**Treasury context:** Treasury handles cash/bank movements. AR payments debit a receivable account and credit a cash/bank account. Journal entries must reconcile: total debits = total credits for every treasury-side posting.

**Known shared invariants:**
- `ap_reconciliation_snapshots`: `status IN ('ACTIVE', 'ARCHIVED')` (AR rows use ACTIVE; POSTED is an invoice status, not a snapshot status)
- Archive: `status='ARCHIVED'`, `archived_at` set, `archive_version` incremented per archive event
- Immutability: finalized records (POSTED) cannot be mutated — use VOID/REFUND pattern
- Supersession chain: `superseded_by_snapshot_id` links version chain
- Trigger 0201: allows archive transition; blocks all other non-archive mutations

### 1.3 Non-Goals

- Net-new AR or treasury features (correctness hardening only)
- Changes to `apps/backoffice` or `apps/pos` (frozen per architecture-first scope freeze)
- New API endpoints — validate existing contracts only
- Work on inventory, costing, POS, or other modules outside AR/treasury scope

---

## 2) Story Breakdown

### Story 57.1 — AR Snapshot/Archive Trigger Compatibility Verification
**Status:** planned
**Type:** Correctness pre-condition
**Risk:** P1 — must verify trigger 0201 before Stories 57.2–57.4

Verify that trigger 0201 (from Epic 56) operates correctly for AR snapshot paths. AR shares the `ap_reconciliation_snapshots` table with AP. This story confirms no AR-specific column or state blocks the trigger's archive path before AR write-path stories begin.

**AC1:** Trigger 0201 permits AR snapshot INSERT on `ap_reconciliation_snapshots`
**AC2:** Trigger 0201 permits AR snapshot archive transition (`status='ARCHIVED'`)
**AC3:** Trigger 0201 blocks non-archive UPDATE on AR snapshot rows (preserves immutability)
**AC4:** Trigger 0201 blocks DELETE on AR snapshot rows
**AC5:** Re-archive UPDATE to `status='ARCHIVED'` succeeds (idempotent)
**AC6:** `company_id` isolation enforced on AR snapshot queries
**AC7:** No new migration needed — trigger operates on shared table
**AC8:** Code review GO required

---

### Story 57.2 — AR Invoice + Payment Posting Correctness
**Status:** planned
**Type:** AR write-path correctness
**Risk:** P1 — journal handoff must be balanced and tenant-scoped

Prove AR invoice creation and payment posting produce correct, balanced journal entries with proper tenant isolation.

**AC1:** AR invoice creation debits receivable account and credits revenue account (balanced journal)
**AC2:** AR payment application debits cash/bank and credits receivable account (balanced journal)
**AC3:** Tenant isolation: AR invoices/payments for company A never appear in company B
**AC4:** Idempotency: duplicate AR invoice with same `client_ref` returns DUPLICATE, not double-post
**AC5:** Immutability: POSTED AR invoice cannot be modified — VOID pattern required
**AC6:** Validation: rejected AR invoice with invalid `company_id` or `customer_id` returns 400

---

### Story 57.3 — AR Credits/Void/Refund Invariants
**Status:** planned
**Type:** AR correction pattern correctness
**Risk:** P1 — finalized-record immutability must be enforced
**Scope note:** `POST /sales/invoices/{id}/void` route implemented. `voidInvoice()` does not write `audit_logs` and `sales_invoices` lacks `voided_at`/`voided_by` — both gaps must be addressed in Story 57.3 implementation.

Prove that AR credit notes and void corrections are implemented as immutable finalized records using the VOID/REFUND pattern (not silent mutation). Audit trail must track each correction.

**AC1:** AR credit note creates new accounting effect (not a mutation of original invoice)
**AC2:** AR void endpoint marks original invoice as voided — no ledger amounts changed; void endpoint must be implemented in this story
**AC3:** AR refund endpoint returns 404 — deferred beyond Epic 57 pending treasury handoff
**AC4:** All correction actions (credit note, void) logged in `audit_logs` with entity_type=`sales_invoice` and action in {`CREDIT_NOTE`, `VOID`}
**AC5:** Immutability enforced: voided POSTED invoices reject UPDATE attempts with 409
**AC6:** Trigger 0201 blocks any non-archive UPDATE on finalized AR snapshots (application-layer translation)

---

### Story 57.4 — Treasury Handoff + Reconciliation Correctness
**Status:** planned
**Type:** Treasury write-path + AR/treasury handoff
**Risk:** P1 — treasury posting must balance; AR→treasury handoff must be consistent

Prove treasury cash/bank transactions post correctly, balance at journal level, and reconcile consistently with AR payment applications.

**AC1:** Treasury payment creates balanced journal: debits expense/cost account, credits cash/bank
**AC2:** AR payment (Story 57.2) creates treasury-compatible journal entries and `treasury_transaction` row
**AC3:** AR payment handoff to treasury: cash account credited by AR payment = debited by treasury receipt
**AC4:** Reconciliation: running balance of cash/bank account matches sum of treasury transactions (verified via direct query)
**AC5:** Tenant isolation: treasury transactions scoped to `company_id`, `outlet_id`
**AC6:** Immutability: POSTED treasury transactions use VOID pattern via `POST /cash-bank-transactions/{id}/void`, not mutation

---

## 3) Epic 57 Risk Register

| Risk | Severity | Mitigation | Status |
|------|----------|------------|--------|
| R57-001: Trigger 0201 blocks AR snapshot creation or archiving | P0 | Story 57.1 verifies trigger behavior for AR before 57.2–57.4 begin | planned |
| R57-002: AR invoice journal entries unbalanced (debits ≠ credits) | P0 | Story 57.2 AC1/AC2 — balanced-journal invariants tested | planned |
| R57-003: AR payments do not reconcile to treasury cash account | P1 | Story 57.4 AC3 — AR→treasury handoff correctness proven | planned |
| R57-004: AR credit/void/refund violates immutability (silent mutation) | P1 | Story 57.3 AC5/AC6 — trigger 0201 + VOID pattern enforced | planned |
| R57-005: Tenant isolation gap in shared snapshot table (AP+AR) | P1 | All stories enforce `company_id` scoping; Stories 57.1/57.2 include isolation tests | planned |
| R57-006: Existing AP snapshot tests regress after AR changes | P2 | Story 57.1 reruns existing tests and verifies no regression | planned |
| R57-007: AR/treasury fixture gap — no canonical fixtures for AR domain | P2 | Story 57.2/57.4 create AR/treasury fixtures in owner package per owner-package model | planned |
| R57-008: `POST /sales/invoices/{id}/void` endpoint implemented | P0 | ✅ Route implemented in `apps/api/src/routes/sales/invoices.ts` (voidInvoice service exists); audit trail write still pending | resolved |
| R57-009: `POST /sales/payments/{id}/refund` endpoint deferred beyond Epic 57 | P1 | Refund endpoint deferred; tracked as post-epic follow-up | planned |
| R57-010: Schema idempotency field mismatch (`client_tx_id` vs `client_ref`) | P0 | Fixed: Stories now use `client_ref` (matching production contract) | resolved |
| R57-011: AR type discriminators not present in schema | P1 | Stories removed `type='ar_invoice'` assumptions; ACs rewritten to match actual contract | resolved |
| R57-012: `voidInvoice()` does not write to `audit_logs`; `voided_at`/`voided_by` absent from `sales_invoices` | P0 | ✅ Migration `0203_sales_invoices_voided_at_by.sql` exists; VOID branch in `sales-db.ts:578-579` sets `voided_at`/`voided_by` and writes `audit_logs` with `action='VOID'`; invoice-service void rejects already-voided invoices with 409 (idempotent); R57-012 is resolved | resolved |

---

## 4) Sprint 57 Kickoff Checkpoint

### 4.1 Pre-Flight Gate

Before starting Story 57.1, verify:
1. Epic 56 both stories done (`epic-56: done` in sprint-status.yaml)
2. Trigger 0201 exists in `packages/db/migrations/0201_allow_archive_path.sql`
3. `npm run lint:migrations` exits 0
4. `npx tsx scripts/validate-sprint-status.ts --epic 56` exits 0

### 4.2 SOLID/DRY/KISS Baseline

| Principle | Item | Status | Notes |
|-----------|------|-------|-------|
| **SRP** | Each story targets one AR/treasury correctness domain | TBD | Kickoff to confirm |
| **OCP** | Archive trigger (0201) extended to AR without modifying AP behavior | TBD | Story 57.1 proof |
| **LSP** | AR write-path behaves consistently with AP write-path patterns | TBD | Stories 57.2–57.4 |
| **ISP** | AR invoice, payment, credit, treasury modules have focused interfaces | TBD | Cross-module decision gate |
| **DIP** | AR service depends on accounting journal abstraction | TBD | Cross-module decision gate |
| **DRY** | AR and AP share snapshot/audit schema without duplication | TBD | Story 57.1 verifies |
| **KISS** | Archive path uses existing trigger 0201; no new migration for AR | TBD | Story 57.1 |

### 4.3 Exit Gate Criteria

1. Story 57.1: Trigger 0201 verified for AR, all AR archive scenarios pass
2. Story 57.2: AR invoice + payment posting correct, journal balanced, idempotent
3. Story 57.3: Credit/void use VOID pattern, immutability enforced, audit trail write for VOID added; refund deferred beyond Epic 57
4. Story 57.4: Treasury handoff correct, AR→treasury reconcile, balanced journal
5. All stories: P0/P1 resolved, no regressions in existing AP tests
6. Sprint status validated: `npx tsx scripts/validate-sprint-status.ts --epic 57` exits 0

---

## 5) Validation Commands

```bash
# Story 57.1 — AR Snapshot/Trigger Compatibility
npm run test:single -- "apps/api/__test__/integration/sales/ar-snapshot-trigger-compatibility.test.ts" -w @jurnapod/api

# Story 57.2 — AR Invoice + Payment Posting
npm run test:single -- "apps/api/__test__/integration/sales/ar-invoice-posting.test.ts" -w @jurnapod/api

# Story 57.3 — AR Credits/Void/Refund
npm run test:single -- "apps/api/__test__/integration/sales/ar-credit-void-refund.test.ts" -w @jurnapod/api

# Story 57.4 — Treasury Handoff + Reconciliation
npm run test:single -- "apps/api/__test__/integration/treasury/treasury-reconciliation.test.ts" -w @jurnapod/api

# Epic close gate
npx tsx scripts/validate-sprint-status.ts --epic 57
```

---

## 6) Epic 56 Knowledge Carry-Forward

| Epic 56 Pattern | Epic 57 Application |
|-----------------|---------------------|
| Trigger 0201 archive path (`status='ARCHIVED'`) | AR snapshot archive (57.1) |
| `archive_version` incrementing per archive event | AR snapshot versioning (57.1) |
| `archived_at` nullable column (set on first archive) | AR snapshot lifecycle tracking (57.1) |
| `ap_reconciliation_audit_trail` with `action_type` | AR void uses `audit_logs` (entity_type=`sales_invoice`, action=`VOID`); `voided_at`/`voided_by` columns needed on `sales_invoices` (57.3) |
| `SELECT ... FOR UPDATE + inputsHash` idempotency | AR invoice idempotency via `client_ref` (57.2) |
| Snapshot chain (`superseded_by_snapshot_id`) | AR snapshot version chain (57.1) |
| CI lint gate (`npm run lint:migrations`) | Any new migrations in Epic 57 must pass lint gate |

---

_Last Updated: 2026-05-05_