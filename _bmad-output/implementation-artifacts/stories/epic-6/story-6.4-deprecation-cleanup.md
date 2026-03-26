# Story 6.4: Deprecation Cleanup

**Status:** backlog

## Story

As a **Jurnapod developer**,
I want **to remove deprecated functions and update callers**,
So that **the codebase uses consistent, modern APIs without deprecated code paths**.

## Context

Two deprecated items identified:
1. `date-helpers.ts` - `toLocalDate()` deprecated in favor of `toUtcInstant()`
2. `auth.ts` - `checkUserAccess` deprecated in favor of `checkAccess`

## Acceptance Criteria

**AC1: Date Helper Migration**
- Update all callers to use `toUtcInstant()`
- Remove deprecated `toLocalDate()` function

**AC2: Auth Helper Migration**
- Update all callers to use `checkAccess()`
- Remove deprecated `checkUserAccess()` function

**AC3: Documentation**
- Search codebase for remaining references
- Update any docs referencing deprecated functions

## Tasks

- [ ] Find all callers of `toLocalDate()`
- [ ] Update callers to use `toUtcInstant()` or appropriate alternative
- [ ] Remove `toLocalDate()` from `date-helpers.ts`
- [ ] Find all callers of `checkUserAccess()`
- [ ] Update callers to use `checkAccess()`
- [ ] Remove `checkUserAccess()` from `auth.ts`
- [ ] Update AGENTS.md auth section if needed
- [ ] Verify all tests still pass

## Estimated Effort

1 day

## Risk Level

Low (straightforward replacement)

## Dependencies

None
