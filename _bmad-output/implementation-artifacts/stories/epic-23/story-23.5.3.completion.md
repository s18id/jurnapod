# story-23.5.3.completion.md: Run full workspace validation gate

## Files Modified/Created

- **Modified:** `apps/api/src/routes/sales/invoices.test.ts`
  - Fixed silent pass bug in posted-invoice GL check (lines 388-407)
  - Added explicit `assert.ok()` checks for NULL before debit/credit assertions
  - Changed aggregate query result type to include `| null` on fields

- **Modified:** `_bmad-output/implementation-artifacts/stories/epic-23/story-23.5.3.md`
  - Marked all 4 acceptance criteria checkboxes as completed `[x]`

- **Modified:** `_bmad-output/planning-artifacts/api-detachment-validation-report.md`
  - Corrected root-cause analysis for sales test failure
  - Updated sales test result to 98/98 PASS

- **Created:** `_bmad-output/implementation-artifacts/stories/epic-23/story-23.5.3.completion.md` (this file)

## Test Execution Evidence

```bash
$ npm run test:unit:sales -w @jurnapod/api

> @jurnapod/api@0.1.0 test:unit:sales
> node --test --test-concurrency=1 --import tsx "src/routes/sales/*.test.ts" "src/lib/sales"*.test.ts

# tests 98
# suites 32
# pass 98
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

## Summary of Fix

**Issue:** In `invoices.test.ts`, the posted-invoice GL check had a silent pass bug. The code:
```javascript
if (lineRows.rows.length > 0) { ... }
```
would always evaluate to `true` because `SELECT SUM(...)` always returns a row, even when there are no matching journal lines (returning NULL values). This meant if a journal batch existed but had no lines, the test would silently skip all debit/credit assertions.

**Fix:** Added explicit NULL checks on the aggregated values:
```javascript
assert.ok(lineRows.rows.length > 0, "Aggregate query should return a row");
assert.ok(totals.total_debit !== null, "total_debit should not be NULL (batch should have lines)");
assert.ok(totals.total_credit !== null, "total_credit should not be NULL (batch should have lines)");
```

This ensures the test fails fast with a clear message if the journal batch has no lines, rather than silently passing.

## Residual Limitations / Follow-Up

1. **GL account configuration required for full GL posting tests:** The test environment may not have revenue/receivable accounts configured. Tests handle this gracefully by catching expected errors, but full GL balance validation requires proper account setup.

2. **Journal batch existence check relies on posting success:** The GL validation test only runs assertions when `journal_batches` has a row for the invoice. If posting fails due to missing accounts, the batch check is skipped entirely.

3. **No explicit test for unbalanced journal detection:** The test verifies balanced journals when lines exist, but doesn't actively test that UNBALANCED_JOURNAL errors are thrown for invalid cases. This is covered in integration tests elsewhere.

## Status

**Status: DONE** (approved after review; non-blocking P2 cleanup follow-up noted)
