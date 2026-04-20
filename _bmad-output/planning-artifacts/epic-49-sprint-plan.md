# Sprint Plan: Epic 49

> **Epic:** Test Determinism + CI Reliability
> **Duration:** 1 sprint (2 weeks)
> **Goal:** Achieve a stable, deterministic integration test baseline across all critical suites, with CI-enforced gates and 3-consecutive-green evidence for sprint closure.

---

## Program Alignment (MANDATORY)

This sprint is governed by:

- `_bmad-output/planning-artifacts/sprint-48-61-correctness-first-architecture-blueprint.md`
- Priority: `Correctness > Safety > Speed`
- No net-new features in sprint scope
- Architecture-first freeze: `apps/backoffice` and `apps/pos` are frozen (emergency/regulatory/security fixes only)

---

## Hard Prerequisite Gate (Must Pass Before Story 49.2+)

1. Epic 49 epic definition created (`epic-49.md`)
2. Story 49.1 (Kickoff Gate + Test Reliability Audit) must be completed first
3. Epic 48.6 (Type/Lint Debt Containment) must be landed before Story 49.6 (CI gate) can close

---

## Dependency Graph

```text
49.1 Kickoff Gate + Test Reliability Audit
    ├── 49.2 Accounting Suite Determinism Hardening
    ├── 49.3 Purchasing Suite Determinism Hardening
    ├── 49.4 Platform + ACL Suite Determinism Hardening
    ├── 49.5 Sync + POS + Inventory Suite Determinism Hardening
    └── (all above depend on 49.1 audit output)

49.6 CI Pipeline Reliability Enforcement  depends on: 49.2 + 49.3 + 49.4 + 49.5
49.7 Pre-Close Validation + Final Gate      depends on: 49.1 + 49.2 + 49.3 + 49.4 + 49.5 + 49.6
```

---

## Sprint Breakdown

### Story 49.1 — Kickoff Gate + Test Reliability Audit
- **Priority:** P1
- **Dependencies:** None (first story)
- **Focus:**
  - Full SOLID/DRY/KISS kickoff scorecard (baseline `Unknown` scores)
  - Audit ALL integration suites for determinism categories (time-dependent, pool cleanup, shared state, ordering)
  - Suite classification: critical vs non-critical
  - Initialize Epic 49 risk register
  - Capture baseline integration run evidence

### Story 49.2 — Accounting Suite Determinism Hardening
- **Priority:** P1
- **Dependencies:** 49.1 (audit output)
- **Focus:**
  - Hardening for: `ap-exceptions`, `reconciliation`, `period-close`, `trial-balance`, `invoices-discounts`, `invoices-update`, `orders`, `credit-notes-customer`
  - Replace `Date.now()`/`Math.random()` with deterministic fixtures
  - Verify pool cleanup + RWLock pattern
  - 3-consecutive-green rerun proof per suite

### Story 49.3 — Purchasing Suite Determinism Hardening
- **Priority:** P1
- **Dependencies:** 49.1
- **Focus:**
  - Hardening for: `purchase-orders`, `goods-receipts`, `purchase-invoices`, `ap-payments`, `purchase-credits`, `suppliers`, `supplier-statements`, `exchange-rates`, `ap-aging-report`, `po-order-no.concurrency`, `supplier-soft-delete`, `supplier-contacts`, `suppliers-tenant-isolation`
  - Same determinism fixes as 49.2
  - Concurrency suite (`po-order-no.concurrency`) gets special attention

### Story 49.4 — Platform + ACL Suite Determinism Hardening
- **Priority:** P1
- **Dependencies:** 49.1
- **Focus:**
  - Hardening for platform suites and ACL suites in `packages/auth`
  - Tenant isolation verification (cross-tenant data visibility = P0)
  - ACL permission fixture determinism
  - Login throttle tests use `vi.useFakeTimers()`

### Story 49.5 — Sync + POS + Inventory Suite Determinism Hardening
- **Priority:** P1
- **Dependencies:** 49.1
- **Focus:**
  - Hardening for: sync suites, POS suites, inventory suites
  - Sync idempotency determinism (`client_tx_id` fixed UUIDs)
  - Inventory time-sensitive stock calculations → deterministic timestamps
  - 3-consecutive-green rerun proof per suite

