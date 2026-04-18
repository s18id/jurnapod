# Technical Debt Registry

**Status:** Living Document  
**Last Updated:** 2026-04-04  
**Review Cadence:** Per-epic (before closing epic retrospective)

---

## Purpose

This document serves as the central registry for all known technical debt in the Jurnapod codebase. It provides:

1. **Visibility** - All debt items are cataloged in one place
2. **Prioritization** - Clear priority levels help focus remediation efforts
3. **Tracking** - Links to ADRs and stories for detailed context
4. **Prevention** - Process for adding new items and reviewing before epic closure

---

## Priority Levels

| Level | Definition | Response Time |
|-------|------------|---------------|
| **P1** | Critical - Security, data integrity, or production-blocking issues | Address immediately or in current sprint |
| **P2** | High - Performance degradation, maintainability concerns, or significant code smell | Address within next 1-2 sprints |
| **P3** | Medium - Quality-of-life improvements, minor refactoring opportunities | Address when capacity allows |
| **P4** | Low - Nice-to-have improvements, future considerations | Backlog for future consideration |

---

## Debt Registry

### Epic 0: Infrastructure & Technical Debt

| ID | Description | Priority | Status | ADR/Story |
|----|-------------|----------|--------|-----------|
| TD-001 | N+1 in COGS posting (`cogs-posting.ts:484-501`) | P2 | **RESOLVED** | Epic 2 Story 2.6 |
| TD-002 | N+1 in COGS calculation (`cogs-posting.ts:171-235`) | P2 | **RESOLVED** | Epic 2 Story 2.7 |
| TD-003 | N+1 in recipe composition (`recipe-composition.ts:532, 710`) | P2 | **RESOLVED** | Epic 2 Story 2.8 |

**Resolution:** All three N+1 patterns were addressed in Epic 2 through batch query optimization:
- TD-001: Implemented batch item account lookup in `cogs-posting.ts`
- TD-002: Implemented batch inventory lookup with COGS rate resolution
- TD-003: Implemented batch ingredient cost resolution in recipe composition

**Pattern documented in ADR-0009:** The batch-fetch pattern is now the recommended approach for N+1 prevention.

---

### Epic 1: Continue Kysely ORM Migration

| ID | Description | Priority | Status | ADR/Story |
|----|-------------|----------|--------|-----------|
| TD-004 | Kysely vs Raw SQL boundary needs documentation | P3 | **RESOLVED** | Epic 1 Retro |

**Resolution:** Decision criteria documented in ADR-0009. Raw SQL preserved for financial operations (createManualEntry) where type safety trade-offs are acceptable.

---

### Epic 3: Master Data Domain Extraction

| ID | Description | Priority | Status | ADR/Story |
|----|-------------|----------|--------|-----------|
| TD-005 | Helper duplication across domain modules | P2 | **RESOLVED** | Epic 3 Retro |
| TD-006 | Fixed-assets route test coverage gap | P3 | **RESOLVED** | Story 7.4 |

**Resolution (TD-005):** Addressed in Epic 4 Story 4.1 - shared utilities extracted to `lib/shared/` and `lib/master-data-errors.ts`.

**Resolution (TD-006):** HTTP-level integration tests added in `tests/integration/fixed-assets.integration.test.mjs` (Story 7.4): 401 unauthorized, full CRUD lifecycle, 400 validation errors, 404 not-found for categories and assets.

---

### Epic 4: Technical Debt Cleanup & Process Improvement

| ID | Description | Priority | Status | ADR/Story |
|----|-------------|----------|--------|-----------|
| TD-007 | Story status bookkeeping errors | P3 | **RESOLVED** | Epic 4 |

**Resolution:** Sprint-status.yaml accuracy improved with automated status tracking.

---

### Epic 5: Import/Export Infrastructure

