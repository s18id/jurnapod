# Posting Correction Patterns

This document defines immutable correction patterns for financial records in Jurnapod. All corrections to finalized financial records (journal batches, GL entries) MUST follow these patterns to maintain auditability and prevent silent data corruption.

## Core Principle: No Silent Mutation

**Finalized financial records MUST NOT be mutated directly.** Any corrections must be made through explicit reversal or adjustment entries that maintain a complete audit trail.

---

## Correction Types

### 1. VOID Pattern (Full Reversal)

Used when a transaction should be completely nullified.

**When to use:**
- Entire transaction was recorded incorrectly
- Transaction was posted to wrong company/outlet
- Transaction was a duplicate

**How it works:**
```sql
-- Original journal batch (DO NOT DELETE OR MODIFY)
-- id=100, doc_type='POS_SALE', doc_id=456

-- Create VOID journal batch
INSERT INTO journal_batches (
  company_id, outlet_id, doc_type, doc_id, posted_at,
  voided_by_batch_id, is_void
) VALUES (
  1, 2, 'POS_SALE', 456, '2026-03-22 10:00:00',
  NULL, TRUE
);

-- Create reversal lines (swap debit/credit)
INSERT INTO journal_lines (
  journal_batch_id, company_id, outlet_id, account_id,
  line_date, debit, credit, description
) VALUES
  (101, 1, 2, 5001, '2026-03-22', 10000, 0, 'POS revenue - REVERSED void_id=100'),
  (101, 1, 2, 2001, '2026-03-22', 0, 10000, 'POS receivable - REVERSED void_id=100');
```

**Key points:**
- Original batch is marked with `is_void=TRUE` and `voided_by_batch_id` reference
- New batch contains exact opposite entries
- Both batches remain in the system for audit

### 2. REFUND Pattern (Partial Correction)

Used when only part of a transaction needs correction.

**When to use:**
- Partial refund on a sale
- Line item correction (not full void)
- Tax amount adjustment

**How it works:**
```sql
-- Original: POS sale for $100 + $10 tax = $110
-- Refund: Customer returns $20 item, tax reversal $2

-- Create REFUND journal batch
INSERT INTO journal_batches (
  company_id, outlet_id, doc_type, doc_id, posted_at,
  reference_batch_id, is_refund
) VALUES (
  1, 2, 'POS_REFUND', 789, '2026-03-22 11:00:00',
  100,  -- Reference to original batch
  TRUE
);

-- Create refund lines
INSERT INTO journal_lines (
  journal_batch_id, company_id, outlet_id, account_id,
  line_date, debit, credit, description
) VALUES
  (102, 1, 2, 5001, '2026-03-22', 0, 2000, 'POS refund - item return'),
  (102, 1, 2, 2001, '2026-03-22', 2000, 0, 'POS receivable refund'),
  (102, 1, 2, 4001, '2026-03-22', 0, 200, 'Tax payable refund');
```

### 3. Adjustment Pattern (Correcting Entry)

Used when an error must be corrected without reversing the original.

**When to use:**
- Wrong account was used in original posting
- Amount was recorded incorrectly
- Memo entries needed

**How it works:**
```sql
-- Original used account 5001 (Sales Revenue) but should be 5002 (Discount Sales)

-- Create adjustment journal batch
INSERT INTO journal_batches (
  company_id, outlet_id, doc_type, doc_id, posted_at,
  adjustment_type, adjusted_batch_id
) VALUES (
  1, 2, 'JOURNAL_ADJUSTMENT', 100, '2026-03-22 12:00:00',
  'CORRECTING', 100  -- Reference to original batch
);

-- Debit original account, credit correct account
INSERT INTO journal_lines (
  journal_batch_id, company_id, outlet_id, account_id,
  line_date, debit, credit, description
) VALUES
  (103, 1, 2, 5001, '2026-03-22', 5000, 0, 'Correcting: reverse wrong account'),
  (103, 1, 2, 5002, '2026-03-22', 0, 5000, 'Correcting: post to correct account');
```

---

## API Guardrails

### Journals Route Protection

The `/api/journals` route enforces immutability:

```typescript
// PATCH /api/journals/:batchId - NOT ALLOWED
// Returns 405 Method Not Allowed for finalized batches

// DELETE /api/journals/:batchId - NOT ALLOWED
// Returns 405 Method Not Allowed for finalized batches

// Only correction endpoints are exposed:
// POST /api/journals/:batchId/void
// POST /api/journals/:batchId/refund
```

### Database Triggers

```sql
-- Prevent UPDATE on finalized journal_batches
DELIMITER //
CREATE TRIGGER trg_journal_batches_before_update
BEFORE UPDATE ON journal_batches
FOR EACH ROW
BEGIN
  IF OLD.is_void = FALSE AND OLD.status = 'FINALIZED' THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Cannot modify finalized journal batch. Use VOID or REFUND pattern.';
  END IF;
END//
DELIMITER ;
```

---

## Immutability Checklist

Before approving any change to financial records, verify:

- [ ] Original record is preserved (no UPDATE/DELETE)
- [ ] New correction record is created with proper references
- [ ] Correction includes `voided_by_batch_id` or `reference_batch_id`
- [ ] Audit log entry created for correction
- [ ] Correction reason documented in audit payload
- [ ] User performing correction is recorded

---

## Finding Types and Appropriate Corrections

| Finding | Type | Correction Pattern |
|---------|------|-------------------|
| COMPLETED POS missing journal | MISSING_JOURNAL | Backfill journal using idempotent script |
| Journal batch unbalanced | UNBALANCED | Investigate and create adjusting entry; mark batch as REVIEW_NEEDED |
| Journal exists but POS missing | ORPHAN | Investigate source; if duplicate, use VOID pattern |
| Wrong account used | MISPOSTED | Use Adjustment pattern to correct account |
| Wrong amount recorded | AMOUNT_ERROR | Use Adjustment pattern or REFUND if partial |

---

## Related Documentation

- [POS Journal Backfill Runbook](../runbooks/reconciliation-runbook.md)
- [M6 Posting Concurrency Checklist](./m6-posting-concurrency-checklist.md)
- [Sync Push Checklist](../checklists/m5-sync-push-checklist.md)
