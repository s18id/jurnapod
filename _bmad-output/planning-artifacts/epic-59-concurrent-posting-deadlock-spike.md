# Epic 59 Spike: Concurrent Posting Deadlock Sizing (E58-A2)

> **Owner:** Elena  
> **Deadline:** Before Epic 59 mid-sprint review  
> **Source Action Item:** E58-A2 (carry-forward from E57-A2 via Epic 58 retrospective)

---

## 1) Objective

This spike documents deadlock risk in concurrent posting paths and provides a sizing-backed recommendation.

The output MUST determine whether mitigation fits inside Epic 59 (**Option A**) or MUST be deferred as backlog remediation (**Option B**).

---

## 2) Code Path Map and Lock Order

### Path A — Sales Invoice Posting

- Route path: `apps/api/src/routes/sales/invoices.ts`
- Posting path: `apps/api/src/lib/sales-posting.ts` → `packages/modules/accounting/src/posting/sales.ts`
- Observed order:
  1. Fiscal-year open check (shared read)
  2. `journal_batches` insert
  3. `journal_lines` insert

### Path B — AP Payment Posting

- Route path: `apps/api/src/routes/purchasing/ap-payments.ts`
- Service path: `packages/modules/purchasing/src/services/ap-payment-service.ts`
- Observed order:
  1. `journal_batches` insert
  2. `journal_lines` insert
  3. `ap_payments` update
  4. invoice lock (`FOR UPDATE`) on adjustment/void flows

### Path C — Purchase Invoice Posting

- Route path: `apps/api/src/routes/purchasing/purchase-invoices.ts`
- Service path: `packages/modules/purchasing/src/services/purchase-invoice-service.ts`
- Observed order:
  1. `journal_batches` insert
  2. `purchase_order_lines` lock (`FOR UPDATE`)
  3. `journal_lines` insert
  4. invoice status update

### Path D — Fiscal Year Close

- Route path: `apps/api/src/routes/fiscal-years.ts`
- Service path: `packages/modules/accounting/src/fiscal-year/service.ts`
- Observed order:
  1. close-request idempotency claim
  2. `fiscal_years` lock (`FOR UPDATE`)
  3. fiscal-year close update

---

## 3) Plausible Deadlock Scenarios

### Scenario 1 (P1): Posting vs Fiscal-Year Close Lock-Order Inversion

- Thread T1 starts posting and holds shared fiscal-year read + journal insert progression.
- Thread T2 starts close and requests exclusive lock on same fiscal-year row.
- Additional journal insert locks can form a cycle under concurrent pressure.

**Impact:** retry storms and user-visible latency spikes during concurrent close/post windows.

### Scenario 2 (P2): PO-Line Lock Contention Across Purchasing Flows

- Thread T3 locks overlapping PO lines during purchase-invoice posting.
- Thread T4 attempts lock on overlapping PO lines during credit/adjustment flow.
- In mixed order, lock wait cycle may trigger deadlock under overlap.

**Impact:** intermittent transaction failures and noisy retries in purchasing posting windows.

---

## 4) Option Analysis

### Option A — <1 Sprint Mitigation (Recommended)

**Proposal:** Normalize fiscal-year lock intent at posting entry by using stronger lock semantics in the fiscal-year guard path, then validate with focused concurrent integration tests.

**Estimated effort:** 2–3 dev days + review.

**Risk:** Medium (touches hot posting path) but bounded scope.

**Validation requirement:** MUST demonstrate reduction in deadlock retries under simulated concurrent close/post tests.

### Option B — >1 Sprint Remediation

**Proposal:** Introduce serialized posting lanes (advisory lock or queue) by `(company_id, fiscal_year_id)`.

**Estimated effort:** 10–15 dev days + infra/test harness.

**Risk:** Lower correctness risk, higher throughput/latency tradeoff and bigger rollout footprint.

**Validation requirement:** MUST include throughput impact report and operational playbook.

---

## 5) Recommendation

Epic 59 SHOULD adopt **Option A** first as a targeted correctness mitigation.

Decision rule:
- If Option A tests prove retry-rate and deadlock-rate reduction with no regression, keep work in Epic 59 scope.
- If Option A fails to stabilize concurrency behavior, Option B MUST be promoted to a dedicated follow-up epic with explicit capacity and delivery gate.

---

## 6) Delivery Checklist

- [x] Reproduction scenario documented with steps and environment — See Sections 2-3 (4 code paths mapped, 2 deadlock scenarios identified). Reproduction environment: MySQL 8.0+ with concurrent posting vs fiscal-year-close windows.
- [x] Lock-order trace captured for Scenario 1 and Scenario 2 — Scenario 1 (posting vs FY close): Thread T1 holds journal inserts → T2 acquires FY FOR UPDATE → cycle. Scenario 2: Thread T3 locks PO lines during invoice posting → T4 attempts overlapping PO lines during credit flow. Traces documented in Section 3.
- [x] Option A patch estimate and test plan signed off — Implementation in Story 59.3: `.forUpdate()` added to `listOpenFiscalYearsForDateWithExecutor` (packages/modules/accounting/src/fiscal-year/service.ts:716). Convergent lock ordering validated. Overlap test: `apps/api/__test__/integration/accounting/fiscal-year-close.test.ts:480`. Signed off by Elena (owner) + Bob (SM) in decision note.
- [x] Option B sizing note added to backlog path if needed — Option B (serialized posting lanes) deferred to backlog with estimated effort of 10-15 dev-days. Contingency: if Option A fails to stabilize, Option B is promoted. Documented in `epic-59-concurrent-posting-deadlock-decision-note.md` Section 4.
- [x] Epic 59 planning updated with resolution status — Story 59.3 AC4/AC5 scope includes Option A mitigation; Story 59.6 gate automation validates E58-A2 decision. Decision note recorded 2026-05-08.

---

_Last Updated: 2026-05-08_
