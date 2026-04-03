# API Detachment Validation Report

**Date:** 2026-04-03  
**Story:** 23.5.3 - Run full workspace validation gate  
**Status:** REVIEW (1 pre-existing test failure observed)

---

## 1. Command Outputs Summary

### 1.1 Typecheck (`npm run typecheck -ws --if-present`)

| Workspace | Result |
|-----------|--------|
| @jurnapod/api | PASS |
| @jurnapod/backoffice | PASS |
| @jurnapod/pos | PASS |
| @jurnapod/auth | PASS |
| @jurnapod/backoffice-sync | PASS |
| @jurnapod/db | PASS |
| @jurnapod/offline-db | PASS |
| @jurnapod/pos-sync | PASS |
| @jurnapod/shared | PASS |
| @jurnapod/sync-core | PASS |
| @jurnapod/modules-accounting | PASS |
| @jurnapod/modules-inventory | PASS |
| @jurnapod/modules-inventory-costing | PASS |
| @jurnapod/modules-platform | PASS |
| @jurnapod/modules-reporting | PASS |
| @jurnapod/modules-reservations | PASS |
| @jurnapod/modules-sales | PASS |

**Typecheck Result: PASS** (17/17 workspaces)

### 1.2 Build (`npm run build -ws --if-present`)

| Workspace | Result | Notable Warnings |
|-----------|--------|------------------|
| @jurnapod/api | PASS | None |
| @jurnapod/backoffice | PASS | None |
| @jurnapod/pos | PASS | Chunk size warning (ionic-core-components: 1,071 kB) - pre-existing |
| @jurnapod/auth | PASS | None |
| @jurnapod/backoffice-sync | PASS | None |
| @jurnapod/db | PASS | None |
| @jurnapod/offline-db | PASS | None |
| @jurnapod/pos-sync | PASS | None |
| @jurnapod/shared | PASS | None |
| @jurnapod/sync-core | PASS | None |
| @jurnapod/modules-accounting | PASS | None |
| @jurnapod/modules-inventory | PASS | None |
| @jurnapod/modules-inventory-costing | PASS | None |
| @jurnapod/modules-platform | PASS | None |
| @jurnapod/modules-reporting | PASS | None |
| @jurnapod/modules-reservations | PASS | None |
| @jurnapod/modules-sales | PASS | None |

**Build Result: PASS** (17/17 workspaces)

### 1.3 Critical Unit Tests (`npm run test:unit:critical -w @jurnapod/api`)

```
# tests 37 suites
# pass 37
# fail 0
```

**Critical Tests Result: PASS**

Suites covered: auth, sync push/pull routes, accounts, COGS posting, sales posting fallback, payment variance, sales schemas

### 1.4 Sync Unit Tests (`npm run test:unit:sync -w @jurnapod/api`)

```
# tests 96
# suites 38
# pass 96
# fail 0
# cancelled 0
# skipped 0
```

**Sync Tests Result: PASS**

### 1.5 Sales Unit Tests (`npm run test:unit:sales -w @jurnapod/api`)

```
# tests 98
# suites 32
# pass 98
# fail 0
# cancelled 0
# skipped 0
```

**Sales Tests Result: PASS** (98/98 - previously had 1 failure now fixed)

#### Previously Failing Test - FIXED

| Field | Value |
|-------|-------|
| **Test File** | `src/routes/sales/invoices.test.ts` |
| **Suite** | GL Balance Validation |
| **Subtest** | posting invoice changes status to POSTED |
| **Original Error** | `Unknown column 'total_debit' in 'SELECT'` |
| **Root Cause** | Test query incorrectly selected `total_debit`/`total_credit` from `journal_batches` table which does not have those columns |
| **Fix Applied** | Updated test query to select only metadata from `journal_batches`, then aggregate debit/credit from `journal_lines` table by `journal_batch_id` |
| **Fix Date** | 2026-04-03 |

**Analysis:** The failing test was due to a **bad test query**, not a missing schema column. The `journal_batches` table stores batch metadata only; `total_debit` and `total_credit` must be computed by aggregating `journal_lines` entries. The test has been corrected to follow proper accounting verification pattern.

---

## 2. Import Boundary Audit

### 2.1 Audit Scope

Searched for imports referencing `apps/api` or `@/` alias from:
- `packages/**`
- `apps/**` (excluding `apps/api` internal imports)

### 2.2 Search Patterns Used

```bash
# Pattern 1: @/ alias imports
grep -r "from ['\"]@/" packages/ apps/

# Pattern 2: @jurnapod/api package imports
grep -r "from ['\"]@jurnapod/api" packages/ apps/
```

### 2.3 Results

| Pattern | Packages | Apps |
|---------|----------|------|
| `@/` alias | 0 files | 96 files (all within `apps/api` - expected) |
| `@jurnapod/api` | 0 files | 0 files |

**Import Audit Result: PASS**

- No packages import from `apps/api` via `@jurnapod/api` package
- No packages import from `apps/api` via `@/` path alias
- All `@/` alias usage is within `apps/api` codebase itself (standard internal import pattern)
- No cross-package import violations detected

---

## 3. Open Risks / Follow-ups

### 3.1 POS Build Warning (P3)

| Item | Details |
|------|---------|
| **Risk** | Large chunk size warning for `ionic-core-components` |
| **Severity** | P3 - Non-blocking |
| **Root Cause** | Pre-existing bundle size, not introduced by Epic 23 |
| **Action Required** | Consider code-splitting if POS performance becomes an issue |

### 3.2 Lint Severity Inconsistency (Noted for Record)

The repo has lint rules but some warnings may be suppressed or set to lower severity than the AGENTS.md guidelines suggest. This is a maintenance concern and not specific to Epic 23 detachment work.

---

## 4. Acceptance Criteria Verdict

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Workspace typecheck/build pass | **PASS** | All 17 workspaces pass typecheck and build |
| API critical suites pass | **PASS** | 37/37 suites pass |
| Import audit confirms no packages importing apps/api | **PASS** | 0 violations found |
| Final detachment report generated | **PASS** | This document |

**Overall Verdict: PASS - All acceptance criteria met**

All workspace validation gates pass. The previously failing sales test (98/98 now) was due to a bad test query that selected `total_debit`/`total_credit` from `journal_batches` table which stores only batch metadata. The test has been corrected to aggregate debit/credit from `journal_lines` table.

---

## 5. Recommendation

1. **Proceed:** Story 23.5.3 can move to completion - all acceptance criteria met
2. **No blocking issues:** All test suites pass at 100%
3. **Epic complete:** Epic 23 API Detachment is complete

---

*Report generated: 2026-04-03*
*Last updated: 2026-04-03 (fixed sales test query)*
