# Story 45.7 Completion: DB Cleanup Hook Patterns Documentation

**Epic:** Epic 45 — Tooling Standards & Process Documentation
**Story ID:** 45-7-cleanup-hooks-doc
**Status:** done
**Completed:** 2026-04-19

---

## Summary

Documented database cleanup hook patterns in `docs/testing/cleanup-patterns.md` to ensure integration tests reliably clean up database state and do not leave hanging connections or polluted data.

---

## What Was Done

### 1. Existing Documentation Review

The existing `docs/testing/cleanup-patterns.md` was reviewed against the story acceptance criteria. It had the following sections:
- Core Problem
- Integration Test Patterns
- DB Transaction Isolation
- Package Test Patterns
- Cleanup Timing Rules
- Idempotency Test Cleanup
- Fixture Registry Cleanup
- Test Isolation Best Practices
- Preventing Test Hangs
- Common Patterns Quick Reference

### 2. Sections Added

The following sections were missing and have been added:

**A. beforeAll with Cached Seed Context Pattern**
- Documented the canonical `getSeedSyncContext()` pattern from `test-fixtures.ts`
- Included the import alias trick to avoid async overhead in `it()` blocks
- Explained why two functions are needed (load vs. wrapper)
- Listed rules for proper usage

**B. Try/Finally for Mid-Execution Failure Cleanup**
- Showed how to ensure cleanup runs even when tests fail
- Included code example with `finally` block
- Explained the key principle

**C. Tenant Isolation Cleanup Rules**
- Documented that all cleanup DELETE statements MUST scope by `company_id` and `outlet_id`
- Provided multi-tenant cleanup pattern with correct order respecting foreign keys
- Listed the rule: always include `company_id` in WHERE clauses

**D. ACL Cleanup P0 Rule**
- Documented the critical P0 rule about canonical system roles
- Listed the three P0 rules for ACL cleanup
- Provided correct ACL cleanup code examples
- Showed correct cleanup for custom test roles only
- Included recovery commands for corrupted ACL

**E. Anti-Pattern Examples**
- Added 5 anti-pattern examples showing what breaks without proper cleanup:
  1. Destroying pool in afterEach (causes "Connection closed" errors)
  2. Missing pool cleanup (causes test hangs)
  3. ACL cleanup without company_id (corrupts system roles)
  4. Missing tenant isolation in cleanup (deletes all data)
  5. Not using try/finally for resource cleanup

---

## Files Modified

| File | Change |
|------|--------|
| `docs/testing/cleanup-patterns.md` | Added 5 new sections: seedCtx pattern, try/finally, tenant isolation, ACL P0 rule, anti-patterns |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Set 45-7-cleanup-hooks-doc to done |
| `_bmad-output/implementation-artifacts/stories/epic-45/story-45.7.md` | Created story spec |
| `_bmad-output/implementation-artifacts/stories/epic-45/story-45.7.completion.md` | Created this completion note |

---

## Verification

All acceptance criteria have been met:

- ✅ AC1: Required `afterAll` cleanup with `resetFixtureRegistry()` and pool cleanup — already existed in documentation
- ✅ AC2: `beforeAll` with cached seed context pattern — added
- ✅ AC3: Try/finally for mid-execution failure cleanup — added
- ✅ AC4: Tenant isolation cleanup rules — added
- ✅ AC5: ACL cleanup P0 rule (always scope by company_id AND role_id) — added
- ✅ AC6: Anti-pattern examples — added (5 examples)

---

## Notes

This story purely documented existing patterns that were already in use in `test-fixtures.ts` and the codebase. No production code was modified.

The ACL cleanup P0 rule is critical — violating it corrupts the seeded ACL baseline and breaks all subsequent tests. The documentation makes this explicit with clear examples of what goes wrong.
