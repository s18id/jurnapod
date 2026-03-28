# Story 13.7: Create lib/sync/pull/adapter.ts

**Status:** backlog  
**Epic:** Epic 13: Complete Library Migration for Deferred Routes  
**Story ID:** 13-7-create-sync-pull-adapter  
**Estimated Effort:** 6 hours  
**Depends on:** 13.6

---

## Context

Based on Story 13.6 analysis, implement the recommended solution for sync/pull.ts database adapter.

**Note:** This story will be updated after 13.6 analysis is complete.

---

## Placeholder Acceptance Criteria

### AC1: Adapter Library

Create `lib/sync/pull/adapter.ts` with:
- Query execution functions
- Transaction management
- Error handling

### AC2: Route Refactoring

Update `sync/pull.ts` to use adapter library:
- Zero direct SQL
- Thin HTTP handlers

### AC3: Compatibility

Maintain compatibility with sync-core:
- Same interface
- Same behavior
- No breaking changes

---

## Files

**To Create (TBD after analysis):**
- `apps/api/src/lib/sync/pull/adapter.ts`
- `apps/api/src/lib/sync/pull/adapter.test.ts`

**To Modify:**
- `apps/api/src/routes/sync/pull.ts`

---

## Definition of Done

- [ ] Analysis 13.6 complete
- [ ] Implementation per analysis
- [ ] Route refactored
- [ ] Tests passing
- [ ] No regression

---

*Placeholder - will be refined after 13.6.*
