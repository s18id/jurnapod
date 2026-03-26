# Technical Debt Registry

**Status:** Living Document  
**Last Updated:** 2026-03-26  
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
| TD-006 | Fixed-assets route test coverage gap | P3 | Open | Epic 3 Retro |

**Resolution (TD-005):** Addressed in Epic 4 Story 4.1 - shared utilities extracted to `lib/shared/` and `lib/master-data-errors.ts`.

**Notes (TD-006):** Fixed-assets CRUD endpoints have thin test coverage compared to items and item-groups. Should be backfilled.

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
| TD-008 | CSV parsing loads entire file into memory | P3 | Open | [ADR-0010](./ADR-0010-import-export-technical-debt.md) |
| TD-009 | Excel parsing loads entire workbook into memory | P3 | Open | [ADR-0010](./ADR-0010-import-export-technical-debt.md) |
| TD-010 | Excel export memory issues for large datasets | P1 | **RESOLVED** | [ADR-0010](./ADR-0010-import-export-technical-debt.md) |
| TD-011 | Batch processor hardcoded companyId=0 | P1 | **RESOLVED** | [ADR-0010](./ADR-0010-import-export-technical-debt.md) |
| TD-012 | FK validation may cause N+1 queries | P3 | Open | [ADR-0010](./ADR-0010-import-export-technical-debt.md) |
| TD-013 | No resume/checkpoint for interrupted imports | P4 | Open | [ADR-0010](./ADR-0010-import-export-technical-debt.md) |
| TD-014 | Export streaming lacks backpressure handling | P4 | Open | [ADR-0010](./ADR-0010-import-export-technical-debt.md) |
| TD-015 | No progress persistence for long-running operations | P4 | Open | [ADR-0010](./ADR-0010-import-export-technical-debt.md) |
| TD-016 | Integration tests deferred for import/export | P2 | Open | Epic 5 Retro |
| TD-017 | Export UI missing column reordering | P2 | Open | Epic 5 Retro |
| TD-018 | Export UI missing row count preview | P2 | Open | Epic 5 Retro |
| TD-019 | Export UI missing retry on errors | P2 | Open | Epic 5 Retro |

**Notes:** 
- TD-010 and TD-011 were resolved during Epic 5 development
- TD-016-TD-019 are UI completeness items from Story 5.4
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

## Summary Statistics

| Priority | Open | Resolved | Total |
|----------|------|---------|-------|
| P1 | 0 | 2 | 2 |
| P2 | 4 | 7 | 11 |
| P3 | 4 | 3 | 7 |
| P4 | 3 | 0 | 3 |
| **Total** | **11** | **12** | **23** |

---

## Process for Adding New Debt Items

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

## Related Documentation

- [ADR-0009: Kysely Type-Safe Query Builder](./ADR-0009-kysely-type-safe-query-builder.md)
- [ADR-0010: Import/Export Framework Technical Debt](./ADR-0010-import-export-technical-debt.md)
- [Epic 0 Retrospective](../_bmad-output/implementation-artifacts/epic-0-retro-2026-03-26.md)
- [Epic 1 Retrospective](../_bmad-output/implementation-artifacts/epic-1-retro-2026-03-25.md)
- [Epic 3 Retrospective](../_bmad-output/implementation-artifacts/epic-3-retro-2026-03-26.md)
- [Epic 5 Retrospective](../_bmad-output/implementation-artifacts/epic-5-retro-2026-03-26.md)
- [Epic 6 Planning](../_bmad-output/planning-artifacts/epics.md)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-03-26 | Initial creation - cataloged debt from Epics 0-6 | Story 6.6 |
| 2026-03-26 | Marked Epic 6 debt items as resolved | Story 6.6 |

---

*This document is maintained as part of the BMAD workflow. Update it whenever new technical debt is identified or resolved.*