# Story 11.4: Refactor Remaining Tests

**Status:** done

## Story

As a **developer**,
I want all remaining test files to use canonical library functions instead of ad-hoc SQL,
So that the entire test suite follows the standard fixture pattern without any remaining hardcoded SQL inserts.

---

## Context

Epic 11, Story 11.4 is a batch cleanup covering all remaining test files not yet addressed by Stories 11.1–11.3. This story completes the Epic 11 goal of eliminating all ad-hoc SQL setup from the test suite (excluding teardown/cleanup and read-only verification).

**Dependencies:** Stories 11.1, 11.2, 11.3 must be complete.

---

## Acceptance Criteria

**AC1: No Ad-Hoc SQL for Setup**
No remaining test file uses raw `INSERT INTO` statements for test fixture setup.

**AC2: Library Functions Used**
All test setup goes through canonical helpers from `apps/api/src/lib/test-fixtures.ts`.

**AC3: Full Test Suite Passes**
All tests pass after completing the batch refactor.

---

## Dev Notes

_Created retroactively — implementation completed as part of Epic 11 execution._
