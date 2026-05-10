# Epic 62: Projection Correctness Hardening

**Status:** done
**Sprint:** 62
**Theme:** Prove read-model projections produce zero material variance against source-of-truth (GL, inventory, AR/AP, treasury, sales). Enforce READ-only boundary. Migrate remaining reporting code to canonical packages.
**Primary Modules:** `apps/api`, `packages/modules/reporting`, `packages/telemetry`, `packages/shared`
**Predecessor:** Epic 61 (Sales & Purchasing Lifecycle Correctness)
**Exit Gate:** No material variance in projection outputs; all critical suites 3× consecutive green; `validate-sprint-status.ts` exits 0.

---

## 8) Code Review Findings

### Decision-Needed (resolved)
- [x] Sales revenue AC2: GL self-consistency check accepted. Daily-sales reads `pos_transactions` not `journal_lines` — GL test is valid cross-query verification.
- [x] Inventory valuation: Library-level test accepted. No HTTP endpoint for `getAllItemsCostSummary()` — direct call is appropriate for pure computation.
- [x] FR5 spec deviation: `report-context.ts`, `error-handler.ts`, `telemetry.ts` kept in `lib/reports/` subdirectory (not packages). Hono-dependent code belongs in API layer per `lib/accounting/` pattern.

### Patch Fixes Applied
- [x] Gate script exit codes: Changed `return 2` → `return 1` (Unix convention consistency)
- [x] Cash-flow test: Removed unused `loginForTest` and `getTestBaseUrl` imports (unnecessary HTTP call, token discarded)

### Deferred (pre-existing, not caused by this epic)
- [x] Test timeout 60s may not cover lock contention worst case — pre-existing pattern
- [x] ER_DUP_ENTRY fix at 3 layers (route/service/test) — pre-existing DRY violation
- [x] `/api/health` polling race — mitigated with 500ms single-attempt
- [x] `Number()` on DECIMAL strings without rounding — pre-existing pattern across all tests
- [x] `makeTag` uniqueness under concurrent runs — pre-existing, slice(0,20) collisions possible  

---

Epic 62 MUST NOT begin before Epic 61 action items are complete.

| Gate ID | Requirement | Artifact | Status |
|---------|-------------|----------|--------|
| E61-A1 | `toScaled4` un-export completed | A1 implementation in this session | ✅ DONE — 0 file-local copies remain |
| E61-A2 | `invoiced_qty` DECIMAL(19,2) migration | Migration 0208 | ✅ DONE — idempotent, lint:migrations clean |
| E61-G1 | Epic 61 exit gate green | sprint-status + retro | ✅ DONE — 6/6 stories, 43/43 tests, P0/P1=0 |

---

## 1) Charter

### 1.1 Program Alignment

Epic 62 is the final sprint in the S48–S62 Correctness-First Architecture Blueprint. Building on:
- Epic 61 GL Reconciliation (AR/AP subledger truth)
- Epic 60 Tenant/ACL (all projection queries must inherit ACL scoping)
- Epic 53 Datetime API (projections use canonical datetime helpers)

### 1.2 What We Know

- Projections/reporting is a read-model — READ authority only, never financial write
- Source-of-truth data: GL, AR aging, AP aging, inventory valuation, treasury balances, sales revenue
- Remaining reporting code lives in `apps/api/src/lib/` (reports.ts, report-context.ts, etc.)
- Migration targets: `packages/modules/reporting`, `packages/telemetry`, `packages/shared`
- Gate evidence pattern from Epic 58/61: `__EPIC62_GATE__` JSON lines in stdout

### 1.3 Non-Goals

- No net-new features or reporting modules
- No frozen-app scope expansion
- No business-logic DB triggers
- No new per-epic gate scripts — use generic validators only

---

## 2) Requirements Inventory

### Functional Requirements

| FR | Requirement | Enforcement |
|----|-------------|-------------|
| FR1 | Projection outputs MUST have zero material variance against GL, inventory, AR/AP, treasury, sales source-of-truth | Reconciliation tests with `__EPIC62_GATE__` evidence |
| FR2 | Projections MUST have READ authority only — no financial write path | ACL audit on all reporting routes |
| FR3 | Projection accuracy evidence MUST be machine-verifiable | `__EPIC62_GATE__` JSON lines in test stdout |
| FR4 | Validate projections against source-of-truth for every reporting module | Per-module reconciliation tests |
| FR5 | Migrate `reports.ts`, `report-context.ts`, `report-error-handler.ts`, `report-telemetry.ts`, admin dashboard helpers → canonical packages | Extraction + route flip |
| FR6 | All projection queries MUST be scoped by `company_id` (tenant isolation) | Negative tenant leakage tests |
| FR7 | Projection outputs MUST be deterministic | Repeated run comparison |

### Non-Functional Requirements

| NFR | Requirement | Validation |
|-----|-------------|------------|
| NFR1 | Zero material variance in projection outputs (exact numeric match against source-of-truth aggregates) | `__EPIC62_GATE__` variance == 0 |
| NFR2 | Projections are read-only — no write-path dependency from projections back to source data | Code audit |
| NFR3 | All projection domain logic in canonical packages; `apps/api/src/lib` contains only thin orchestration adapters | Route thinness enforcement |
| NFR4 | Projection evidence is machine-verifiable for CI gate compatibility | `validate-epic-62-gates.ts` exits 0 |
| NFR5 | Projected monetary values use DECIMAL precision — never FLOAT/DOUBLE | Code audit |
| NFR6 | No regression on existing report query performance | Within 2× of baseline |

