# Story 6.3: Type Safety Audit - Remove `as any` Casts

**Status:** backlog

## Story

As a **Jurnapod developer**,
I want **to eliminate unnecessary `as any` casts in production code**,
So that **TypeScript provides meaningful type checking and bugs are caught at compile time**.

## Context

67 instances of `as any` found across codebase. While some are acceptable in test files, production code casts represent type safety debt that can hide bugs.

Priority targets:
- `batch-processor.ts` connection cast
- `recipe-composition.ts` execute cast
- `cost-tracking.ts` multiple casts
- `reports.ts` report type casts

## Acceptance Criteria

**AC1: Production Code Audit**
- Review all `as any` casts in production code (not tests)
- Categorize: necessary (library interop), should fix, can defer
- Fix "should fix" items with proper types

**AC2: Priority Fixes**
- Fix casts in batch-processor, recipe-composition, cost-tracking, reports
- Document acceptable use cases for `as any`

**AC3: Pattern Documentation**
- Document when `as any` is acceptable in `docs/`
- Add ESLint rule to prevent new `as any` in production

## Tasks

- [ ] Audit all production `as any` casts
- [ ] Categorize by fix priority
- [ ] Fix batch-processor.ts casts
- [ ] Fix recipe-composition.ts casts
- [ ] Fix cost-tracking.ts casts
- [ ] Fix reports.ts casts
- [ ] Fix other high-priority casts
- [ ] Add ESLint rule for production `as any` prevention
- [ ] Document acceptable use cases

## Estimated Effort

2 days

## Risk Level

Low (type safety improvement)

## Dependencies

None
