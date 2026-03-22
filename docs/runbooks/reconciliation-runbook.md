# Reconciliation Runbook

This runbook describes how to run and interpret POS-to-Journal reconciliation checks.

## Overview

The reconciliation system detects three types of issues:
- **MISSING_JOURNAL**: COMPLETED POS transactions without corresponding journal batches
- **UNBALANCED**: Journal batches where debit totals ≠ credit totals
- **ORPHAN**: Journal batches without corresponding POS transactions

## Running Reconciliation

### Via API (Recommended)

**Check status (counts only):**
```bash
curl -X GET "http://localhost:3001/api/reconciliation?company_id=1" \
  -H "Authorization: Bearer $TOKEN"
```

Response:
```json
{
  "success": true,
  "data": {
    "companyId": 1,
    "counts": {
      "missingJournal": 0,
      "unbalanced": 0,
      "orphan": 1
    },
    "status": "FAIL"
  }
}
```

**Trigger full reconciliation (with all findings):**
```bash
curl -X POST "http://localhost:3001/api/reconciliation" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"company_id": 1}'
```

Response:
```json
{
  "success": true,
  "data": {
    "companyId": 1,
    "ranAt": "2026-03-22T10:00:00.000Z",
    "findings": [
      {
        "type": "ORPHAN",
        "journalBatchId": 501,
        "companyId": 1,
        "details": "Journal batch 501 has no corresponding POS transaction"
      }
    ],
    "counts": {
      "missingJournal": 0,
      "unbalanced": 0,
      "orphan": 1
    },
    "status": "FAIL"
  }
}
```

### Via CLI Script

**Dry run (no changes):**
```bash
npm run db:reconcile:pos-journals -- --dry-run --company-id=1
```

**Execute reconciliation:**
```bash
npm run db:reconcile:pos-journals -- --execute --company-id=1
```

## Interpreting Results

### MISSING_JOURNAL

**What it means:** A COMPLETED POS transaction exists but no journal batch was created.

**Possible causes:**
- Posting was disabled at time of transaction
- Posting failed silently
- Historical data before posting was enabled

**Resolution:**
```bash
# Backfill missing journals
npm run db:backfill:pos-journals -- --execute --company-id=1 --outlet-id=2
```

### UNBALANCED

**What it means:** A journal batch has unequal debits and credits.

**Possible causes:**
- Data corruption
- Migration error
- Manual intervention

**Resolution:**
1. Investigate the batch:
   ```sql
   SELECT * FROM journal_batches WHERE id = ?;
   SELECT * FROM journal_lines WHERE journal_batch_id = ?;
   ```
2. Create an adjusting entry following [correction patterns](../checklists/posting-correction-patterns.md)
3. Mark batch as requiring review

### ORPHAN

**What it means:** A journal batch exists but the referenced POS transaction does not.

**Possible causes:**
- POS was voided after journal was created
- Manual journal creation error
- Data sync issue

**Resolution:**
1. Verify POS status:
   ```sql
   SELECT * FROM pos_transactions WHERE id = ?;
   ```
2. If POS was voided/refunded, use VOID pattern on journal
3. If POS truly missing, investigate and potentially use VOID pattern

## SLO Targets

| Metric | Target |
|--------|--------|
| Reconciliation latency | < 5 minutes for standard backlog |
| Missing journal rate | < 0.1% of COMPLETED transactions |
| Unbalanced batch count | 0 (any finding is actionable) |
| Orphan batch count | 0 (any finding is actionable) |

## Alerting

Alerts should fire when:
- `missingJournal > 0` (any missing journals)
- `unbalanced > 0` (any unbalanced batches)
- `orphan > 0` (any orphan batches)

Alert threshold for count increases:
- Missing journals increasing > 10 in 1 hour
- Reconciliation latency > 5 minutes

## Schedule

Recommended reconciliation schedule:
- **Real-time**: Via API on-demand for finance users
- **Hourly**: Automated script for missing journal detection
- **Daily**: Full reconciliation for all companies

## Related Documentation

- [Posting Correction Patterns](../checklists/posting-correction-patterns.md)
- [M6 Posting Concurrency Checklist](../checklists/m6-posting-concurrency-checklist.md)
- [POS Journal Backfill](./pos-journal-backfill-reconciliation.md)
