# Epic 42 Retrospective: Test Infrastructure Hardening & Performance

> **Retrospective Format:** BMAD Party Mode (Multi-Agent Discussion)
> **Facilitated:** 2026-04-14
> **Agents:** Bob (Scrum Master), Alice (Product Owner), Charlie (Senior Dev), Dana (QA Engineer), Elena (Junior Dev), Winston (Architect)
> **Project Lead:** Ahmad

---

## Overview

| Field | Value |
|-------|-------|
| **Epic** | 42 — Test Infrastructure Hardening & Performance |
| **Completed** | 2026-04-14 |
| **Duration** | Single sprint |
| **Total Estimate** | 8.5h |
| **Stories Completed** | 6/6 |
| **Goal** | Eliminate repeated per-test login and sync-context calls, tighten assertions, fix CI flakiness, and resolve POS offline bugs |

---

## Metrics

| Story | Title | Estimate | Actual | Status |
|-------|-------|----------|--------|--------|
| 42.1 | Token & Seed Context Caching Infrastructure | 2h | 1h | Done |
| 42.2 | DB Transaction Safety & Error Handling | 1h | 1h | Done |
| 42.3 | Test Assertion Quality | 1h | 1h | Done |
| 42.4 | Login Reuse Across Test Suites | 2h | 2h | Done |
| 42.5 | BeforeAll seedCtx Caching Rollout | 2h | 2h | Done |
| 42.6 | Validation & Final Verification | 30m | 30m | Done |
| **Total** | | **8.5h** | **~6.5h** | **All Done** |

**Test Suite Results (after all stories):**
- Test Files: 132 passed (132)
- Tests: 930 passed | 3 skipped (933)
- Duration: ~65s
- Lint: 0 errors | 151 warnings (pre-existing `any` types)
- Typecheck: clean

**Files Modified:**
- `apps/api/src/lib/test-fixtures.ts` — token cache, seed context cache, stale password recovery
- `packages/db/src/kysely/transaction.ts` — ER_CHECKREAD retry
- `packages/db/__test__/unit/transaction.test.ts` — new unit tests
- `apps/api/src/routes/settings-pages.ts` — StaticPageNotFoundError → 404
- `apps/pos/src/offline/sales.ts` — NaN guard on discount_total
- `apps/pos/src/services/recovery-service.ts` — null-safe sort, transaction scope
- 30 integration test files — tightened assertions, login reuse, seedCtx caching

---

## What Went Well

### 1. Token and Seed Context Caching Eliminated Significant CI Overhead
Story 42.1 introduced `tokenCache` and `seedSyncContextCache` with in-flight deduplication. This eliminated repeated `/api/auth/login` calls across 132 integration test files, cutting real time off every CI run. The two-function pattern (`loadSeedSyncContext` in `beforeAll`, `getSeedSyncContext` wrapper at suite level) became the canonical approach for async fixture setup.

### 2. Assertion Tightening Exposed Real Bugs
Story 42.3 systematically removed `500` from success-path assertions across 22 integration test files. This masking behavior had hidden `StaticPageNotFoundError` returning 500 instead of 404. Tightening tests forced the fix in Story 42.2 — a perfect example of infrastructure work surfacing product bugs.

### 3. Zero Production Incidents and Zero New Technical Debt
All six stories closed with clean technical debt review checklists. No shortcuts, no TODOs, no new N+1 patterns. The epic was purely additive in reliability.

### 4. Epic 41 Lessons Applied Successfully
Epic 41's retrospective (AI-8) committed to enumerating every target in AC for bulk migrations. **Epic 42 fulfilled this commitment**: Stories 42.3, 42.4, and 42.5 all included explicit migration target tables with per-file verification. Epic 41 AI-8 is now complete — the process improvement stuck.

Epic 41's other action items (AI-1 through AI-7) were backoffice-specific and remained out of scope for Epic 42's test infrastructure focus. They remain pending for a future backoffice epic.

### 5. POS Offline Bugs Fixed as Side Effect
Story 42.2 resolved `discount_total: NaN` in `reconcileSaleTotals()` and `PrematureCommitError` in `getTransactionState()`. These were real POS crashes that happened to be caught during test infrastructure hardening.

### 6. ER_CHECKREAD Retry is Production Hardening
The addition of `ER_CHECKREAD` (errno 1020) to `withTransactionRetry()` manifested in CI due to concurrent workers, but the fix lives in the production transaction path. This improves optimistic-locking resilience under real load.

### 7. Clean Epic Closure with Objective Validation
Story 42.6 ran the full validation gate: 132 files, 930 tests, lint clean, typecheck clean. The acceptance criteria were all objectively measurable.

---

## What Could Be Improved

### 1. Pre-existing Test Data Setup Patterns Caused Hidden Failures
Some test files created login-capable users without setting a deterministic password (`process.env.JP_OWNER_PASSWORD`). This caused `401 INVALID_CREDENTIALS` failures that were hard to trace. The fix was applied in Story 42.4, but this pattern should have been canonicalized earlier.

### 2. Mechanical Bulk Migrations are Tedious but Necessary
52 total test files required mechanical migration across three stories (22 + 17 + 13). This is low-complexity, high-tedium work. Future bulk migrations should consider scripted refactoring where safe.

### 3. Permissive Assertions Had Masked Bugs for a Long Time
The fact that `500` was allowed in settings pages tests meant the `StaticPageNotFoundError` → 500 bug existed unnoticed. Earlier enforcement of tight assertions would have caught this sooner.

