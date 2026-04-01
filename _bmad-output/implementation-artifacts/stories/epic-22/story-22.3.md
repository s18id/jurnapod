# Story 22.3: Remove Core Package and Clean Lockfile/Workspace References

**Status:** done  
**Epic:** Epic 22  
**Story Points:** 2  
**Priority:** P1  
**Risk:** MEDIUM  
**Assigned:** bmad-dev

---

## Overview

Delete `packages/core` after consumer migration and remove all stale lockfile/workspace references.

## Acceptance Criteria

- [x] `packages/core` removed from repository.
- [x] No references to `@jurnapod/core` remain in source imports.
- [x] `package-lock.json` contains no stale workspace link entries for `@jurnapod/core`.

## Expected Files

- `packages/core/**` (deleted)
- `package-lock.json`
- `package.json` (if workspace metadata changes are required)

## Validation (Story)

- [x] `npm ls @jurnapod/core --all` returns empty tree
