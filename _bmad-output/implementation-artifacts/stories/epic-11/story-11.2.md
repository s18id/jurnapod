# Story 11.2: Refactor COGS Posting Tests

**Status:** done

## Story

As a **developer**,
I want COGS posting tests to use canonical library functions instead of ad-hoc SQL,
So that tests are resilient to schema changes and follow the standard fixture pattern.

---

## Context

Epic 11, Story 11.2 targets the COGS (Cost of Goods Sold) posting test files. These tests verify that journal entries are correctly generated when items are sold. The refactoring ensures they use canonical test fixtures.

**Dependencies:** Story 11.1 must be complete.

---

## Acceptance Criteria

**AC1: No Ad-Hoc SQL for Setup**
COGS posting test files no longer use raw `INSERT INTO` statements for test fixture setup.

**AC2: Library Functions Used**
All test setup goes through canonical helpers from `apps/api/src/lib/test-fixtures.ts`.

**AC3: Tests Still Pass**
All COGS posting tests pass after refactoring.

---

## Dev Notes

_Created retroactively — implementation completed as part of Epic 11 execution._
