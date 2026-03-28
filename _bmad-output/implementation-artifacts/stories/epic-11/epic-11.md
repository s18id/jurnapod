# Epic 11: Refactor Remaining Test Files

**Epic ID:** 11  
**Status:** Done  
**Completion Date:** 2026-03-28  
**Stories Completed:** 5/5 (100%)

---

## Summary

Replace 34 direct `INSERT INTO items` statements with the `createItem()` library function across 8 test files. Complete the test modernization journey started in Epics 9 and 10, ensuring all test files use consistent library function patterns.

---

## Business Context

**Problem:**
- 34 remaining `INSERT INTO items` statements in test files
- Direct SQL bypasses library function validation
- Inconsistent patterns across test files
- Technical debt from earlier test development

**Opportunity:**
- Complete the test modernization trilogy (Epics 9→10→11)
- 100% library function adoption for item creation
- Consistent, maintainable test patterns throughout codebase
- Eliminate raw SQL in favor of typed library functions

---

## Scope

### In Scope
- Replace all `INSERT INTO items` with `createItem()` calls
- Audit all 70+ test files for hardcoded ID patterns
- Verify no inappropriate hardcoded IDs remain
- Ensure all tests still pass after refactoring

### Out of Scope
- Production code changes (except `createItem()` extensions)
- Test logic changes (only setup patterns)
- New test coverage

---

## Stories

| Story | Title | Status | Notes |
|-------|-------|--------|-------|
| 11.1 | Refactor cost-tracking tests | ✅ Done | `cost-tracking.db.test.ts` and `cost-auditability.test.ts` already refactored |
| 11.2 | Refactor cogs-posting tests | ✅ Done | `cogs-posting.test.ts` already refactored (TEST_USER_ID=1 intentional for super-admin) |
| 11.3 | Refactor users/auth tests | ✅ Done | `users.test.ts` and `auth.test.ts` use environment-based fixture lookup |
| 11.4 | Audit remaining test files | ✅ Done | All 70+ test files audited - no remaining hardcoded ID patterns |
| 11.5 | Replace INSERT INTO items | ✅ Done | 34 INSERT statements replaced across 8 files |

---

## Key Deliverables

### 1. INSERT Replacements (11.5)

| File | Replacements |
|------|--------------|
| `lib/inventory/variant-stock.test.ts` | 11 |
| `lib/pricing/variant-price-resolver.test.ts` | 9 |
| `lib/master-data.thumbnail-sync.test.ts` | 6 |
| `lib/service-sessions.test.ts` | 2 |
| `services/stock.test.ts` | 2 |
| `routes/stock.test.ts` | 1 |
| `lib/item-images.test.ts` | 1 |
| `routes/sync/push-variant.test.ts` | 1 |
| **Total** | **34** |

### 2. Pattern Transformation

**Before:**
```typescript
const [itemResult] = await conn.execute<ResultSetHeader>(
  `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'PRODUCT')`,
  [companyId, `Test Item ${runId}`]
);
itemId = Number(itemResult.insertId);
```

**After:**
```typescript
const item = await createItem(companyId, {
  name: `Test Item ${runId}`,
  type: 'PRODUCT'
});
itemId = item.id;
```

### 3. Field Handling

| Field | Handling |
|-------|----------|
| `name`, `type` | Via `createItem()` parameters |
| `created_at` / `updated_at` | Handled internally |
| `low_stock_threshold` | Post-creation UPDATE (not supported by createItem) |

---

## Metrics

| Metric | Value |
|--------|-------|
| INSERT statements replaced | 34 |
| Test files refactored | 8 |
| Unit tests passing | 1,524/1,524 |
| Regressions introduced | 0 |
| New bugs | 0 |

---

## Dependencies

### Required Before Starting
- Epic 9 completed (provides `createCompanyBasic()` and `createUserBasic()`)
- Epic 10 completed (provides `createOutletBasic()`)
- `createItem()` library function exists and tested

### Dependencies Between Stories
- 11.1-11.4 (audit/verification) → 11.5 (implementation)
- Stories 11.1-11.4 discovered work was already done in Epic 10

---

## Verification Results

### Remaining Hardcoded IDs Found
Only one intentional hardcoded ID remains:
- `TEST_USER_ID = 1` in `cogs-posting.test.ts` - Uses seeded super-admin user ID (1) as `postedBy` in `postCogsForSale()` calls

### Files Verified Clean
All 70+ test files searched for hardcoded `TEST_*_ID = <6+ digit number>` patterns:
- None found (except the intentional super-admin reference)

---

## Files Modified

1. `apps/api/src/lib/inventory/variant-stock.test.ts`
2. `apps/api/src/lib/pricing/variant-price-resolver.test.ts`
3. `apps/api/src/lib/master-data.thumbnail-sync.test.ts`
4. `apps/api/src/lib/service-sessions.test.ts`
5. `apps/api/src/services/stock.test.ts`
6. `apps/api/src/routes/stock.test.ts`
7. `apps/api/src/lib/item-images.test.ts`
8. `apps/api/src/routes/sync/push-variant.test.ts`

---

## Success Criteria

- [x] All 34 INSERT INTO items replaced with createItem()
- [x] All tests passing (1,524/1,524)
- [x] Type check passing
- [x] Build passing
- [x] Lint passing (--max-warnings=0)
- [x] No remaining direct INSERT INTO items in test files

---

## Lessons Learned

### For Cleanup/Verification Epics
1. **Name them clearly** — Use "Follow-up," "Verification," or "Cleanup" in titles
2. **Set expectations** — Document that work may be "already done" in the epic description
3. **Include verification stories** — Make final audit/verification explicit, not implicit

### For Test Refactoring
1. **Automate prevention** — Don't rely on code review alone; use tooling
2. **Complete the library** — If you need UPDATEs after creation, the helper isn't finished
3. **Baseline consistency** — Agree on test count sources

---

## Action Items for Future Epics

| # | Action | Priority | Target |
|---|--------|----------|--------|
| 1 | Create ESLint rule to ban `INSERT INTO items` in test files | P2 | Next sprint |
| 2 | Extend `createItem()` with optional `low_stock_threshold` param | P3 | Epic 12+ |
| 3 | Update epic naming guidelines for cleanup epics | P3 | Process doc |
| 4 | Standardize artifact creation: epic.md required for all epics | P2 | Immediate |

---

## Epic Closure

Epic 11 successfully completed the test modernization trilogy (Epics 9-10-11). The codebase is now more maintainable, more consistent, and better positioned for future development.

**Key Achievements:**
- 80%+ reduction in direct SQL test instances (Epic 9)
- All hardcoded ID tests refactored (Epic 10)
- All INSERT INTO items replaced (Epic 11)
- 1,524/1,524 tests passing with full isolation

**Next Step:** Implement action items in upcoming sprint to prevent regression and standardize process.

---

*Epic completed via completion notes: `epic-11.completion.md`*  
*Retrospective: `epic-11.retrospective.md`*
