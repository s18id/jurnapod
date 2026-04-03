# story-28.5: Full validation gate

## Description

Run the full workspace validation gate for Epic 28. No new code changes — this story is a pure verification gate that must pass before Epic 28 is marked complete.

## Acceptance Criteria

- [ ] All packages typecheck: `npm run typecheck --workspaces --if-present`
- [ ] All packages build: `npm run build --workspaces --if-present`
- [ ] Full API test suite: `npm test -w @jurnapod/api` — all tests pass
- [ ] modules-sales tests pass: `npm test -w @jurnapod/modules-sales` (if tests exist)
- [ ] No breaking changes to existing payment behavior (idempotency, allocation, journal posting)

## Validation Commands

```bash
# Typecheck all packages
npm run typecheck --workspaces --if-present

# Build all packages
npm run build --workspaces --if-present

# Full API test suite
npm test -w @jurnapod/api

# Payment-specific tests
npm test -- --testPathPattern="payments" -w @jurnapod/api
```

## Dependency

- story-28.4 (validation gate only runs after route flip is complete)

## Non-Goals for this story

- No new code changes
- No test additions (unless a gap was discovered during the epic)
- No documentation changes

## Success Criteria

All acceptance criteria pass with 0 failures across the full workspace.