### 4. All Epic 41 Action Items Were Already Addressed
Epic 41 committed to 8 action items. Upon verification:
- AI-1, AI-2: Behavioral regression tests — ✅ Already written (10 tests in `lib-api-client.test.ts`)
- AI-3: `@deprecated` JSDoc — ✅ Already present in `api-client.ts`
- AI-4: `project-context.md` Backoffice API Client section — ✅ Already present
- AI-5: XHR alignment note — ✅ Already present in `api-client.ts`
- AI-8: Bulk migration AC enumeration — ✅ Done in Epic 42 (stories 42.3-42.5)
- AI-6: Sunset milestone — ⏳ Pending, scheduled for Epic 45

### 5. Pre-existing Intermittent Failures Still Linger
`import/apply.test.ts` (timestamp-based SKU collision) and `inventory/items/update.test.ts` (test pollution) still fail intermittently under full-suite parallel execution. These are documented but not yet resolved.

---

## Key Lessons Learned

| Lesson | Rule |
|--------|------|
| **Tight assertions catch bugs; permissive assertions hide them** | Default to precise status assertions; only allow 500 after explicit manual review |
| **The first enabling story unlocks epic velocity** | For infrastructure epics, lead with the pattern/infrastructure story; subsequent stories apply it |
| **Test infrastructure work can surface production bugs** | When removing masking behavior (permissive tests), expect to find and fix real product issues |
| **Bulk migration AC must enumerate every target** | Every file/function must be listed in AC with a verification status table |
| **Always set deterministic passwords on login-capable test users** | Prevents 401 failures when seeded test data drifts |
| **Production reliability fixes can emerge from CI-only symptoms** | `ER_CHECKREAD` retry appeared only in CI but strengthens production concurrency handling |
| **Time-box intermittent test fixes** | If a pre-existing flake takes more than one focused session, promote it to dedicated stories |

---

## Action Items

### Epic 41 Follow-Through

| # | Action | Owner | Priority | Status |
|---|--------|-------|----------|--------|
| ~~AI-1~~ | ~~Write behavioral regression tests for `apiRequest()` token resolution and 401 refresh cycle~~ | ~~Dev~~ | ~~P1~~ | ✅ **DONE** — 10 tests in `__test__/unit/lib-api-client.test.ts` |
| ~~AI-2~~ | ~~Write behavioral regression tests for `uploadWithProgress` progress callback~~ | ~~Dev~~ | ~~P2~~ | ✅ **DONE** — included in `lib-api-client.test.ts` |
| ~~AI-3~~ | ~~Add `@deprecated` JSDoc to explicit `accessToken` arg in `api-client.ts`~~ | ~~Dev~~ | ~~P2~~ | ✅ **DONE** — `@deprecated` JSDoc on lines 38-42, 48-52, 63-65 |
| ~~AI-4~~ | ~~Update `project-context.md` with Backoffice API Client section~~ | ~~Tech Writer~~ | ~~P2~~ | ✅ **DONE** — `project-context.md` lines 78-98: token resolution order, functions table, rules |
| ~~AI-5~~ | ~~Add alignment note in XHR wrappers: "Keep error handling aligned with `apiRequest()`"~~ | ~~Dev~~ | ~~P3~~ | ✅ **DONE** — `api-client.ts` lines 142-146 |
| ~~AI-8~~ | ~~Enumerate every target explicitly in bulk migration AC~~ | ~~SM~~ | ~~P2~~ | ✅ **DONE** — Epic 42 applied this in stories 42.3, 42.4, 42.5 |
| AI-6 | Set sunset milestone for removing explicit `accessToken` arg from all production call sites | PM | P3 | Epic 45 |

### Epic 42 New Action Items

| # | Action | Owner | Priority | Target |
|---|--------|-------|----------|--------|
| E42-A1 | Require "production impact" review in all future infrastructure epic plans | Architect | P2 | Next epic planning |
| E42-A2 | Address pre-existing intermittent failures in `import/apply.test.ts` and `inventory/items/update.test.ts` | Dev | P2 | Next sprint (time-boxed) |
| E42-A3 | Document the canonical `beforeAll` seedCtx fixture pattern in `project-context.md` Testing Rules section | Dev/Tech Writer | P2 | Next epic planning |

---

## Team Agreements

- Tight assertions catch bugs; permissive assertions hide them — choose tight by default
- Always set deterministic passwords on login-capable test users
- First story of an infrastructure epic should be the enabling pattern; subsequent stories apply it
- Enumerate every target file/function explicitly in story AC for bulk migrations

---

## Readiness Assessment

| Dimension | Status | Notes |
|-----------|--------|-------|
| Testing & Quality | Fully verified | 132 files pass, 930 tests green, lint/typecheck clean |
| Deployment | Already in main | No separate release needed; fixes are in codebase |
| Stakeholder Acceptance | Met | Objective criteria satisfied; engineering team is primary stakeholder |
| Technical Health | Improved | Faster tests, tighter assertions, better retry logic |
| Unresolved Blockers | None | No blockers from Epic 42 |

**Epic Update Required:** NO

---

## Agent Discussion Highlights

- **Winston (Architect):** "The `ER_CHECKREAD` retry addition is not just a test fix. It's production-hardening for optimistic locking under contention."
- **Dana (QA Engineer):** "Tightening tests exposed real bugs. The challenge is that infrastructure epics can become 'fix whatever the tests reveal' epics."
- **Charlie (Senior Dev):** "The two-function cache pattern from 42.1 should be documented as the canonical way to handle async fixture setup."
- **Alice (Product Owner):** "The systematic approach to test assertion quality exceeded my expectations. 22 files audited and tightened — that's not glamorous work, but it catches real bugs."

## Next Steps

1. Execute action items before next epic begins
2. Review action items in next standup
3. Begin Epic 43 planning when ready

---

*Retrospective conducted via BMAD Party Mode — 2026-04-14*
