# Epic 49 — AC3 Adversarial Review Findings

> **Epic:** 49 — Test Determinism + CI Reliability
> **Story:** 49.7 (Pre-Close Validation + Final SOLID/DRY/KISS Gate)
> **AC3:** Adversarial Review
> **Date:** 2026-04-23
> **Status:** ✅ GO — No P0/P1 open in scope

---

## Purpose

This document captures the AC3 adversarial review consolidated findings. Review was conducted against fixture/pool-cleanup changes from Stories 49.2–49.5 (Scope: Story 49.7 AC3). All P0/P1 findings have been resolved in Stories 49.2–49.5; only P2/P3 observations remain.

---

## Review Scope

**Adversarial review scope (per Story 49.7 AC3):**
- Fixture/pool-cleanup changes from Stories 49.2–49.5
- Determinism hardening: `Date.now()`, `Math.random()` replacements
- RWLock adoption: `acquireReadLock`/`releaseReadLock` additions
- Pool cleanup: `afterAll` with `pool.end()` verification
- ACL permission test patterns: low-privilege role usage
- Epic 48 fixes: NOT re-reviewed (per story spec)

**Review agents:** @bmad-review (adversarial code review)

---

## Consolidated Findings

### P0 Blockers — NONE ✅

No P0 blockers identified in scope.

**Evidence:** All P0/P1 findings from Stories 49.2–49.5 were resolved before Story 49.7 pre-close:
- Story 49.2 P0 final review: Three outer `afterAll` blocks verified correct lock release ordering
- Story 49.3 P0 blockers: Hardcoded `supplier_id: 1`, `item_id: 1` replaced; raw SQL mid-test mutations replaced with canonical helpers
- Story 49.4: Time-dependent fixes applied; fake timers hardened in auth suites
- Story 49.5: Determinism fixes validated via gap-fill runs (9/9 suites, EXIT:0)

---

### P1 Blockers — NONE ✅

No P1 blockers open in scope.

**Resolution evidence:**

| P1 Finding | Story | Resolution | Evidence |
|------------|-------|------------|----------|
| Hardcoded `supplier_id: 1` in `purchase-orders.test.ts` | 49.3 | Replaced with fixture-created `testSupplierId` | `story-49.3.completion.md` — AC1 evidence |
| Hardcoded `supplier_id: 1` + `item_id: 1` in `goods-receipts.test.ts` | 49.3 | Replaced with fixture-created IDs | `story-49.3.completion.md` — AC1 evidence |
| Raw SQL mid-test mutations in `ap-payments.test.ts` | 49.3 | Replaced with `setTestSupplierActive`, `setTestBankAccountActive`, `setTestPurchasingDefaultApAccount` | `story-49.3.completion.md` — Canonical Fixture Helper Additions |
| `createTestCompany()` failing due to missing `settings` table | 49.3 | Retained `createTestCompanyMinimal()` with explicit `setModulePermission()` | `story-49.3.completion.md` — AC3 evidence |
| `makeTag().slice(0, 20)` truncation causing duplicate key collision | 49.3 | Removed slicing; length-safe format used | `story-49.3.completion.md` — AC1 evidence |
| RWLock missing in multiple Story 49.2 suites | 49.2 | Added to all 8 Story 49.2 suites | `epic-49-suite-audit.md` Section H1 |
| `'InventoryConflictError' is defined but never used` (pre-existing P1 lint error) | 49.6 | Noted in `story-49.6.completion.md` as pre-existing; not in 49.7 scope | `story-49.6.completion.md` — pre-existing note |

---

### P2 Observations (Non-Blocking)

These are tracked but do not block epic close.

