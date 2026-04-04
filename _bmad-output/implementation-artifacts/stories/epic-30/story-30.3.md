# Story 30.3: Financial Posting Monitoring

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-30.3 |
| Title | Financial posting monitoring |
| Status | review |
| Type | Infrastructure |
| Sprint | 1 of 1 |
| Dependencies | 30.1 |

---

## Story

As an Operations Engineer,
I want to monitor journal posting health,
So that I can detect and alert on financial posting failures before they cause data inconsistencies.

---

## Acceptance Criteria

1. ✅ Journal posting success tracked by domain (`journal_post_success_total{domain}`)
2. ✅ Journal posting failures tracked with reason (`journal_post_failure_total{domain, reason}`)
3. ✅ GL imbalance detection implemented (`gl_imbalance_detected_total`)
4. ✅ Missing journal alerts when posting completes but journal not created
5. ✅ Alerts fire when posting success rate drops below threshold

---

## Technical Notes

### Journal Metrics

```typescript
// Posting success/failure
journal_post_success_total{domain}  // domain: sales, payment, fixed_asset, etc.
journal_post_failure_total{domain, reason}  // reason: validation_error, db_error, etc.

// Integrity checks
gl_imbalance_detected_total{}      // When debit != credit detected
journal_missing_alert_total{}      // Posting completed but no journal created
```

### GL Balance Check

```sql
-- Run periodically to detect imbalances
SELECT 
  journal_batch_id,
  SUM(debit) as total_debit,
  SUM(credit) as total_credit,
  SUM(debit) - SUM(credit) as imbalance
FROM journal_lines
WHERE journal_batch_id = ?
GROUP BY journal_batch_id
HAVING SUM(debit) != SUM(credit)
```

---

## Tasks

- [x] Instrument journal posting hooks with success/failure metrics
- [x] Implement GL imbalance detection query
- [x] Add missing journal alert logic
- [x] Create alerting rules for posting failures
- [x] Validate with typecheck and build

---

## Dev Notes

- Use existing posting hooks from modules-accounting
- GL check can be expensive - run on sampling or async
- Missing journal detection requires tracking posting completion state

---

## Dev Agent Record

### Implementation Plan

1. Created `JournalMetricsCollector` class in `apps/api/src/lib/metrics/journal-metrics.ts`
2. Exported journal metrics from `apps/api/src/lib/metrics/index.ts`
3. Instrumented sales posting functions (`postSalesInvoiceToJournal`, `postSalesPaymentToJournal`, `postCreditNoteToJournal`, `voidCreditNoteToJournal`) with metrics in `apps/api/src/lib/sales-posting.ts`
4. Instrumented sync push posting hook in `apps/api/src/lib/sync/push/transactions.ts`
5. Added `checkGlImbalance` and `findAllGlImbalances` methods to `JournalsService` in `packages/modules/accounting/src/journals-service.ts`
6. Added `GlImbalanceResult` type for GL imbalance check results
7. Created unit tests for journal metrics in `apps/api/src/lib/metrics/__tests__/journal-metrics.test.ts`

### Completion Notes

**What was implemented:**

1. **Journal Metrics Collector** (`journal-metrics.ts`):
   - `journal_post_success_total{domain}` - Counter for successful postings
   - `journal_post_failure_total{domain, reason}` - Counter for failed postings
   - `gl_imbalance_detected_total{}` - Counter for GL imbalance alerts
   - `journal_missing_alert_total{}` - Counter for missing journal alerts

2. **Posting Instrumentation**:
   - Sales posting functions now record success/failure metrics
   - POS sync posting hook records success/failure metrics
   - Missing journal detection added for active mode postings

3. **GL Imbalance Check**:
   - `checkGlImbalance(batchId)` - Check single batch for imbalance
   - `findAllGlImbalances()` - Find all imbalances across all batches

4. **Error Categorization**:
   - `categorizePostingError()` function maps errors to failure reasons:
     - `validation_error` - Mapping missing, config errors
     - `gl_imbalance` - Unbalanced journal entries
     - `missing_reference` - Missing references
     - `posting_error` - Default for other posting errors

### Change Log

- Date: 2026-04-04
- Story 30.3 Financial Posting Monitoring - Initial implementation

---

## File List

**Created:**
- `apps/api/src/lib/metrics/journal-metrics.ts`
- `apps/api/src/lib/metrics/__tests__/journal-metrics.test.ts`

**Modified:**
- `apps/api/src/lib/metrics/index.ts` - Added journal metrics exports
- `apps/api/src/lib/sales-posting.ts` - Added metrics instrumentation
- `apps/api/src/lib/sync/push/transactions.ts` - Added metrics and missing journal detection
- `packages/modules/accounting/src/journals-service.ts` - Added GL imbalance check methods

---

## Status History

| Date | Status | Notes |
|------|--------|-------|
| 2026-04-04 | review | Implementation complete, ready for review |