| ID | Description | Priority | Status | ADR/Story |
|----|-------------|----------|--------|-----------|
| TD-008 | CSV parsing loads entire file into memory | P3 | **RESOLVED** | Story 7.5 |
| TD-009 | Excel parsing loads entire workbook into memory | P3 | **RESOLVED** | Story 7.5 |
| TD-010 | Excel export memory issues for large datasets | P1 | **RESOLVED** | [ADR-0010](./ADR-0010-import-export-technical-debt.md) |
| TD-011 | Batch processor hardcoded companyId=0 | P1 | **RESOLVED** | [ADR-0010](./ADR-0010-import-export-technical-debt.md) |
| TD-012 | FK validation may cause N+1 queries | P3 | **RESOLVED** | Story 7.6 |
| TD-013 | No resume/checkpoint for interrupted imports | P4 | **RESOLVED** | Story 8.1 - Checkpoint persistence with file hash validation |
| TD-014 | Export streaming lacks backpressure handling | P4 | **RESOLVED** | Story 8.2 - Backpressure detection, 10MB buffer, throttle |
| TD-015 | No progress persistence for long-running operations | P4 | **RESOLVED** | Story 8.3 - Database-backed progress tracking with SSE |
| TD-016 | Integration tests deferred for import/export | P2 | **RESOLVED** | Story 6.7 |
| TD-017 | Export UI missing column reordering | P2 | **RESOLVED** | Story 6.7 |
| TD-018 | Export UI missing row count preview | P2 | **RESOLVED** | Story 6.7 |
| TD-019 | Export UI missing retry on errors | P2 | **RESOLVED** | Story 6.7 |

**Notes:**
- TD-008 and TD-009 resolved in Story 7.5: Both CSV and Excel parsers now use streaming (memory <20MB for 50MB files)
- TD-010 and TD-011 were resolved during Epic 5 development
- TD-016-TD-019 were resolved in Story 6.7 (Epic 6 follow-up)
- Import/export framework is production-ready for current scale (files ≤50MB, exports ≤50K rows)

---

### Epic 6: Technical Debt Consolidation & Modernization

| ID | Description | Priority | Status | ADR/Story |
|----|-------------|----------|--------|-----------|
| TD-020 | `sales.ts` monolith (4,120 lines) | P2 | **RESOLVED** | Story 6.1 |
| TD-021 | `service-sessions.ts` monolith (2,051 lines) | P2 | **RESOLVED** | Story 6.2 |
| TD-022 | `reservations.ts` monolith (1,849 lines) | P2 | **RESOLVED** | Story 6.5 |
| TD-023 | `as any` casts in production code (~67 instances) | P2 | **RESOLVED** | Story 6.3 |
| TD-024 | Deprecated `normalizeDateTime` in date-helpers | P3 | **RESOLVED** | Story 6.4 |
| TD-025 | Deprecated `userHasAnyRole` in auth | P3 | **RESOLVED** | Story 6.4 |

**Resolution:** 
- TD-020: Extracted into `sales/` domain module with types, utils, crud, status sub-modules
- TD-021: Extracted into `service-sessions/` domain module with lifecycle, lines, checkpoint sub-modules
- TD-022: Extracted into `reservations/` domain module with types, utils, crud, availability, status sub-modules
- TD-023: Eliminated ~20 `as any` casts from production code, added proper Row interfaces
- TD-024/025: Removed deprecated functions, updated all callers

---

### Epic 7: Operational Hardening & Production Readiness

| ID | Description | Priority | Status | ADR/Story |
|----|-------------|----------|--------|-----------|
| TD-026 | Import sessions stored in-memory `Map` — not multi-instance safe | P2 | **RESOLVED** | Story 7.2 |
| TD-027 | Batch processing reliability — no partial-failure visibility | P2 | **RESOLVED** | Story 7.3 |
| TD-028 | Session timeout handling edge cases | P2 | **RESOLVED** | Story 7.3 |
| TD-029 | Batch failure recovery — no partial resume capability | P2 | **RESOLVED** | Story 7.3 |

**Additional Items Resolved:**
- TD-012: Batch FK validation implemented (Story 7.6)

**Notes:**
- TD-026 through TD-029 were created during Epic 6 and recorded in the Epic 6 retrospective under legacy labels TD-009 through TD-012 (numbering collision with registry — corrected here)
- TD-026 is the highest-risk item: import sessions will not survive server restarts or scale beyond a single instance
- Resolution approach: MySQL-backed session table with TTL and background cleanup (Redis deferred)

