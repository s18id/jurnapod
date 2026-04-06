# Story 34.7: Full Validation Gate

## Overview

**Story:** Story 34.7: Full Validation Gate  
**Epic:** Epic 34: Test Reorganization & Assessment  
**Estimate:** 4h  
**Priority:** P1

## Goal

Run comprehensive validation to ensure all tests pass after reorganization, fix any issues discovered.

## Acceptance Criteria

1. `npm run typecheck -ws --if-present` passes across all workspaces
2. `npm run test -ws --if-present` passes across all workspaces
3. All broken imports or paths fixed
4. Test inventory updated with final state

## Validation Commands

### TypeScript Check
```bash
npm run typecheck -ws --if-present
```

### Build Check
```bash
npm run build
```

### Unit Tests
```bash
npm run test:unit -ws --if-present
```

### Integration Tests
```bash
npm run test:integration -ws --if-present
```

### Full Test Suite
```bash
npm run test -ws --if-present
```

## Packages to Validate

| Package | Test Command |
|---------|-------------|
| `@jurnapod/api` | `npm run test:unit && npm run test:integration` |
| `@jurnapod/auth` | `npm run test` |
| `@jurnapod/modules/accounting` | `npm run test` |
| `@jurnapod/modules/platform` | `npm run test` |
| `@jurnapod/modules/reservations` | `npm run test` |
| `@jurnapod/modules/treasury` | `npm run test` |
| `@jurnapod/notifications` | `npm run test` |
| `@jurnapod/pos-sync` | `npm run test` |
| `@jurnapod/sync-core` | `npm run test` |
| `@jurnapod/telemetry` | `npm run test` |

## Common Issues to Watch For

1. **Broken imports** - Moved files may have wrong relative paths
2. **Missing file extensions** - ESM may need `.js` extension in imports
3. **Config path issues** - Vitest config may not find new test locations
4. **Missing dependencies** - Packages may need `vitest` or `tsx` dev dependency

## Fixes Expected

- Fix import paths in moved test files
- Update vitest config `include` patterns if needed
- Add missing devDependencies (vitest, tsx) to packages

## Deliverables

1. All tests passing
2. Final test inventory updated
3. Any issues found and fixed documented

## Dependencies

- Story 34.6 (scripts updated)

## Notes

- This is the final gate - all tests must pass before epic is complete
- Document any tests that were skipped or have known issues
- If tests fail due to pre-existing issues (not reorganization), document for follow-up
