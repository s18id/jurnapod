# Story 45.7: DB Cleanup Hook Patterns Documentation

**Epic:** Epic 45 — Tooling Standards & Process Documentation
**Story ID:** 45-7-cleanup-hooks-doc
**Output file:** `_bmad-output/implementation-artifacts/stories/epic-45/story-45.7.md`
**Completion note:** `_bmad-output/implementation-artifacts/stories/epic-45/story-45.7.completion.md`
**Status:** done

---

## Story

### As a:
QA Engineer

### I want:
Database cleanup hook patterns documented

### So that:
Integration tests reliably clean up database state and do not leave hanging connections or polluted data.

---

## Context

Epic 45 focuses on tooling standards and process documentation. Story 45.5 established fixture standards. Story 45.7 documents the cleanup hook patterns that ensure integration tests clean up database state properly and do not leave hanging connections or polluted data.

The existing `docs/testing/cleanup-patterns.md` was created during Epic 34 but is missing several critical patterns that must be documented.

---

## Acceptance Criteria

**AC1: Required afterAll cleanup with resetFixtureRegistry() and pool cleanup**
**Given** a developer is writing integration tests with a real database,
**When** they consult the cleanup patterns documentation,
**Then** they find the required `afterAll` pattern calling `resetFixtureRegistry()` and pool cleanup.

**AC2: beforeAll with cached seed context pattern**
**Given** a developer needs to share seed context across tests efficiently,
**When** they consult the cleanup patterns documentation,
**Then** they find the canonical `beforeAll` with cached seed context pattern.

**AC3: Try/finally for mid-execution failure cleanup**
**Given** a test fails mid-execution,
**When** they consult the cleanup patterns documentation,
**Then** they find the try/finally pattern for cleanup on failure.

**AC4: Tenant isolation cleanup rules**
**Given** a developer writes cleanup SQL for tenant-scoped data,
**When** they consult the cleanup patterns documentation,
**Then** they find the rule that DELETE statements must scope by `company_id` and `outlet_id`.

**AC5: ACL cleanup P0 rule**
**Given** a developer writes cleanup for ACL-related test data,
**When** they consult the cleanup patterns documentation,
**Then** they find the P0 rule that cleanup must always scope by `company_id AND role_id` (never delete by `role_id` alone).

**AC6: Anti-pattern examples**
**Given** a developer wants to understand what breaks without proper cleanup,
**When** they consult the cleanup patterns documentation,
**Then** they find anti-pattern examples showing connection leaks, test pollution, and ACL corruption.

---

## Tasks / Subtasks

- [x] 1. Check if `docs/testing/cleanup-patterns.md` already exists
- [x] 2. Read existing `apps/api/src/lib/test-fixtures.ts` for cleanup patterns in use
- [x] 3. Add `beforeAll` with cached seed context pattern
- [x] 4. Add try/finally for mid-execution failure cleanup
- [x] 5. Add tenant isolation DELETE rules
- [x] 6. Add ACL cleanup P0 rule (always scope by company_id AND role_id)
- [x] 7. Add anti-pattern examples
- [x] 8. Create story spec file
- [x] 9. Create completion note file
- [x] 10. Update sprint-status.yaml to set story to done

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/testing/cleanup-patterns.md` | Modify | Added missing cleanup patterns (seedCtx, try/finally, tenant isolation, ACL cleanup P0, anti-patterns) |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Modify | Set 45-7-cleanup-hooks-doc to done |

---

## Estimated Effort

0.25 days

## Risk Level

None — documentation only

---

## Dev Notes

The existing `docs/testing/cleanup-patterns.md` was reviewed against the acceptance criteria. The following sections were missing and have been added:

1. **beforeAll with cached seed context pattern** — Documents the canonical `getSeedSyncContext()` pattern from `test-fixtures.ts` with the import alias trick to avoid async overhead in `it()` blocks.

2. **Try/finally for mid-execution failure cleanup** — Shows how to ensure cleanup runs even when tests fail, using `finally` blocks.

3. **Tenant isolation DELETE rules** — Documents that all cleanup DELETE statements must include `company_id` and `outlet_id` scoping to prevent cross-tenant data pollution.

4. **ACL cleanup P0 rule** — Documents the critical rule that ACL cleanup must always scope by `company_id AND role_id` and never by `role_id` alone, as deleting `module_roles` rows for system roles corrupts the seeded ACL baseline.

5. **Anti-pattern examples** — Shows what breaks without proper cleanup: connection pool destruction in `afterEach`, missing pool cleanup causing hangs, ACL corruption from improper cleanup.

---

## File List

- `docs/testing/cleanup-patterns.md` — Updated with all missing cleanup patterns (modified)
- `_bmad-output/implementation-artifacts/stories/epic-45/story-45.7.md` — This story spec (created)
- `_bmad-output/implementation-artifacts/stories/epic-45/story-45.7.completion.md` — Completion note (created)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Updated story status (modified)