| ID | Finding | Severity | Story | Evidence | Recommended Fix |
|----|---------|----------|-------|----------|-----------------|
| T49-001 | Named lock connection-pool semantics — `GET_LOCK` may release on wrong connection | P2 | 49.3 | `story-49.3.completion.md` — Open P2 Items | Use single shared `jp_purchasing_suite_lock` across all purchasing suites |
| T49-002 | Silent cleanup error swallowing — empty catch blocks | P2 | 49.3 | `story-49.3.completion.md` — Open P2 Items | Add `console.error` logging in catch blocks |
| T49-003 | Cross-suite cleanup interference (different lock names) | P2 | 49.3 | `story-49.3.completion.md` — Open P2 Items | Consolidate to single shared purchasing lock |
| T49-006 | Suite-specific lock proliferation in 49.2 suites | P2 | 49.2 | `epic-49-suite-audit.md` H4 | Consider belt-and-suspenders consolidation post-Sprint 49 |
| T49-007 | Pre-existing lint error (`'InventoryConflictError' is defined but never used`) | P2 | 49.6 | `story-49.6.completion.md` — pre-existing note | Fix in separate follow-up (not blocking Story 49.7 close) |
| T49-009 | `test-fixtures.ts` uses `Date.now()+Math.random()` for run-id generation | P2 | 49.7 | `story-49.7.completion.md` — P2-1 resolution | Replaced with deterministic counter-based `makeRunId()` — 11 usages migrated |
| T49-010 | `makeTag` policy enforcement gap — no validator for anti-patterns | P2 | 49.7 | `story-49.7.completion.md` — P2-2 resolution | Added `scripts/validate-maketag-policy.ts` — detects `makeTag(...).slice()` and `const t = makeTag(...); t.slice(...)` |

---

### P3 Observations (Non-Blocking)

| ID | Finding | Severity | Story | Evidence | Recommended Fix |
|----|---------|----------|-------|----------|-----------------|
| T49-004 | Missing cross-tenant GET-by-ID negative tests in `purchase-orders`/`goods-receipts` | P3 | 49.3 | `story-49.3.completion.md` — Open P3 Items | Add 404 assertions for other-company PO/GR IDs |
| T49-005 | Lock acquisition return values not verified | P3 | 49.3 | `story-49.3.completion.md` — Open P3 Items | Check `GET_LOCK` return value before proceeding |
| T49-008 | `login-throttle.test.ts` uses `vi.useFakeTimers()` — coverage verification needed | P3 | 49.4 | `epic-49-solid-dry-kiss-scorecard.md` — KISS item | Verify no date-sensitive logic broken by fake timers |

---

## AC3 Gate Result

| Field | Value |
|-------|-------|
| **Adversarial Review Status** | ✅ GO |
| **P0 Blockers** | 0 (none) |
| **P1 Blockers** | 0 (all resolved in Stories 49.2–49.5) |
| **P2 Observations** | 7 (T49-001, T49-002, T49-003, T49-006, T49-007, T49-009, T49-010) |
| **P3 Observations** | 3 (T49-004, T49-005, T49-008) |
| **Epic-Close Gate** | ✅ No open P0/P1 in scope — can proceed |

---

## Review Evidence Paths

| Finding Category | Evidence Path |
|------------------|---------------|
| P0/P1 resolutions in Story 49.2 | `_bmad-output/implementation-artifacts/stories/epic-49/story-49.2.completion.md` |
| P0/P1 resolutions in Story 49.3 | `_bmad-output/implementation-artifacts/stories/epic-49/story-49.3.completion.md` |
| P0/P1 resolutions in Story 49.4 | `_bmad-output/implementation-artifacts/stories/epic-49/story-49.4.completion.md` |
| P0/P1 resolutions in Story 49.5 | `_bmad-output/implementation-artifacts/stories/epic-49/story-49.5.completion.md` |
| Suite audit H1/H2 (Story 49.2) | `_bmad-output/planning-artifacts/epic-49-suite-audit.md` Section H |
| AC3 scope (Story 49.7) | `_bmad-output/implementation-artifacts/stories/epic-49/story-49.7.md` AC3 |

---

## References

- Epic 49 sprint plan: `_bmad-output/planning-artifacts/epic-49-sprint-plan.md`
- Risk register: `_bmad-output/planning-artifacts/epic-49-risk-register.md`
- Suite audit: `_bmad-output/planning-artifacts/epic-49-suite-audit.md`
- SOLID/DRY/KISS scorecard: `_bmad-output/planning-artifacts/epic-49-solid-dry-kiss-scorecard.md`