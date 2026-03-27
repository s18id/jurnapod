# Story 9.9: Enforce Library Usage in Tests

**Status:** backlog
**Epic:** Epic 9: Use Library Functions in Tests
**Story ID:** 9-9-enforce-library-usage

## Context
Add linting rule and documentation to prevent regression to direct SQL patterns.

## Acceptance Criteria
1. ESLint rule: prefer library functions over direct SQL in tests
2. Documentation: `testing/README.md` with library function guide
3. PR template updated with test guidelines

## Technical Notes
- Custom ESLint rule or use existing rules
- Allow direct SQL only for read-only verification
- Document exception process

## Dependencies
All previous stories

## Estimated Effort
0.5 days

## Priority
P2

## Risk Level
Low - Documentation and tooling only
