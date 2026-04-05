# Epic 32 Sprint Plan (Corrected)

## Overview

**Epic:** Financial Period Close & Reconciliation Workspace  
**Duration:** 2 sprints (rebaselined from 1)  
**Goal:** Deliver production-safe period close and reconciliation workflows with strict idempotency, concurrency control, and auditability.

## Hard Prerequisite Gate (Must Pass Before Any 32.x Story)

Epic 32 work may begin only when all are true:

1. Epic 31 route-thinning lane complete for accounting/reporting surfaces (Story 31.7)
2. Epic 31 adapter migration prep complete with proven package adapter contracts (Story 31.8A)
3. Import boundary lint enforcement active in CI (no `packages/** -> apps/api/**`)
   - **Note:** ESLint boundary rules are already implemented in package configs (`no-restricted-imports`)
   - **Action Item 2 from retrospective:** CI pipeline setup pending — ensure lint gates are wired to fail on boundary violations

## Rebaseline Summary

| Story | Previous | Corrected | Rationale |
|---|---:|---:|---|
| 32.1 Fiscal year close procedure | 4h | 20h | Includes idempotency + row locks + atomic tx + posting/audit integration |
| 32.2 Multi-period reconciliation dashboard | 4h | 14h | Requires explicit subledger contracts and explainable variance mapping |
| 32.3 Trial balance validation | 4h | 12h | Cross-period comparisons + imbalance checks + checklist service |
| 32.4 Period transition audit trail | 3h | 10h | Immutable audit design + query surfaces + compliance filtering |
| 32.5 Roll-forward workspace UI | 5h | 16h | Integrates all upstream outputs with stateful gating |

**Total:** 72h (vs previous 20h)

## Corrected Dependency Graph

```
G0: Epic-31 gate (31.7 + 31.8A + boundary CI)  [hard prerequisite]
        ↓
      32.1  (period close engine)
      ├── 32.2 (reconciliation views/contracts)
      └── 32.4 (audit trail)
              
32.3 depends on: 32.1 + 32.2

32.5 depends on: 32.1 + 32.2 + 32.3 + 32.4
```

## Sprint Breakdown

## Sprint 1 (Core Close Engine + Reconciliation Foundations) — 44h

### Story 32.1: Fiscal Year Close Procedure
- **Estimate:** 20h
- **Priority:** P1
- **Dependencies:** G0 gate
- **Focus:**
  - Idempotent close-approval command (`close_request_id` / idempotency key)
  - Concurrency control with `SELECT ... FOR UPDATE` on fiscal year + periods
  - Atomic transaction boundary: lock + close transitions + closing entries + audit
  - Manual approval workflow and error-safe retries

### Story 32.2: Multi-Period Reconciliation Dashboard
- **Estimate:** 14h
- **Priority:** P1
- **Dependencies:** 32.1
- **Focus:**
  - GL-vs-subledger contract per account family
  - Variance explainability and drill-down links
  - Epic 30 metric integration for imbalance visibility

### Story 32.4: Period Transition Audit Trail
- **Estimate:** 10h
- **Priority:** P1
- **Dependencies:** 32.1 (parallel with 32.2)
- **Focus:** Immutable and queryable audit timeline for close/adjust/reopen decisions

## Sprint 2 (Validation + Workspace Orchestration) — 28h

### Story 32.3: Trial Balance Validation with Variance Reporting
- **Estimate:** 12h
- **Priority:** P1
- **Dependencies:** 32.1 + 32.2
- **Focus:** pre-close checklist data source (TB balance + subledger variance + GL imbalance)

### Story 32.5: Roll-Forward Workspace UI
- **Estimate:** 16h
- **Priority:** P1
- **Dependencies:** 32.1 + 32.2 + 32.3 + 32.4
- **Focus:** single operational workspace with hard progression gates and approval traceability

---

## Architecture Notes (Period Close Critical Decisions)

1. **Idempotency:** `POST /accounts/fiscal-years/:id/close/approve` must require an idempotency key scoped by `company_id + fiscal_year_id + action`.
2. **Lock strategy:** use `SELECT ... FOR UPDATE` for fiscal-year row and all period rows in close scope.
3. **Atomicity:** close state transitions + closing journal creation + audit write occur in one DB transaction.
4. **Closing docs:** post as explicit journal document types (`PERIOD_CLOSE_PREVIEW`, `PERIOD_CLOSE_FINAL`).
5. **Approval workflow:** prepare → review discrepancies → approve close; approval is role-restricted and auditable.

---

## Key Risks & Decisions

| # | Risk | Decision |
|---|------|----------|
| 1 | Double-close under retries/concurrency | Idempotency key + row locks + atomic transaction |
| 2 | Partial close writes corrupt audit/compliance trail | Single transaction for lock+close+journal+audit |
| 3 | Reconciliation disputes due to undefined subledger mapping | Formal GL-vs-subledger contract per account family |
| 4 | Workspace allows premature close | Hard prerequisite checklist gating in 32.5 |

---

## Validation Commands

### 32.1 / 32.2 / 32.3 / 32.4
```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

### 32.5 (integration gate)
```bash
npm run lint --workspaces --if-present
npm run typecheck --workspaces --if-present
npm run build --workspaces --if-present
```
