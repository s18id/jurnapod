# Epic 12: Standardize Library Usage for All Routes

**Status:** backlog  
**Theme:** Architecture consistency - all routes must use library modules for database operations  
**Dependencies:** Epic 11 (test refactoring complete)  
**Estimated Duration:** 2-3 weeks  
**Stories:** 7

---

## Summary

Migrate all direct SQL queries from route files to library modules. Routes should import and call library functions instead of executing raw SQL. This establishes a clean architectural boundary where routes are pure HTTP handlers and all business logic lives in libraries.

---

## Context

Currently, several route files contain direct SQL queries using `pool.execute()`, `connection.execute()`, or `dbPool.execute()`. This violates the architectural principle that routes should be thin HTTP handlers that delegate business logic to library modules.

**Current State:**
- 7 route files contain direct SQL queries
- 23 total `*.execute()` calls in routes
- Mixed patterns: some routes use libraries, some don't
- Inconsistent error handling across routes

**Target State:**
- Zero direct SQL queries in route files
- All database operations go through `lib/` modules
- Consistent error handling patterns
- Routes are pure HTTP layer (auth, validation, response formatting)

---

## Goals

1. **Eliminate Direct SQL in Routes**: Move all `pool.execute()` calls from routes to library modules
2. **Establish Library Patterns**: Standardize how libraries expose database operations
3. **Improve Testability**: Routes become easier to test when they depend on libraries
4. **Enable Kysely Migration**: Library abstraction makes future Kysely adoption easier

---

## Stories

| Story | Title | Status | Est |
|-------|-------|--------|-----|
| [12.1](story-12.1-create-settings-modules-library.md) | Create `lib/settings-modules.ts` Library | backlog | 4h |
| [12.2](story-12.2-refactor-settings-modules-route.md) | Refactor `settings-modules.ts` Route | backlog | 2h |
| [12.3](story-12.3-create-sync-check-duplicate-library.md) | Create `lib/sync/check-duplicate.ts` Library | backlog | 3h |
| [12.4](story-12.4-refactor-sync-check-duplicate-route.md) | Refactor `sync/check-duplicate.ts` Route | backlog | 2h |
| [12.5](story-12.5-extend-export-library.md) | Extend `lib/export/` for Route Queries | backlog | 6h |
| [12.6](story-12.6-refactor-export-route.md) | Refactor `export.ts` Route | backlog | 4h |
| [12.7](story-12.7-epic-12-documentation.md) | Epic 12 Documentation & ADR Update | backlog | 3h |

**Total Estimated Effort:** 24 hours (6 days)

---

## Acceptance Criteria

### AC1: Zero Direct SQL in Routes
- [ ] No `pool.execute()` calls in `apps/api/src/routes/*.ts` (excluding tests)
- [ ] No `connection.execute()` calls in route handlers
- [ ] No `dbPool.execute()` calls in route handlers

### AC2: Library Pattern Established
- [ ] All routes import database operations from `lib/` modules
- [ ] Libraries expose async functions (not classes where simple functions suffice)
- [ ] Libraries accept optional `PoolConnection` for transaction support
- [ ] Libraries throw domain-specific errors

### AC3: Quality Gates
- [ ] New libraries have unit tests
- [ ] All existing tests pass
- [ ] TypeScript compilation passes
- [ ] Lint passes with no warnings

### AC4: Documentation
- [ ] ADR created for Library-First Architecture
- [ ] project-context.md updated with route pattern rules
- [ ] Library template created for future modules

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Breaking changes in route behavior | High | Comprehensive test coverage before refactoring |
| Library API design doesn't fit all use cases | Medium | Design review before implementation |
| Scope creep (other routes need work) | Low | Strict scope: only 7 target routes |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Epic 11 completion | Done | Test refactoring complete |
| DbClient/Kysely infrastructure | Done | From Epic 1 |
| ESLint rules | Done | From previous work |

---

## Deferred Items (Future Epics)

The following routes have SQL but are deferred to Epic 13:

| Route | Reason | Target Epic |
|-------|--------|-------------|
| `import.ts` | Complex batch processing, already has `lib/import/` | Epic 13 |
| `stock.ts` | Already has `lib/stock.ts`, needs analysis | Epic 13 |
| `inventory.ts` | Complex joins, needs domain analysis | Epic 13 |
| `sync/pull.ts` | Sync infrastructure, separate concern | Epic 13 |

---

## Out of Scope

- Migrating routes to Kysely (that's Epic 13)
- Refactoring test files (tests can keep direct SQL for setup)
- Changing business logic (only moving existing logic to libraries)

---

## Definition of Done

- [ ] All 7 stories completed
- [ ] All ACs verified
- [ ] Zero direct SQL in target routes
- [ ] Documentation updated
- [ ] Epic retrospective completed

---

*Epic 12 ready for implementation.*
