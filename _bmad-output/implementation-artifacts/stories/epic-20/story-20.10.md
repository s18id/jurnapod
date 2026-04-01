# Story 20.10: Final Verification

**Status:** backlog  
**Epic:** Epic 20  
**Story Points:** 3  
**Priority:** P1  
**Risk:** MEDIUM  
**Assigned:** unassigned  

---

## Overview

Perform final verification after all schema consolidation stories are complete. Run full typecheck, build verification, and critical path tests. Update schema documentation.

## Technical Details

### Verification Steps

```bash
# 1. Type check API
npm run typecheck -w @jurnapod/api

# 2. Build API
npm run build -w @jurnapod/api

# 3. Lint API
npm run lint -w @jurnapod/api

# 4. Run critical path tests
npm run test:unit:critical -w @jurnapod/api

# 5. Run all unit tests
npm run test:unit -w @jurnapod/api

# 6. Run sync tests
npm run test:unit:sync -w @jurnapod/api

# 7. Run import tests
npm run test:unit:import -w @jurnapod/api

# 8. Build backoffice
npm run build -w @jurnapod/backoffice

# 9. Build POS
npm run build -w @jurnapod/pos
```

### Documentation Updates

```bash
# Update schema documentation
# - Document new table structures
# - Update ERD diagrams
# - Document migration steps
# - Update migration guide
```

### Files to Change

| File | Change |
|------|--------|
| `docs/schema/schema.md` | Update with new table definitions |
| `docs/schema/erd.json` | Update ERD with new schema |
| `docs/adr/adr-021-schema-consolidation.md` | Document architectural decision |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Mark Epic 20 complete |

### Migration Steps

1. **Run typecheck**: Verify no TypeScript errors
2. **Run build**: Verify build succeeds
3. **Run lint**: Verify lint passes
4. **Run tests**: Run critical path and all unit tests
5. **Build other apps**: Verify backoffice and POS still build
6. **Update docs**: Update schema documentation
7. **Create ADR**: Document schema consolidation decision
8. **Mark complete**: Update sprint-status.yaml

## Acceptance Criteria

- [ ] `npm run typecheck -w @jurnapod/api` passes with 0 errors
- [ ] `npm run build -w @jurnapod/api` succeeds
- [ ] `npm run lint -w @jurnapod/api` passes
- [ ] `npm run test:unit:critical -w @jurnapod/api` passes
- [ ] `npm run test:unit -w @jurnapod/api` passes all tests
- [ ] `npm run build -w @jurnapod/backoffice` succeeds
- [ ] `npm run build -w @jurnapod/pos` succeeds
- [ ] Schema documentation updated
- [ ] ADR created for schema consolidation
- [ ] Epic 20 marked as complete in sprint-status.yaml

## Dependencies

- All Epic 20 stories (20.1-20.9) must be complete
