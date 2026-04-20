# Story 11.1: Refactor Cost Tracking Tests

**Status:** done

## Story

As a **developer**,
I want cost tracking tests to use canonical library functions instead of ad-hoc SQL,
So that tests are resilient to schema changes and follow the standard fixture pattern.

---

## Context

Epic 11 continues the test refactoring work from Epic 10. Story 11.1 targets the cost tracking test files, which were using direct SQL inserts for test setup instead of the canonical `test-fixtures.ts` library functions.

**Dependencies:** Epic 10 (Fix Critical Hardcoded ID Tests) must be complete.

---

## Acceptance Criteria

**AC1: No Ad-Hoc SQL for Setup**
Cost tracking test files no longer use raw `INSERT INTO` statements for test fixture setup.

**AC2: Library Functions Used**
All test setup goes through canonical helpers from `apps/api/src/lib/test-fixtures.ts`.

**AC3: Tests Still Pass**
All cost tracking tests pass after refactoring.

---

## Dev Notes

_Created retroactively — implementation completed as part of Epic 11 execution._
