# story-23.0.4: Create extraction checklist template

## Description
Create a standardized PR checklist template that ensures all extraction work follows the same quality and safety standards.

## Acceptance Criteria

- [ ] Checklist template created for every migration PR:
  - Package owns runtime implementation
  - API route is thin adapter
  - No `packages -> apps` imports
  - Contract tests pass
- [ ] Template includes required risk checks for posting, sync idempotency, tenant scope

## Files to Modify

- `_bmad-output/planning-artifacts/api-detachment-pr-checklist.md` (create)

## Dependencies

- story-23.0.1 (ADR must be completed)

## Estimated Effort

2 hours

## Priority

P2

## Validation Commands

```bash
# Manual checklist dry-run against one pilot module
```

## Notes

The checklist will be used for all subsequent PRs in this epic. Ensure it covers all critical invariants: GL correctness, sync idempotency, tenant isolation.
