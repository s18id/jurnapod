# Story 49.1: Kickoff Gate + Test Reliability Audit

**Status:** backlog

## Story

As a **scrum master**,
I want a complete, auditable picture of all test flakiness sources and a baseline SOLID/DRY/KISS score before any hardening work begins,
So that sprint scope is precisely bounded and no flaky source is missed.

---

## Context

Epic 48's story 48.4 established the rerun protocol and hardened 4 critical suites (fiscal-year-close, ap-reconciliation, ap-reconciliation-snapshots, period-close-guardrail). Story 49.1 kicks off Sprint 49 by auditing ALL remaining integration suites for determinism problems, capturing the SOLID/DRY/KISS baseline, and registering all identified issues as tracked work for stories 49.2–49.5.

This story does NOT fix anything — it identifies and catalogs.

## Acceptance Criteria

**AC1: SOLID/DRY/KISS Kickoff Scorecard**
Create `epic-49-solid-dry-kiss-scorecard.md` by applying the full checklist (SRP, OCP, LSP, ISP, DIP, DRY, KISS) to Epic 49 scope. All items start as `Unknown`. Any `Fail` items become explicit tracked work in stories 49.2–49.5.

**AC2: Full Integration Suite Audit**
Audit ALL integration test files under `apps/api/__test__/integration/` and `packages/*/__test__/integration/` for the following determinism categories:
- **Time-dependent**: `Date.now()`, `new Date()`, `Math.random()` usage in test assertions or fixture setup
- **Pool cleanup**: Missing `afterAll` / `afterEach` that closes the DB pool
- **Shared mutable state**: Tests that share state through persistent tables (`fiscal_years`, `sync_versions`, `module_roles`, `company_modules`) without isolation
- **Ordering dependencies**: Tests that assume clean state or depend on insertion order between `it()` blocks
- **Missing RWLock**: Suites that import from `helpers/setup` but don't use `acquireReadLock`/`releaseReadLock`

Output: A structured risk register (one row per finding) with: file, line, category, severity (P1/P2/P3), owner, story assignment.

**AC3: Suite Classification**
Classify every integration suite as:
- **Critical** (sprint-close blocker): exercises financial correctness, ACL/tenant scoping, or sync/idempotency
- **Non-critical** (CI runs, not sprint-close blocker): all others

The critical suite list for Epic 49 (prior to any additions found in audit):
1. `apps/api/__test__/integration/accounting/fiscal-year-close.test.ts` (done in 48.4)
2. `apps/api/__test__/integration/accounting/period-close-guardrail.test.ts` (done in 48.4)
3. `apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts` (done in 48.4)
4. `apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts` (done in 48.4)
5. `apps/api/__test__/integration/accounting/ap-exceptions.test.ts`
6. `apps/api/__test__/integration/sync/idempotency.test.ts`
7. `apps/api/__test__/integration/sync/push.test.ts`
8. `apps/api/__test__/integration/purchasing/purchase-orders.test.ts`
9. `apps/api/__test__/integration/purchasing/goods-receipts.test.ts`
10. `apps/api/__test__/integration/purchasing/purchase-invoices.test.ts`
11. `apps/api/__test__/integration/purchasing/ap-payments.test.ts`
12. `apps/api/__test__/integration/purchasing/purchase-credits.test.ts`
13. `apps/api/__test__/integration/purchasing/po-order-no.concurrency.test.ts`
14. `apps/api/__test__/integration/platform/users/tenant-scope.test.ts`
15. `apps/api/__test__/integration/outlets/tenant-scope.test.ts`
16. `apps/api/__test__/integration/purchasing/suppliers-tenant-isolation.test.ts`
17. `packages/auth/__test__/integration/resource-level-acl.integration.test.ts`

Plus any suites added by the audit in AC2.

**AC4: Epic 49 Risk Register Initialization**
Create `epic-49-risk-register.md` carrying forward open items from Epic 48 and adding new risks discovered in the AC2 audit. Include at minimum:
- R49-001: Undiscovered time-dependent tests (P1, mitigating: AC2 audit)
- R49-002: Pool cleanup gaps across broad suite set (P1, mitigating: 49.2–49.5)
- R49-003: Epic 48.6 lint debt not landed before 49.6 CI gate (P2, owner: @bmad-dev)

**AC5: Baseline Integration Run Evidence**
Run all critical suites once and capture the output. Any suite that fails at baseline must be assigned to a hardening story before that story begins.

---

## Dev Notes

- The audit in AC2 should use `grep` across all test files for: `Date.now`, `new Date()`, `Math.random`, `afterAll`, `afterEach`, `acquireReadLock`, `releaseReadLock`, `pool.end`, `db.pool`
- The audit output should be a markdown table with columns: File, Line(s), Pattern, Category, Severity, Story Assignment
- This story produces no code changes — only documentation artifacts
- The kickoff scorecard and risk register are prerequisites for stories 49.2–49.7

## Files to Create

| File | Description |
|------|-------------|
| `_bmad-output/planning-artifacts/epic-49-solid-dry-kiss-scorecard.md` | Full SOLID/DRY/KISS scorecard with kickoff baseline |
| `_bmad-output/planning-artifacts/epic-49-risk-register.md` | Risk register initialized with carry-forward + new risks |
| `_bmad-output/planning-artifacts/epic-49-suite-audit.md` | Full audit table from AC2 |
| `_bmad-output/planning-artifacts/epic-49-api-lib-boundary-migration-queue.md` | API-lib ownership migration queue aligned to sprint touch chain (S49–S61) |
| `_bmad-output/planning-artifacts/epic-49-1-execution-checklist.md` | Execution checklist for AC1–AC5 and queue intake tracking |
| `_bmad-output/planning-artifacts/epic-49-q49-001-test-fixtures-execution-pass-1.md` | First actionable extraction plan for canonical fixtures (`apps/api/src/lib/test-fixtures.ts` → `@jurnapod/db/test-fixtures`) |

## Validation Evidence

```bash
# Audit commands (informational — results captured in epic-49-suite-audit.md)
grep -rn "Date.now\|new Date()" apps/api/__test__/integration/ --include="*.test.ts"
grep -rn "Math.random" apps/api/__test__/integration/ --include="*.test.ts"
grep -rn "afterAll\|afterEach" apps/api/__test__/integration/ --include="*.test.ts" | grep -v "pool.end\|db.pool"
grep -rn "acquireReadLock\|releaseReadLock" apps/api/__test__/integration/ --include="*.test.ts"
```
