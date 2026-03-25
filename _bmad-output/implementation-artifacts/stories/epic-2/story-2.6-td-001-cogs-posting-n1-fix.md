# Story 2.6: TD-001 COGS Posting N+1 Fix

Status: backlog

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

- [ ] **Task 1: Read current implementation**
  - [ ] 1.1 Read cogs-posting.ts lines 484-501 to understand current N+1 pattern
  - [ ] 1.2 Identify all item IDs that need account lookup
  - [ ] 1.3 Check existing tests for COGS posting

- [ ] **Task 2: Implement batch fetch pattern**
  - [ ] 2.1 Collect all item IDs before the loop
  - [ ] 2.2 Execute single batch query for all accounts
  - [ ] 2.3 Build Map for O(1) lookup during iteration

- [ ] **Task 3: Verify behavior preservation**
  - [ ] 3.1 Ensure same results as before
  - [ ] 3.2 Check edge cases (empty items, missing accounts)

- [ ] **Task 4: Test Validation (AC2)**
  - [ ] 4.1 Run COGS posting test suite
  - [ ] 4.2 Run full API test suite
  - [ ] 4.3 Verify no regressions

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