---

### Epic 13: Complete Library Migration for Deferred Routes

| ID | Description | Priority | Status | ADR/Story |
|----|-------------|----------|--------|-----------|
| TD-033 | Epic 13 libraries (import, inventory, sync-pull) required verification of Kysely compatibility | P3 | **RESOLVED** | Epic 14 |

**Resolution:** Epic 14 migrated Epic 13 libraries to Kysely ORM, ensuring consistency across all database access patterns.

---

### Epic 14: Kysely ORM Migration for Epic 13 Libraries

| ID | Description | Priority | Status | ADR/Story |
|----|-------------|----------|--------|-----------|
| TD-034 | Epic 14 migration introduced no new technical debt | — | **CONFIRMED** | Story 14.5 |

**Resolution:** All Epic 14 migration work followed existing patterns documented in ADR-0011. No shortcuts, no deprecated functions, no N+1 patterns introduced.

---

### Epic 8: Production Scale & POS Variant Sync

| ID | Description | Priority | Status | ADR/Story |
|----|-------------|----------|--------|-----------|
| TD-030 | Effective date filtering - requires migration to add effective_from/to columns | P1 | **RESOLVED** | Story 15.3 |
| TD-031 | Alert retry logic - webhook dispatch lacks exponential backoff | P2 | **RESOLVED** | Story 16.1 |
| TD-032 | Batch processing - large table backfills could be batched | P2 | **RESOLVED** | Story 16.2 |

**Resolution (TD-030):** Schema migration added `effective_from` and `effective_to` columns with backfill of historical data. Date filtering now uses these columns instead of computed logic.

**Resolution (TD-031):** Created `lib/retry.ts` with `withRetry()` function implementing exponential backoff. Updated `dispatchAlert()` in `alert-manager.ts` to use retry with max 3 retries, base delay 1000ms (1s → 2s → 4s).

**Resolution (TD-032):** Created `lib/batch.ts` with `withBatchProcessing()` function for batch operations with configurable delay between batches to reduce lock contention.

---

## Summary Statistics

| Priority | Open | Resolved | Total |
|----------|------|---------|-------|
| P1 | 0 | 4 | 4 |
| P2 | 1 | 18 | 19 |
| P3 | 0 | 9 | 9 |
| P4 | 0 | 3 | 3 |
| **Total** | **1** | **34** | **35** |

---

## Process for Adding New Debt Items

### Rule: No New TD Without Tracking

**If a story introduces technical debt, it must be added to this registry before the story is marked done.** No exceptions. The cost of tracking is 5 minutes. The cost of undocumented debt compounds every sprint.

Triggers that require a registry entry:
- Any shortcut taken to meet a deadline
- Any `TODO`/`FIXME` comment left in production code
- Any `as any` cast without a typed alternative immediately available
- Any in-memory state that won't survive restarts or multi-instance deployment
- Any integration tests deferred to a later story
- Any N+1 query pattern knowingly left in place

---

### When to Create a Debt Item

Create a technical debt item when:

1. **During development** - A shortcut is taken to meet a deadline, with a clear remediation path
2. **During code review** - A non-blocking issue is identified that should be tracked
3. **During retrospective** - A pattern or issue is identified that spans multiple stories
4. **During maintenance** - Legacy code is discovered that needs modernization

### How to Add a Debt Item

1. **Assign a unique ID** - Use format `TD-XXX` where XXX is the next available number
2. **Document in the relevant epic section** - Add to the appropriate epic table above
3. **Create detailed ADR if needed** - For complex items, create a dedicated ADR (e.g., ADR-0010)
4. **Link to story** - If the debt was created during a specific story, link to it

### Debt Item Template

```markdown
| TD-XXX | [Brief description] | [P1/P2/P3/P4] | [Open/In-Progress/Resolved] | [ADR-XXX or Story reference] |
```

---

## Debt Review Process

### Per-Epic Review

Before closing an epic retrospective:

