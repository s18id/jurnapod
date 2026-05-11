# Story 63.8 Completion Report: Create treasury test fixture in modules-treasury

**Story:** Create treasury test fixture (createTestCashBankTransaction)  
**Epic:** 63 - Test Production-Code Hardening  
**Status:** ✅ DONE  
**Completed:** 2026-05-10

---

## Summary

Created canonical `createTestCashBankTransaction` fixture in `packages/modules/treasury/test-fixtures/`. Uses the production `normalizeMoney()` helper for amount precision. Updated 2 treasury reporting test files to use the fixture instead of raw SQL INSERTs.

---

## Files

| Action | File | Description |
|--------|------|-------------|
| Created | `packages/modules/treasury/src/test-fixtures/cash-bank-fixtures.ts` | `createTestCashBankTransaction(db, opts)` |
| Modified | `packages/modules/treasury/src/index.ts` | Export fixture + options type |
| Modified | `packages/modules/treasury/package.json` | Added `./test-fixtures` export subpath |
| Modified | `cash-flow-consistency-reconciliation.test.ts` | 4 raw INSERTs → fixture calls |
| Modified | `treasury-balance-projection-reconciliation.test.ts` | 1 raw INSERT → fixture call |

## Acceptance Criteria

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | `createTestCashBankTransaction` fixture exists | ✅ Uses production `normalizeMoney()` |
| AC2 | Exported from package index | ✅ |
| AC3 | Both test files use fixture | ✅ 5 raw INSERTs replaced |
| AC4 | Treasury test suites pass | ✅ 17/17 tests |

## Fixture Design

- Supports all transaction types: `MUTATION`, `TOP_UP`, `WITHDRAWAL`, `FOREX`
- Supports all statuses: `DRAFT`, `POSTED`, `VOID`
- Deterministic auto-generated reference/description
- Accepts `db: KyselySchema` as first parameter (standard package fixture pattern)

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| Build (modules-treasury) | ✅ Passes |
| Build (API) | ✅ Passes |

---

**Story is COMPLETE.**