### Story 49.6 — CI Pipeline Reliability Enforcement
- **Priority:** P1
- **Dependencies:** 49.2 + 49.3 + 49.4 + 49.5 (all hardening stories)
- **Focus:**
  - Wire lint + typecheck + integration tests as required CI checks
  - Capture 3-consecutive-green evidence manifest across all critical suites
  - Document CI gate structure
  - **Prerequisite**: Epic 48.6 must be landed first (lint/typecheck baseline)

### Story 49.7 — Pre-Close Validation + Final SOLID/DRY/KISS Gate
- **Priority:** P1
- **Dependencies:** 49.1 through 49.6
- **Focus:**
  - Complete pre-close scorecard (Checkpoint C)
  - Verify 3-consecutive-green manifest completeness
  - Adversarial review (GO/NO-GO verdict)
  - Update risk register with final dispositions
  - Sprint status update for all 7 stories
  - Retro action items (max 2)

---

## Critical Suite Inventory (Epic 49 Scope)

### Already stabilized in Epic 48 (4 suites — baseline)
| Suite | 3×Rerun Status |
|-------|----------------|
| `accounting/fiscal-year-close.test.ts` | ✅ 6/6 × 3 = 18/18 |
| `accounting/period-close-guardrail.test.ts` | ✅ 16/16 × 3 = 48/48 |
| `purchasing/ap-reconciliation.test.ts` | ✅ 54/54 × 3 = 162/162 |
| `purchasing/ap-reconciliation-snapshots.test.ts` | ✅ 8/8 × 3 = 24/24 |

### Epic 49 new critical suites (must achieve 3× green)
| Suite | Category |
|-------|----------|
| `accounting/ap-exceptions.test.ts` | Financial |
| `admin-dashboards/reconciliation.test.ts` | Financial |
| `admin-dashboards/period-close.test.ts` | Financial |
| `admin-dashboards/trial-balance.test.ts` | Financial |
| `sales/invoices-discounts.test.ts` | Financial |
| `sales/invoices-update.test.ts` | Financial |
| `sales/orders.test.ts` | Financial |
| `sales/credit-notes-customer.test.ts` | Financial |
| `purchasing/purchase-orders.test.ts` | Financial |
| `purchasing/goods-receipts.test.ts` | Financial |
| `purchasing/purchase-invoices.test.ts` | Financial |
| `purchasing/ap-payments.test.ts` | Financial |
| `purchasing/purchase-credits.test.ts` | Financial |
| `purchasing/po-order-no.concurrency.test.ts` | Financial |
| `purchasing/suppliers.test.ts` | Platform |
| `purchasing/supplier-statements.test.ts` | Financial |
| `purchasing/exchange-rates.test.ts` | Financial |
| `purchasing/ap-aging-report.test.ts` | Financial |
| `purchasing/supplier-soft-delete.regression.test.ts` | Platform |
| `purchasing/supplier-contacts.test.ts` | Platform |
| `purchasing/suppliers-tenant-isolation.test.ts` | Platform |
| `sync/idempotency.test.ts` | Sync |
| `sync/push.test.ts` | Sync |
| `sync/endpoints.test.ts` | Sync |
| `platform/customers.test.ts` | Platform |
| `outlets/tenant-scope.test.ts` | Platform |
| `outlets/create.test.ts` | Platform |
| `companies/*.test.ts` (5 suites) | Platform |
| `users/*.test.ts` (8 suites) | Platform/ACL |
| `packages/auth/integration/resource-level-acl.test.ts` | ACL |
| `packages/auth/integration/access-check.test.ts` | ACL |
| `packages/auth/integration/tokens.test.ts` | ACL |
| `packages/auth/integration/refresh-tokens.test.ts` | ACL |
| `packages/auth/integration/login-throttle.test.ts` | ACL |
| `pos/item-variants.test.ts` | POS |
| `pos/cart-line.test.ts` | POS |
| `pos/cart-validate.test.ts` | POS |
| `stock/*.test.ts` (5 suites) | Inventory |
| `inventory/items/*.test.ts` (6 suites) | Inventory |
| `inventory/item-groups/*.test.ts` (6 suites) | Inventory |
| `inventory/item-prices/*.test.ts` (7 suites) | Inventory |
| `recipes/*.test.ts` (5 suites) | Inventory |
| `packages/pos-sync/__test__/integration/*.test.ts` (2 suites) | Sync |
| `packages/sync-core/__test__/integration/*.test.ts` (1 suite) | Sync |
| `packages/backoffice-sync/__test__/integration/*.test.ts` (1 suite) | Sync |