1. **Audit debt created** - Review all stories in the epic for new debt items
2. **Update registry** - Add new items to this document
3. **Prioritize** - Assign priority levels based on impact
4. **Assign owners** - Identify who will address each item
5. **Schedule remediation** - P1 items must be addressed before epic closure; P2 items scheduled for next sprint

### Quarterly Review

Every quarter, review all open debt items:

1. **Re-prioritize** - Business context may have changed
2. **Close stale items** - Items that are no longer relevant
3. **Update estimates** - Refine remediation effort if known
4. **Report to stakeholders** - Summarize debt status in sprint reviews

---

## Debt Prevention Checklist

Add this checklist to story templates to prevent debt accumulation:

```markdown
## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] All `TODO`/`FIXME` comments have linked issues
- [ ] No deprecated functions used without migration plan
- [ ] No `as any` casts added without justification
- [ ] No N+1 query patterns introduced
- [ ] All new debt items added to registry
```

---

## TD Health Check

Run the [TD Health Check Template](./td-health-check-template.md) before every epic retrospective to keep this registry accurate.

---

## Related Documentation

- [TD Health Check Template](./td-health-check-template.md) — Per-epic debt audit checklist
- [ADR-0009: Kysely Type-Safe Query Builder](./ADR-0009-kysely-type-safe-query-builder.md)
- [ADR-0010: Import/Export Framework Technical Debt](./ADR-0010-import-export-technical-debt.md)
- [Epic 0 Retrospective](../_bmad-output/implementation-artifacts/epic-0-retro-2026-03-26.md)
- [Epic 1 Retrospective](../_bmad-output/implementation-artifacts/epic-1-retro-2026-03-25.md)
- [Epic 3 Retrospective](../_bmad-output/implementation-artifacts/epic-3-retro-2026-03-26.md)
- [Epic 5 Retrospective](../_bmad-output/implementation-artifacts/epic-5-retro-2026-03-26.md)
- [Epic 6 Planning](../_bmad-output/planning-artifacts/epics.md)

---

### Epic 19: Pure Kysely Migration (API)

| ID | Description | Priority | Status | ADR/Story |
|----|-------------|----------|--------|-----------|
| TD-037 | API Kysely migration verification deferred (~300+ type errors) | P1 | **RESOLVED** | Epic 23 API Detachment |

**Description:** Epic 19 migrated the API package from mysql2 patterns to Kysely but deferred final typecheck verification. Approximately 300+ type errors remained in the API package.

**Resolution:** Resolved during Epic 23 API Detachment. The extensive refactoring of API routes and domain extraction fixed the type issues as a side effect.
- `npm run typecheck -w @jurnapod/api` passes (0 errors)
- `npm run build -w @jurnapod/api` passes

**Owner:** Charlie + Elena

---

### Epic 45: Tooling Standards & Process Documentation

| ID | Description | Priority | Status | ADR/Story |
|----|-------------|----------|--------|-----------|
| TD-038 | 156 pre-existing `@typescript-eslint/no-explicit-any` warnings in API package | P2 | **Open** | Epic 45 Retro |

**Description:** The API package has 156 `no-explicit-any` warnings that existed before Epic 45. Epic 45 introduced no new lint errors (pre-flight gate confirmed 0 new errors). This debt was not created by Epic 45 — it predates it and represents a gradual accumulation of implicit `any` casts.

**Resolution:** Requires systematic audit of API package to replace implicit `any` with explicit types. No production impact, but degrades lint signal quality (156 warnings mask potential real issues).

