# Epic 13 Parallel Execution Coordination

## Active Delegations

### Scope A: Story 13.3 - Refactor import.ts Route
**Agent:** bmad-agent-dev  
**Status:** ✅ DONE  
**File:** `apps/api/src/routes/import.ts`

**Task:**
- Replace 9 SQL queries with library calls
- Use `lib/import/validation.ts` for SKU/item checks
- Use `lib/import/batch-operations.ts` for batch operations
- Keep transactions and error handling in route

**Acceptance:**
- [ ] Zero `pool.execute()` calls
- [ ] All tests pass
- [ ] TypeScript compilation passes

---

### Scope B: Story 13.5 - Refactor inventory.ts Route
**Agent:** bmad-agent-dev
**Status:** ✅ DONE
**File:** `apps/api/src/routes/inventory.ts`

**Task:**
- Move `canManageCompanyDefaults()` to `lib/auth/permissions.ts` (NEW file)
- Update route to use the moved function
- Remove `getDbPool` import if no longer needed

**Acceptance:**
- [ ] Zero `pool.execute()` calls in route
- [ ] Permission utility in auth library
- [ ] TypeScript compilation passes

---

### Scope C: Story 13.6 - Analyze sync/pull.ts Architecture
**Agent:** bmad-agent-architect
**Status:** ✅ DONE
**File:** `apps/api/src/routes/sync/pull.ts`

**Task:**
- Analyze custom DB adapter pattern for SyncAuditService
- Evaluate refactoring options (keep in route vs extract to library)
- Provide recommendation for Story 13.7 implementation

**Deliverable:**
- Analysis document: `epic-13/sync-pull-analysis.md`
- Recommendation with rationale

---

## Completion Criteria

- [x] Scope A complete (import.ts refactored)
- [x] Scope B complete (inventory.ts refactored)
- [x] Scope C complete (analysis done)
- [x] All TypeScript checks pass
- [ ] Stories updated to "done" in sprint-status.yaml

## Notes

- Scopes A and B are independent and can complete in any order
- Scope C should be prioritized as it unblocks Story 13.7
- Test files should be updated/created as needed