**Grand total**: ~50+ critical suites (~600+ tests) requiring 3-consecutive-green evidence.

---

## Architecture Notes (Critical Decisions)

1. **Epic 49 is bugfix/determinism only** — no new features or API routes
2. **Scope freeze applies** — `apps/backoffice` and `apps/pos` receive no changes (emergency fixes only)
3. **Priority**: `Correctness > Safety > Speed`
4. **Epic 48.6 prerequisite for 49.6**: lint must be green before CI gate can close
5. **3-consecutive-green is the exit gate** — no epic close without full evidence manifest
6. **Max 2 retro action items** per program baseline

---

## Key Risks & Decisions

| # | Risk | Decision |
|---|------|----------|
| 1 | Undiscovered time-dependent tests cause failures during 3-rerun gate | 49.1 audit must find all before 49.2–49.5 begin |
| 2 | Pool cleanup gaps cause cross-test pollution or runner hangs | Every suite modified must verify `afterAll` + `--detect-open-handles` |
| 3 | Some suites have deep ordering dependencies that are non-trivial to fix | Tag as P2 carry-over; not sprint-blocking for 49 close if genuinely non-determinism |
| 4 | Epic 48.6 (lint debt) not landed before 49.6 CI gate | 49.6 lint gate must pass; 48.6 is pre-req — escalate if blocked |
| 5 | CI runner time insufficient for full 3× rerun matrix | Prioritize financial + ACL suites first; secondary suites in extended runner |

---

## Sprint 49 Exit Gate

Sprint 49 can be marked complete only if:

- [ ] Stories 49.1–49.7 all marked `done` in sprint-status.yaml
- [ ] SOLID/DRY/KISS pre-close scoring complete (Checkpoint C) — no Fail items unresolved
- [ ] 3-consecutive-green evidence manifest complete for ALL critical suites
- [ ] No unresolved P0/P1 findings in sprint scope
- [ ] Adversarial review verdict is GO
- [ ] `scripts/validate-sprint-status.ts --epic 49` exits 0
- [ ] Epic 49 status set to `done` in sprint-status.yaml

---

## Validation Commands (Kickoff Baseline)

```bash
# Verify Epic 48.6 (lint debt) has landed
npm run lint -w @jurnapod/api
# Expected: 0 errors

npm run typecheck -w @jurnapod/api
# Expected: exit 0

# Run kickoff critical suite baseline (should already be green from Epic 48)
nohup npm run test:single -- \
  "__test__/integration/accounting/fiscal-year-close.test.ts" \
  "__test__/integration/purchasing/ap-reconciliation.test.ts" \
  > logs/epic-49-kickoff-baseline.log 2>&1 &

# Audit command (run as part of 49.1)
grep -rn "Date.now\|new Date()" apps/api/__test__/integration/ --include="*.test.ts" | wc -l
grep -rn "Math.random" apps/api/__test__/integration/ --include="*.test.ts" | wc -l
grep -rn "afterAll" apps/api/__test__/integration/ --include="*.test.ts" | grep -v "pool.end\|db.pool" | wc -l
```

---

## References

- Program baseline: `_bmad-output/planning-artifacts/sprint-48-61-correctness-first-architecture-blueprint.md`
- Epic 48 closure artifacts: `_bmad-output/planning-artifacts/epic-48-*.md`
- Sprint tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Root policy: `AGENTS.md` (Architecture Program Baseline section)
- API-lib boundary migration queue: `_bmad-output/planning-artifacts/epic-49-api-lib-boundary-migration-queue.md`
- Story 49.1 execution checklist: `_bmad-output/planning-artifacts/epic-49-1-execution-checklist.md`
- Q49-001 execution pass: `_bmad-output/planning-artifacts/epic-49-q49-001-test-fixtures-execution-pass-1.md`
