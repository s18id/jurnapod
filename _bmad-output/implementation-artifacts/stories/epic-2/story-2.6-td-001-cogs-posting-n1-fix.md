# Story 2.6: TD-001 COGS Posting N+1 Fix

Status: done

## Story

As a **Jurnapod developer**,
I want **the N+1 query pattern in COGS posting fixed**,
So that **item account lookups no longer cause N separate queries for N items**.

## Technical Debt Details

| ID | TD-001 |
|----|--------|
| Location | `apps/api/src/lib/cogs-posting.ts:484-501` |
| Description | Item account lookup loop causes N queries for N items in a sale |
| Impact | A 50-item sale makes 50 separate queries to `items` + `company_account_mappings` tables |
| Priority | P2 |

## Acceptance Criteria

1. **AC1: Batch Item Account Lookup**
   - Given the COGS posting logic at cogs-posting.ts:484-501
   - When the N+1 pattern is fixed
   - Then all item accounts are fetched in a single batch query
   - And the existing behavior is preserved

2. **AC2: Test Validation**
   - Given the existing COGS posting test suite
   - When the N+1 fix is complete
   - Then all existing tests pass
   - And `npm run test:unit -w @jurnapod/api` passes

## Tasks / Subtasks

- [x] **Task 1: Read current implementation**
  - [x] 1.1 Read cogs-posting.ts lines 484-501 to understand current N+1 pattern
  - [x] 1.2 Identify all item IDs that need account lookup
  - [x] 1.3 Check existing tests for COGS posting

- [x] **Task 2: Implement batch fetch pattern**
  - [x] 2.1 Collect all item IDs before the loop
  - [x] 2.2 Execute single batch query for all accounts
  - [x] 2.3 Build Map for O(1) lookup during iteration

- [x] **Task 3: Verify behavior preservation**
  - [x] 3.1 Ensure same results as before
  - [x] 3.2 Check edge cases (empty items, missing accounts)

- [x] **Task 4: Test Validation (AC2)**
  - [x] 4.1 Run COGS posting test suite
  - [x] 4.2 Run full API test suite
  - [x] 4.3 Verify no regressions

## Technical Notes

**Before (N+1): Loop per item**

```typescript
for (const item of saleDetail.items) {
  const account = await db.query(`
    SELECT account_id FROM company_account_mappings
    WHERE company_id = ? AND item_id = ?
  `, [companyId, item.itemId]);
}
```

**After (Batch): Single query for all items**

```typescript
const itemIds = saleDetail.items.map(i => i.itemId);
const accounts = await db.kysely
  .selectFrom('company_account_mappings')
  .where('company_id', '=', companyId)
  .where('item_id', 'in', itemIds)
  .select(['item_id', 'account_id'])
  .execute();

const accountMap = new Map(accounts.map(a => [a.item_id, a.account_id]));
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/lib/cogs-posting.ts` | Modify | Fix N+1 at lines 484-501 |

## Dependencies

- Story 0.1.2 (DbClient Integration)

## Estimated Effort

0.5 days

## Risk Level

Medium (COGS calculation correctness critical)

## Dev Agent Record

### Debug Log

1. The actual N+1 hot path was in `CogsPostingMapper.mapToJournal()` where each item called `getItemAccounts()` individually.
2. Implemented `getItemAccountsBatch()` to batch:
   - item account reads from `items`
   - company default mapping reads from `company_account_mappings`
   - account type validation reads from `accounts` + `account_types`
3. Kept `getItemAccounts()` as a compatibility wrapper over the new batch helper.
4. Mapper now preloads all account mappings once and uses a `Map<number, ItemAccountMapping>` for O(1) lookups per item.

### Completion Notes

- Added `getItemAccountsBatch(companyId, itemIds, connection?)` to eliminate the N+1 account lookup pattern during COGS posting.
- Updated `CogsPostingMapper.mapToJournal()` to fetch all item account mappings once before iterating sale items.
- Preserved existing validation behavior for missing items, missing defaults, and incorrect account types.
- Added focused regression test covering mixed item-specific and default account resolution in one batch call.

### File List

- apps/api/src/lib/cogs-posting.ts
- apps/api/src/lib/cogs-posting.test.ts
- _bmad-output/implementation-artifacts/stories/epic-2/story-2.6-td-001-cogs-posting-n1-fix.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-03-26: Replaced per-item account lookups with batch item account resolution for COGS posting.
- 2026-03-26: Added regression coverage and validated typecheck, build, lint, targeted tests, and full API unit suite.

### AI Review

- Review date: 2026-03-26
- Reviewer: BMAD Code Review workflow
- Result: **Clean review**
- Findings: **0 P0/P1, 0 P2, 0 P3**
- Notes: Verified the runtime N+1 path was removed from `CogsPostingMapper.mapToJournal()`, batch lookup preserves tenant scoping and fallback logic, and test coverage plus full API validation passed.
