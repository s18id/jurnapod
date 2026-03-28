# Epic 13: Complete Library Migration for Deferred Routes

**Status:** backlog  
**Theme:** Finish Epic 12 deferred work - migrate remaining routes with direct SQL  
**Dependencies:** Epic 12 (library-first architecture established)  
**Estimated Duration:** 1-2 weeks  
**Stories:** 5

---

## Summary

Epic 12 established the library-first architecture and migrated 3 routes. This epic completes the migration for the deferred routes:
- `import.ts` - Complex batch processing (9 SQL queries)
- `inventory.ts` - Simple access check (1 SQL query)
- `sync/pull.ts` - Complex wrapper pattern (multiple SQL operations)

Additionally, this epic migrates the remaining modules to use Kysely ORM where appropriate.

---

## Context

### Why These Were Deferred

| Route | Reason | Complexity |
|-------|--------|------------|
| `import.ts` | Complex batch processing with transactions | High |
| `inventory.ts` | Simple query, lower priority | Low |
| `sync/pull.ts` | Wraps entire sync infrastructure | High |

### Current State

- `import.ts`: 9 direct SQL operations, complex error handling
- `inventory.ts`: 1 access check query inline
- `sync/pull.ts`: Custom DB adapter pattern, needs architectural review

---

## Goals

1. **Complete Library Migration**: Zero direct SQL in all route files
2. **Kysely Migration**: Move libraries to use Kysely ORM
3. **Maintain Functionality**: All existing features preserved
4. **Improve Testability**: Libraries easier to test than routes

---

## Stories

| Story | Title | Status | Est |
|-------|-------|--------|-----|
| 13.1 | Create lib/import/batch-operations.ts | backlog | 6h |
| 13.2 | Create lib/import/validation.ts | backlog | 4h |
| 13.3 | Refactor import.ts Route | backlog | 4h |
| 13.4 | Create lib/inventory/access-check.ts | backlog | 2h |
| 13.5 | Refactor inventory.ts Route | backlog | 2h |
| 13.6 | Analyze sync/pull.ts Architecture | backlog | 4h |
| 13.7 | Create lib/sync/pull/adapter.ts | backlog | 6h |
| 13.8 | Epic 13 Documentation | backlog | 3h |

**Total Estimated Effort:** 31 hours (8 days)

---

## Acceptance Criteria

### AC1: Zero Direct SQL in Routes
- [ ] `import.ts` has no `pool.execute()` or `connection.execute()`
- [ ] `inventory.ts` has no `pool.execute()`
- [ ] `sync/pull.ts` has no direct SQL (via adapter pattern)

### AC2: Library Functions
- [ ] All import batch operations in `lib/import/`
- [ ] Inventory access check in `lib/inventory/`
- [ ] Sync pull adapter in `lib/sync/pull/`

### AC3: Quality Gates
- [ ] All new libraries have unit tests
- [ ] All existing tests pass
- [ ] TypeScript compilation passes
- [ ] No regression in functionality

### AC4: Documentation
- [ ] Architecture decisions documented
- [ ] Complex patterns explained

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| import.ts complexity | High | Break into smaller libraries (batch, validation, etc.) |
| sync/pull adapter pattern | High | Architectural review before implementation |
| Breaking import functionality | High | Comprehensive integration tests |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Epic 12 | Done | Library patterns established |
| Kysely types | Ready | From packages/db |

---

## Out of Scope

- Migrating test files (they can keep direct SQL)
- Changing business logic (only moving code)
- Performance optimization (preserve current behavior)

---

*Epic 13 ready for implementation.*
