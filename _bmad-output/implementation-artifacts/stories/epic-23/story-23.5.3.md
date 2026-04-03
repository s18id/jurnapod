# story-23.5.3: Run full workspace validation gate

## Description
Execute comprehensive validation across all workspaces to verify the detachment is complete and no regressions exist.

## Acceptance Criteria

- [x] Workspace typecheck/build pass
- [x] API critical suites pass (auth/sync/posting + touched domains)
- [x] Import audit confirms no `packages/**` importing `apps/api/**`
- [x] Final detachment report generated with open risks/follow-ups

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

---

## Dev Agent Record

**Implementation Date:** 2026-04-03

### Summary

Executed full workspace validation gate for Epic 23 API Detachment. All validation commands were run and results documented.

### Implementation Summary

1. **Typecheck:** PASS - All 17 workspaces passed typecheck
2. **Build:** PASS - All 17 workspaces built successfully  
3. **Critical Tests:** PASS - 37 suites, 0 failures
4. **Sync Tests:** PASS - 96 tests, 0 failures
5. **Sales Tests:** PASS - 98/98 tests pass (previously 1 failure due to bad test query)

**Import Boundary Audit:** PASS - No packages import from apps/api

### Issue Fixed During Validation

Test failure in `src/routes/sales/invoices.test.ts` at line 377:
- Error: `Unknown column 'total_debit' in 'SELECT'`
- Root cause: **Bad test query** - selecting `total_debit`/`total_credit` from `journal_batches` table which only stores batch metadata; these columns don't exist there
- Fix: Updated test to select metadata from `journal_batches` only, then aggregate debit/credit from `journal_lines` by `journal_batch_id`
- Result: Sales tests now pass at 98/98 (100%)

### Files Changed

- Modified: `apps/api/src/routes/sales/invoices.test.ts` (fixed bad test query)
- Modified: `_bmad-output/planning-artifacts/api-detachment-validation-report.md` (updated root cause and test results)

### Test Evidence

```
Typecheck: 17/17 PASS
Build: 17/17 PASS  
Critical: 37 suites PASS
Sync: 96 tests PASS
Sales: 98/98 PASS (100% - fixed bad query)
Import audit: 0 violations
```

### Status

**Status: DONE**

*All acceptance criteria met. Sales test fixed and now passing at 100%.*
