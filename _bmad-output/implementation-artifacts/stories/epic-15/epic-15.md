# Epic 15: Foundation Hardening & TD Resolution

**Status:** Ready for Development
**Theme:** Resolve TD-030 (P1) while hardening foundation with connection safety
**Epic Number:** 15
**Dependencies:** Epic 14 (completed)
**Estimated Duration:** ~11 hours (2-3 days)

---

## Summary

Epic 15 addresses two critical foundation issues from Epic 14 retrospective while resolving a long-standing P1 technical debt item from Epic 8.

## Context

### Why This Epic

1. **TD-030 (P1) - Effective Date Filtering**: Open since Epic 8, this requires schema migration to add `effective_from` and `effective_to` columns. It was deferred multiple times and is blocking accurate date-range filtering.

2. **Connection Safety (Epic 14 Learning)**: Epic 14 revealed a P1 connection leak in library functions. This epic adds guardrails to prevent such leaks in the future.

3. **Test Fixture Improvements (Epic 14 Learning)**: Test ordering issues caused unique constraint violations in parallel test runs. This epic improves fixture naming to prevent such issues.

## Goals

1. Resolve TD-030 - Effective date filtering migration
2. Add connection guard to library template to prevent leaks
3. Improve test-fixtures with unique naming
4. Maintain pipeline continuity with proper documentation

## Stories

| Story | Title | Priority | Est |
|-------|-------|----------|-----|
| 15.1 | Connection Guard for Library Template | P1 | 2h |
| 15.2 | test-fixtures Unique Naming | P1 | 2h |
| 15.3 | TD-030 Effective Date Filtering - Migration | P1 | 4h |
| 15.4 | Epic 15 Documentation + Epic 16 Planning | P2 | 1h |
| 15.5 | TD-031 Alert Retry Spike (if time permits) | P2 | 2h |

**Total Estimated:** ~11 hours

---

## Technical Debt to Address

| ID | Description | Priority | Status |
|----|-------------|----------|--------|
| TD-030 | Effective date filtering - requires migration | P1 | Open |
| TD-031 | Alert retry logic spike | P2 | Open |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Epic 14 | ✅ Done | Library functions to guard |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| TD-030 schema change impacts existing queries | Careful analysis, backward compatibility |
| Connection guard changes library API | Keep same function signatures |
| Test fixture changes break existing tests | Update all callers |

---

## Out of Scope

- TD-032 (Batch processing backfills) - depends on TD-030
- Full TD-031 implementation - only spike in this epic

---

*Epic 15 ready for implementation.*
