# story-23.4.3: Add route-thinness enforcement

## Description
Add CI or lint guard to enforce that route files avoid business workflows/DB write logic, with PR checklist integration.

## Acceptance Criteria

- [ ] CI or lint guard documents/enforces that route files avoid business workflows/DB write logic
- [ ] Pull request template/checklist includes route-thinness check

## Files to Modify

- CI workflow/check scripts under `.github/workflows/*` or tooling scripts
- `_bmad-output/planning-artifacts/api-detachment-pr-checklist.md` (update)

## Dependencies

- story-23.4.1 (Sync push extraction should be complete)

## Estimated Effort

2 hours

## Priority

P2

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run lint -ws --if-present
# CI dry run (if available in repo tooling)
```

## Notes

This enforcement prevents regression back to fat routes. Document clear criteria for what constitutes a "thin" route.
