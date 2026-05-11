# Story 63.5 Completion Report: Create createTestAccount fixture in modules-accounting

**Story:** Create createTestAccount fixture in modules-accounting + fix account_type_id backfills  
**Epic:** 63 - Test Production-Code Hardening  
**Status:** ✅ DONE  
**Completed:** 2026-05-10

---

## Summary

Created a canonical `createTestAccount` fixture in `packages/modules/accounting/src/test-fixtures/account-fixtures.ts` that follows the same production pattern as `ensureSystemAccounts()`. The fixture sets `account_type_id` at creation time, eliminating the need for raw `UPDATE accounts SET account_type_id` backfills. Updated 9 test files to use the new fixture instead of raw SQL INSERTs.

---

## Files

| Action | File | Description |
|--------|------|-------------|
| Created | `packages/modules/accounting/src/test-fixtures/account-fixtures.ts` | Core `createTestAccount()` fixture + 2 convenience wrappers |
| Modified | `packages/modules/accounting/src/test-fixtures/index.ts` | Export new fixtures |
| Modified | `packages/modules/accounting/src/test-fixtures/types.ts` | Added `AccountingAccountFixture` type |
| Modified | `cogs-posting.test.ts` | Raw INSERT → `createTestAccount` |
| Modified | `pos-sale-reversal.test.ts` | Raw INSERT → `createTestAccount` |
| Modified | `sales-payment-posting.test.ts` | Raw INSERT → `createTestAccount` |
| Modified | `sales-invoice-posting.test.ts` | Raw INSERT → `createTestAccount` |
| Modified | `journal-immutability.test.ts` | Raw INSERT → `createTestAccount` |
| Modified | `cogs-projection-reconciliation.test.ts` | Raw INSERT → `createTestInventoryGLAccount`/`createTestVarianceAccount` |
| Modified | `inventory-posting.test.ts` | Raw INSERT → `createTestAccount` |
| Modified | `sales-revenue-projection-reconciliation.test.ts` | Raw INSERT → `createTestAccount` |
| Modified | `inventory-subledger-reconciliation.test.ts` | Raw INSERT → `createTestAccount` (TODO resolved) |

## Acceptance Criteria

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | `createTestAccount` fixture in `modules-accounting/test-fixtures/` | ✅ |
| AC2 | Exported from package index | ✅ |
| AC3 | `createTestInventoryGLAccount()` sets `account_type_id` at creation | ✅ (delegates to `createTestAccount` with typeName) |
| AC4 | All 9 files use `createTestAccount` | ✅ |
| AC5 | 0 remaining `UPDATE accounts SET account_type_id` for setup | ✅ |
| AC6 | All accounting test suites pass | ✅ |

## Fixture Design

- **Production-aligned**: Looks up `account_types` by name, creates row if missing (`INSERT IGNORE`), then INSERTs account with `account_type_id` set at creation time
- **Idempotent**: Uses `INSERT IGNORE` for safe re-run
- **Convenience wrappers**: `createTestInventoryGLAccount` (ASSET type) and `createTestVarianceAccount` (EXPENSE type)
- **Fix**: Changed `createTestInventoryGLAccount` from `typeName: "INVENTORY"` → `"ASSET"` to match COGS posting validation requirements

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| Build (modules-accounting) | ✅ Passes |
| Build (API) | ✅ Passes |

---

**Story is COMPLETE.**
