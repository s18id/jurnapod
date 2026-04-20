# Story 33.5: Permission Bit Test Fix

**Status:** done

## Story

As a **developer**,
I want to fix incorrect permission bit values in existing tests,
So that tests accurately validate the canonical permission model introduced in Epic 33.

---

## Context

After Epic 33 consolidated the RBAC permission model (READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32), some existing tests used incorrect or legacy permission bit values. Story 33.5 is a post-epic fix to correct those test assertions.

**Dependencies:** Stories 33.1–33.4 must be complete.

---

## Acceptance Criteria

**AC1: Incorrect Permission Bits Fixed**
All test assertions using incorrect permission bit values are updated to use the canonical values from `@jurnapod/shared`.

**AC2: Tests Pass**
All permission-related tests pass after the fix.

**AC3: No Production Code Changed**
Only test files are modified in this story.

---

## Dev Notes

- Canonical permission bits: READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32
- _Created retroactively — post-epic test fix, implementation completed as part of Epic 33._
