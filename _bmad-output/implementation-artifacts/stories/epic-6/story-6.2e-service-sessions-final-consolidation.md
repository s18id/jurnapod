# Story 6.2e: Service Sessions Final Consolidation

**Status:** backlog

## Story

As a **Jurnapod developer**,
I want **to complete the service-sessions extraction by consolidating duplicate code**,
So that **there's a single source of truth for each function**.

## Context

Stories 6.2a-6.2d extracted service-sessions into sub-modules, but there are remaining issues:
1. `getSessionEvents` is duplicated in both `lifecycle.ts` and `checkpoint.ts`
2. `service-sessions.ts` still contains implementations (should be thin re-export layer)
3. Some helper functions may be duplicated across sub-modules

## Acceptance Criteria

**AC1: Remove Duplicate Function**
- `getSessionEvents` should only exist in ONE file (decide: lifecycle.ts or checkpoint.ts)
- Update imports in other files that reference it
- Remove the duplicate

**AC2: Thin service-sessions.ts Layer**
- `service-sessions.ts` should only import and re-export from sub-modules
- No implementations should remain in service-sessions.ts
- All routes continue to work via re-exports

**AC3: Consolidate Duplicate Helpers**
- Identify any helper functions duplicated across sub-modules
- Move to shared location or keep in one canonical location
- Update all imports

## Tasks

- [ ] Decide canonical location for `getSessionEvents` (lifecycle or checkpoint)
- [ ] Remove duplicate `getSessionEvents` from the other file
- [ ] Update all imports that reference the removed version
- [ ] Move remaining implementations from service-sessions.ts to appropriate sub-modules
- [ ] Make service-sessions.ts a pure re-export file
- [ ] Verify typecheck passes
- [ ] Verify all 765 tests pass

## Estimated Effort

0.5 day

## Risk Level

Low (cleanup only, no functional changes)

## Dependencies

Stories 6.2a, 6.2b, 6.2c, 6.2d must be complete
