# Story 45.5: Database Fixture Standards Documentation

**Epic:** Epic 45 — Tooling Standards & Process Documentation
**Story ID:** 45-5-fixture-standards
**Output file:** `_bmad-output/implementation-artifacts/stories/epic-45/story-45.5.md`
**Completion note:** `_bmad-output/implementation-artifacts/stories/epic-45/story-45.5.completion.md`
**Status:** in-progress

---

## Story

### As a:
Developer

### I want:
Database fixture standards documented

### So that:
I can create consistent, reliable test fixtures across all packages without bypassing domain invariants.

---

## Context

Epic 34 retrospective identified that developers need clear guidance on fixture patterns to prevent FK constraint violations and sentinel ID anti-patterns in tests. The canonical fixture library at `apps/api/src/lib/test-fixtures.ts` implements these patterns but was not documented in a developer-facing standards document.

---

## Acceptance Criteria

**AC1: Canonical fixture registry pattern documented**
**Given** a developer is reading `docs/testing/fixture-standards.md`,
**When** they look for the fixture registry pattern,
**Then** they find explanation of:
- How `createdFixtures` registry tracks all created test data in memory
- The difference between `resetFixtureRegistry()` and `cleanupTestFixtures()`
- Why Option 1 (unique-per-test data, no destructive cleanup) is the default

**AC2: Library vs raw SQL rules documented**
**Given** a developer is writing integration tests,
**When** they consult the fixture standards,
**Then** they find explicit rules:
- When to use library functions (`createTestCompanyMinimal`, `createTestOutletMinimal`, etc.)
- When ad-hoc SQL is allowed (teardown, read-only verification only)
- The P0 blocking rule: ad-hoc SQL for test setup when fixtures exist

**AC3: Naming conventions documented**
**Given** a developer is adding a new fixture function,
**When** they consult the fixture standards,
**Then** they find:
- The `createTest*` prefix requirement for fixture creators
- The difference between creators, lookups, assignments, and factories
- Examples from `apps/api/src/lib/test-fixtures.ts`

**AC4: Lifecycle rules documented**
**Given** a developer is writing an integration test,
**When** they consult the fixture standards,
**Then** they find:
- `resetFixtureRegistry()` in `afterAll` pattern
- Pool cleanup hooks (`closeTestDb()`) are mandatory
- The mandatory hook order (cleanup before pool close)

**AC5: beforeAll + cached getSeedSyncContext() pattern documented**
**Given** a developer needs seeded sync context in tests,
**When** they consult the fixture standards,
**Then** they find:
- The two-function pattern (`loadSeedSyncContext` vs `getSeedSyncContext`)
- How to cache the result in `beforeAll`
- Why calling the load function directly in `it()` blocks is wrong

**AC6: Full examples from canonical test-fixtures.ts**
**Given** a developer wants to see real examples,
**When** they consult the fixture standards,
**Then** they find code examples from the canonical library showing:
- `createTestCompanyMinimal()`, `createTestOutletMinimal()`, `createTestUser()`
- `setupUserPermission({...})` for full permission setup
- `resetFixtureRegistry()` + `closeTestDb()` cleanup sequence

---

## Tasks / Subtasks

- [x] 1. Review existing `docs/testing/fixture-standards.md`
- [x] 2. Verify document contains all required AC elements
- [x] 3. Add missing content for canonical registry pattern section
- [x] 4. Add `beforeAll` + `getSeedSyncContext()` pattern with examples
- [x] 5. Create completion note file

---

## Files to Create

| File | Description |
|------|-------------|
| `_bmad-output/implementation-artifacts/stories/epic-45/story-45.5.completion.md` | Story completion note |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/testing/fixture-standards.md` | Modify | Enhanced with canonical registry pattern, lifecycle rules, and seedSyncContext pattern |

---

## Estimated Effort

0.5 days

## Risk Level

None — documentation only

---

## Dev Notes

The document already existed at `docs/testing/fixture-standards.md` but was missing:
1. The canonical registry pattern explanation (how tracking works)
2. The `beforeAll` + cached `getSeedSyncContext()` pattern
3. More explicit lifecycle rules with code examples

The story focused on enhancing the existing document to ensure all AC elements were covered with working code examples.

---

## File List

- `docs/testing/fixture-standards.md` — Enhanced documentation (modified)
- `_bmad-output/implementation-artifacts/stories/epic-45/story-45.5.md` — This story spec (created)
- `_bmad-output/implementation-artifacts/stories/epic-45/story-45.5.completion.md` — Completion note (created)
