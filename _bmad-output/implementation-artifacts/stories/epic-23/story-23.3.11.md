# story-23.3.11: Extract report query/services

## Description
Move report query and service logic from the API to the modules-reporting package while maintaining existing response contracts.

## Acceptance Criteria

- [ ] Report query and service logic moved to reporting package
- [ ] API report routes remain boundary-only with same response contracts
- [ ] Financial report tests continue to reconcile with GL logic

## Files to Modify

- `packages/modules/reporting/src/reports/*` (create)
- `apps/api/src/lib/reports.ts` (adapter/removal)
- `apps/api/src/routes/reports/*` (wiring updates)

## Dependencies

- story-23.3.10 (Reporting bootstrap must be complete)

## Estimated Effort

4 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run test:unit:single -w @jurnapod/api src/routes/reports/*.test.ts
npm run test:unit:critical -w @jurnapod/api
```

## Notes

Financial reports must reconcile with GL. Ensure all existing report tests pass and GL tie-outs remain correct.
