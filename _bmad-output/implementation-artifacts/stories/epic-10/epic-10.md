# Epic 10: Fix Critical Hardcoded ID Tests

**Epic ID:** 10  
**Status:** Done  
**Completion Date:** 2026-03-28  
**Stories Completed:** 4/4 (100%)

---

## Summary

Refactor brittle test files that use hardcoded `TEST_*_ID` constants (especially `company_id=1`) to use dynamic IDs from library functions. Add `createOutletBasic()` library function and apply the pattern from Epic 9 to eliminate test fragility.

---

## Business Context

**Problem:**
- Tests use hardcoded IDs like `TEST_COMPANY_ID = 1` and `TEST_OUTLET_ID = 999999`
- Tests fail when database has unexpected data in those ID ranges
- Tests can interfere with each other through shared IDs
- False sense of safety with high-number IDs (999999)
- 80+ hardcoded ID references across test files

**Opportunity:**
- Achieve true test isolation (each test creates own entities)
- Eliminate flaky tests caused by ID conflicts
- Build on Epic 9 patterns with `create*Basic()` utilities
- Establish lint rules to prevent future hardcoded ID debt

---

## Scope

### In Scope
- Add `createOutletBasic()` library function
- Refactor `lib/inventory/variant-stock.test.ts`
- Refactor `services/stock.test.ts`
- Refactor `routes/stock.test.ts`
- Remove all hardcoded `TEST_*_ID` constants
- Ensure proper cleanup order (FK-aware)

### Out of Scope
- Test logic changes (only setup patterns)
- New test coverage
- Production code changes (except `createOutletBasic()`)

---

## Stories

| Story | Title | Status | Key Changes |
|-------|-------|--------|-------------|
| 10.1 | Add createOutletBasic() | ✅ Done | New library function in `lib/outlets.ts` |
| 10.2 | Refactor variant-stock.test.ts | ✅ Done | Dynamic IDs, removed TEST_* constants |
| 10.3 | Refactor services/stock.test.ts | ✅ Done | 65+ ID references updated |
| 10.4 | Refactor routes/stock.test.ts | ✅ Done | Dynamic company/outlet creation |

---

## Key Deliverables

### 1. createOutletBasic() Function (10.1)

```typescript
export async function createOutletBasic(params: {
  company_id: number;
  code: string;
  name: string;
  city?: string | null;
  // ... other optional fields
}): Promise<{ id: number; company_id: number; code: string; name: string }>
```

**Characteristics:**
- No audit logging (difference from `createOutlet()`)
- Checks for duplicate `company_id + code` combination
- Follows `createCompanyBasic()` pattern from Epic 9

### 2. Test Refactoring Pattern (10.2-10.4)

**Before (brittle):**
```typescript
const TEST_COMPANY_ID = 1;
const TEST_OUTLET_ID = 1;
await conn.execute(
  `INSERT INTO items (company_id, name) VALUES (?, ?)`,
  [TEST_COMPANY_ID, `Test Item ${runId}`]
);
```

**After (robust):**
```typescript
const company = await createCompanyBasic({
  code: `TEST-VS-${runId}`,
  name: `Test Variant Stock ${runId}`
});
const outlet = await createOutletBasic({
  company_id: company.id,
  code: `OUTLET-${runId}`,
  name: `Outlet ${runId}`
});
await conn.execute(
  `INSERT INTO items (company_id, name) VALUES (?, ?)`,
  [company.id, `Test Item ${runId}`]
);
```

---

## Metrics

| Metric | Before | After |
|--------|--------|-------|
| Stories Completed | 0/4 | 4/4 |
| Tests Passing | ~1,500 | 1,524/1,524 |
| Hardcoded ID References | 80+ | 0 (in target files) |
| Test Isolation | Partial | Full (dynamic IDs) |
| Files Refactored | 0 | 3 test files + 1 utility |

---

## Dependencies

### Required Before Starting
- Epic 9 completed (provides `createCompanyBasic()` and `createUserBasic()`)
- Library function patterns established

### Dependencies Between Stories
- 10.1 (createOutletBasic) → 10.2, 10.3, 10.4 (foundation function)
- 10.2, 10.3, 10.4 can be parallel after 10.1

---

## Cleanup Order Pattern

Proper FK-aware cleanup prevents constraint violations:

```typescript
test.after(async () => {
  // Children first
  await conn.execute(`DELETE FROM item_variant_combinations WHERE ...`);
  await conn.execute(`DELETE FROM item_variants WHERE ...`);
  await conn.execute(`DELETE FROM items WHERE ...`);
  await conn.execute(`DELETE FROM outlets WHERE ...`);
  // Parents last
  await conn.execute(`DELETE FROM companies WHERE ...`);
});
```

---

## Files Modified

1. `apps/api/src/lib/outlets.ts` - Added `createOutletBasic()` function
2. `apps/api/src/lib/inventory/variant-stock.test.ts` - Refactored to use dynamic IDs
3. `apps/api/src/services/stock.test.ts` - Refactored to use dynamic IDs (65+ references)
4. `apps/api/src/routes/stock.test.ts` - Refactored to use dynamic IDs

---

## Success Criteria

- [x] `createOutletBasic()` function created and tested
- [x] All hardcoded ID constants removed from target files
- [x] Each test creates its own company/outlet dynamically
- [x] Proper cleanup order maintained (FK constraints)
- [x] All 1,524 tests passing
- [x] No cross-test pollution possible

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Hidden hardcoded IDs | Medium | Medium | Multiple passes, code review |
| FK constraint failures | Low | Medium | Strict cleanup order pattern |
| Test count reduction | Low | Low | Only setup patterns change |

---

## Action Items for Future Epics

| # | Action | Target |
|---|--------|--------|
| 1 | Create ESLint rule to flag hardcoded IDs in tests | Epic 12 |
| 2 | Add `--sequence.shuffle` to CI test run | Next sprint |
| 3 | Document cleanup order pattern in testing guide | Epic 12 |
| 4 | Audit remaining test files for hardcoded IDs | Backlog |

---

## Key Takeaways

1. **Pattern Consistency**: The `create*Basic()` utility pattern from Epic 9 proved reusable and effective
2. **Mechanical Refactoring**: Clear, repeatable process made reviews straightforward
3. **Test Stability**: All 1,524 tests passing with full isolation
4. **Prevention > Detection**: Lint rules at commit time cheaper than refactoring later

---

*Epic completed via completion notes: `epic-10.completion.md`*  
*Retrospective: `epic-10.retrospective.md`*
