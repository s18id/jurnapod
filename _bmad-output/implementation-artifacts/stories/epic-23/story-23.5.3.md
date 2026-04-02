# story-23.5.3: Run full workspace validation gate

## Description
Execute comprehensive validation across all workspaces to verify the detachment is complete and no regressions exist.

## Acceptance Criteria

- [ ] Workspace typecheck/build pass
- [ ] API critical suites pass (auth/sync/posting + touched domains)
- [ ] Import audit confirms no `packages/**` importing `apps/api/**`
- [ ] Final detachment report generated with open risks/follow-ups

## Files to Modify

- `_bmad-output/planning-artifacts/api-detachment-validation-report.md` (create)
- `_bmad-output/planning-artifacts/api-detachment-plan.md` (status notes optional)

## Dependencies

- story-23.5.2 (Public APIs should be frozen)

## Estimated Effort

4 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run typecheck -ws --if-present
npm run build -ws --if-present
npm run test:unit:critical -w @jurnapod/api
npm run test:unit:sync -w @jurnapod/api
npm run test:unit:sales -w @jurnapod/api

# Import boundary audit
# (add command to verify no packages import from apps)
```

## Notes

This is the final validation gate for the entire epic. All test suites must pass before marking this story (and the epic) complete.