---

## 3) Story Breakdown

### Story 62.1 — Projection Source-of-Truth Boundary Map + AR/AP Projection Accuracy
**Status:** planned
**Type:** correctness audit + integration tests
**Risk:** P0
**FR Coverage:** FR1, FR4, FR5 (partial)

Document the complete projection→source-of-truth boundary map. Prove AR aging and AP aging projections match source-of-truth subledger data with zero variance. Validate GL balance projections.

### Story 62.2 — Inventory & COGS Projection Accuracy
**Status:** planned
**Type:** correctness audit + integration tests
**Risk:** P0
**FR Coverage:** FR1, FR4

Prove inventory valuation and COGS projections match source-of-truth item cost and stock data. Validate costing method projections (FIFO/Average/LIFO) against `@jurnapod/modules-inventory-costing`.

### Story 62.3 — Treasury & Sales Revenue Projection Accuracy
**Status:** planned
**Type:** correctness audit + integration tests
**Risk:** P1
**FR Coverage:** FR1, FR4

Prove treasury balance projections match source-of-truth transaction data. Validate sales revenue projections match GL revenue accounts. Validate cash-flow projections.

### Story 62.4 — Projection READ-Only Boundary + ACL Enforcement
**Status:** planned
**Type:** security audit
**Risk:** P0 (security)
**FR Coverage:** FR2, FR6

Prove projection layer has READ authority only. Verify no reporting route writes to financial tables. Validate tenant isolation on all projection queries. Ensure `requireAccess()` with `resource` parameter on all reporting routes.

### Story 62.5 — Reporting Code Migration to Packages
**Status:** planned
**Type:** extraction + route flip
**Risk:** P1
**FR Coverage:** FR5

Migrate `reports.ts` → `packages/modules/reporting`
Migrate `report-context.ts`, `report-error-handler.ts` → `packages/modules/reporting`
Migrate `report-telemetry.ts` → `packages/telemetry`
Migrate admin dashboard read-model helpers → `packages/modules/reporting`
Flip API routes to thin adapters. Delete adapter shims immediately.

### Story 62.6 — Gate Validation Automation + Exit Evidence
**Status:** planned
**Type:** infrastructure
**Risk:** P2
**FR Coverage:** FR3, FR7, NFR4

Implement `scripts/validate-epic-62-gates.ts`. Wire `__EPIC62_GATE__` JSON lines in test stdout. Verify all gates pass (GATE1–GATE4). 3× consecutive green critical suites.

### Story 62.7 — Deferred Debt Closure + Final Cleanup
**Status:** planned
**Type:** debt closure
**Risk:** P2
**FR Coverage:** NFR3, NFR6

Audit and close remaining P2/P3 items from Epic 55–61. Verify route thinness enforcement. Performance baseline check. Final SOLID/DRY/KISS gate.

---

## 4) Epic Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|-------------|
| R62-001 | P0 | Projection logic may silently diverge from source-of-truth | Per-module reconciliation tests with zero tolerance |
| R62-002 | P0 | Reporting routes may have write-side effects | Full ACL audit + code review on all reporting routes |
| R62-003 | P1 | Code migration may break existing report consumers | Extraction per story with route flip + delete shims |
| R62-004 | P2 | Performance regression from projection validation overhead | Within 2× baseline tolerance |

---

## 5) Preconditions

| # | Precondition | Enforcement | Status |
|---|--------------|-------------|--------|
| 1 | Epic 61 close + retro complete | sprint-status | ✅ DONE |
| 2 | E61-A1 (toScaled4) done | `grep -r toScaled4 packages/modules/purchasing/src/` returns nothing | ✅ DONE |
| 3 | E61-A2 (invoiced_qty migration) done | Migration 0208 applied, `lint:migrations` clean | ✅ DONE |
| 4 | `npm run lint -w @jurnapod/api` passes (0 errors) | pre-flight gate | ✅ 0 errors, 158 warnings |
| 5 | `npm run typecheck -w @jurnapod/api` passes | pre-flight gate | ✅ PASS |
| 6 | `npm run lint:migrations` exits 0 | CI gate | ✅ PASS |
| 7 | Sprint-status validation passes | `validate-sprint-status.ts` | ✅ healthy |
| 8 | SOLID/DRY/KISS kickoff gate scored | manual review | ⏳ Pending (kickoff gate) |

---

## 6) Exit Gate

1. **Correctness Gate:** All projection reconciliation tests green. `__EPIC62_GATE__` variance == 0.
2. **Risk Gate:** Unresolved P0/P1 in epic scope = 0.
3. **Evidence Gate:** `npx tsx scripts/validate-epic-62-gates.ts` exits 0.
4. **Migration Gate:** All reporting code migrated to canonical packages; no shims left.
5. **SOLID/DRY/KISS Gate:** Full rescore passes at pre-close.

---

## 7) Validation Commands

```bash
npm run lint -w @jurnapod/api
npm run typecheck -w @jurnapod/api
npm run test:integration -w @jurnapod/api
npx tsx scripts/validate-sprint-status.ts --epic 62
npx tsx scripts/validate-epic-62-gates.ts
npx tsx scripts/validate-structure-conformance.ts
npm run lint:migrations
```

---

_Last Updated: 2026-05-09T22:00:00Z_
