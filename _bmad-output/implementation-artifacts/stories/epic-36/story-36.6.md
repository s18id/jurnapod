# Story 36.6: Migration Hardening, Rollout, and Cleanup

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-36.6 |
| Title | Migration Hardening, Rollout, and Cleanup |
| Status | pending |
| Type | Verification/Cleanup |
| Sprint | TBD |
| Priority | P2 |
| Estimate | 4-6h |

## Story

As a platform engineer, I want to ensure clean migration with rollback capability, so that the import/export extraction is verified end-to-end and legacy code is fully cleaned up.

## Background

This is the final story in Epic 36, focused on verification, hardening, and cleanup after the extraction work in Stories 36.1-36.5. It ensures tenant isolation is preserved, runs integration tests, and removes all backward-compatibility code once parity is confirmed.

## Acceptance Criteria

1. Full integration test suite passes for import/export flows
2. Import/export work end-to-end with real database
3. All tenant isolation (company_id, outlet_id) is preserved
4. API routes have no lib/ import fallbacks
5. All backward-compat wrappers deleted
6. Sprint status updated with completion status
7. Technical debt documented if any remains
8. All acceptance criteria from Epic 36 are met

## Technical Notes

- Run integration tests covering:
  - Import upload → parse → validate → apply → complete flow
  - Import checkpoint → resume after partial failure
  - Export data generation and streaming
  - Export template generation
  - Export columns listing
  - Tenant isolation verification (cross-tenant data access denied)
  
- Verify no legacy imports remain:
  - `apps/api/src/lib/import/*` should not exist (or only re-export from package)
  - `apps/api/src/lib/export/*` should not exist (or only re-export from package)
  - Routes should not call internal `getDb()`

- Document any technical debt:
  - Known limitations
  - Performance considerations
  - Future improvement opportunities

## Tasks

- [ ] Run full integration test suite for import/export
- [ ] Manual end-to-end verification with real database
- [ ] Verify tenant isolation with cross-tenant access tests
- [ ] Remove any remaining lib/ import fallbacks in routes
- [ ] Delete all backward-compat wrapper code
- [ ] Update sprint status with completion status
- [ ] Document technical debt if any remains
- [ ] Final typecheck and build verification

## Validation

```bash
npm run typecheck -w @jurnapod/modules-platform
npm run typecheck -w @jurnapod/api
npm run test --workspace=@jurnapod/api
```

All tests pass, typecheck passes, and no backward-compat wrappers remain.