**Owner:** Tech Lead

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-04-19 | Added TD-038 - 156 pre-existing no-explicit-any warnings in API package | Epic 45 Retro |
| 2026-03-26 | Initial creation - cataloged debt from Epics 0-6 | Story 6.6 |
| 2026-03-26 | Marked Epic 6 debt items as resolved | Story 6.6 |
| 2026-03-26 | Fixed TD-016-019 status to RESOLVED (completed in Story 6.7) | Epic 7 Planning |
| 2026-03-26 | Added TD-026-029 from Epic 6 retro (corrected numbering collision) | Epic 7 Planning |
| 2026-03-26 | Added "No New TD Without Tracking" rule and TD health check reference | Story 7.1 |
| 2026-03-26 | Resolved TD-026–029 (Epic 7 Stories 7.2–7.3) and TD-006 (Story 7.4) | Epic 7 Sprint |
| 2026-03-28 | Resolved TD-008 and TD-009 - streaming parsers for CSV and Excel (Story 7.5) | Story 7.5 |
| 2026-03-28 | Resolved TD-012 - Batch FK validation with single IN clause queries (Story 7.6) | Epic 7 |
| 2026-03-28 | Resolved TD-013 - Import resume/checkpoint (Story 8.1) | Story 8.1 |
| 2026-03-28 | Resolved TD-014 - Export backpressure handling (Story 8.2) | Story 8.2 |
| 2026-03-28 | Resolved TD-015 - Progress persistence (Story 8.3) | Story 8.3 |
| 2026-03-28 | Added TD-030 - Effective date filtering (P1), TD-031 - Alert retry logic (P2), TD-032 - Batch processing backfills (P2) | Epic 8 |
| 2026-03-28 | Fixed summary statistics: P2 total corrected to 18 (was 15), P4 total corrected to 3 (was 3) | Documentation fix |
| 2026-03-28 | Added TD-033, TD-034 - Epic 13/14 confirmation entries; updated P3 resolved count to 9 | Story 14.5 |
| 2026-03-28 | Resolved TD-030 - Effective date filtering migration (Story 15.3) | Story 15.4 |
| 2026-03-29 | Resolved TD-031 - Alert retry with exponential backoff (Story 16.1) | Story 16.1 |
| 2026-03-29 | Resolved TD-032 - Batch processing utility with delays (Story 16.2) | Story 16.2 |
| 2026-04-04 | Resolved TD-037 - API Kysely type errors (~300+ type errors) | Epic 23 API Detachment |
| 2026-03-26 | Marked Epic 6 debt items as resolved | Story 6.6 |
| 2026-03-26 | Fixed TD-016-019 status to RESOLVED (completed in Story 6.7) | Epic 7 Planning |
| 2026-03-26 | Added TD-026-029 from Epic 6 retro (corrected numbering collision) | Epic 7 Planning |
| 2026-03-26 | Added "No New TD Without Tracking" rule and TD health check reference | Story 7.1 |
| 2026-03-26 | Resolved TD-026–029 (Epic 7 Stories 7.2–7.3) and TD-006 (Story 7.4) | Epic 7 Sprint |
| 2026-03-28 | Resolved TD-008 and TD-009 - streaming parsers for CSV and Excel (Story 7.5) | Story 7.5 |
| 2026-03-28 | Resolved TD-012 - Batch FK validation with single IN clause queries (Story 7.6) | Epic 7 |
| 2026-03-28 | Resolved TD-013 - Import resume/checkpoint (Story 8.1) | Story 8.1 |
| 2026-03-28 | Resolved TD-014 - Export backpressure handling (Story 8.2) | Story 8.2 |
| 2026-03-28 | Resolved TD-015 - Progress persistence (Story 8.3) | Story 8.3 |
| 2026-03-28 | Added TD-030 - Effective date filtering (P1), TD-031 - Alert retry logic (P2), TD-032 - Batch processing backfills (P2) | Epic 8 |
| 2026-03-28 | Fixed summary statistics: P2 total corrected to 18 (was 15), P4 total corrected to 3 (was 3) | Documentation fix |
| 2026-03-28 | Added TD-033, TD-034 - Epic 13/14 confirmation entries; updated P3 resolved count to 9 | Story 14.5 |
| 2026-03-28 | Resolved TD-030 - Effective date filtering migration (Story 15.3) | Story 15.4 |
| 2026-03-29 | Resolved TD-031 - Alert retry with exponential backoff (Story 16.1) | Story 16.1 |
| 2026-03-29 | Resolved TD-032 - Batch processing utility with delays (Story 16.2) | Story 16.2 |
| 2026-04-04 | Resolved TD-037 - API Kysely type errors (~300+ type errors) | Epic 23 API Detachment |

---

*This document is maintained as part of the BMAD workflow. Update it whenever new technical debt is identified or resolved.*