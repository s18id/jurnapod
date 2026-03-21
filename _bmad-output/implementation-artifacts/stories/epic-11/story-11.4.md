# Story 11.4: Posting Correctness and Reconciliation Guardrails

Status: backlog

## Story

As a finance controller,
I want automated checks around POS/invoice posting integrity,
So that ledger correctness is continuously enforced.

## Acceptance Criteria

### AC 1: Automated Reconciliation Detection

**Given** finalized source transactions and their expected journal links
**When** automated reconciliation runs
**Then** unposted events, missing links, and unbalanced journals are detected deterministically
**And** findings include actionable identifiers (`source_id`, `journal_batch_id`, reason class)

- [ ] Task 1: Create reconciliation check job
- [ ] Task 2: Detect unposted POS transactions
- [ ] Task 3: Detect missing journal links
- [ ] Task 4: Detect unbalanced journals (debit != credit)
- [ ] Task 5: Emit findings with actionable IDs
- [ ] Task 6: Schedule reconciliation to run nightly

### AC 2: Atomic Journal Creation

**Given** posting succeeds under normal conditions
**When** journal creation is committed
**Then** source and journal linkage is atomic and auditable
**And** no partial posting state is visible to downstream reports

- [ ] Task 1: Wrap journal creation in transaction
- [ ] Task 2: Store source_id on journal record
- [ ] Task 3: Verify no orphaned journals
- [ ] Task 4: Verify no unposted sources
- [ ] Task 5: Test atomicity under failure scenarios

### AC 3: Immutable Correction Patterns

**Given** posting or reconciliation failures occur
**When** corrective workflows are triggered
**Then** correction follows immutable reversal/adjustment patterns
**And** silent mutation of finalized financial records is disallowed

- [ ] Task 1: Define VOID/REFUND patterns (immutable)
- [ ] Task 2: Disallow UPDATE on finalized records
- [ ] Task 3: Implement reversal entries (not deletions)
- [ ] Task 4: Add audit trail for corrections
- [ ] Task 5: Create correction approval workflow

### AC 4: Operational Monitoring

**Given** operational monitoring is active
**When** posting drift signals emerge
**Then** dashboards show mismatch rate, unposted backlog age, and reconciliation latency against SLO
**And** high-severity alerts trigger when drift risks ledger correctness thresholds

- [ ] Task 1: Create posting drift dashboard
- [ ] Task 2: Track mismatch rate over time
- [ ] Task 3: Measure unposted backlog age
- [ ] Task 4: Track reconciliation job latency
- [ ] Task 5: Configure alerts for drift thresholds

## Dev Notes

### Reconciliation Checks

| Check | Detection | Severity |
|-------|-----------|----------|
| Unposted TX | POS finalized but no journal | CRITICAL |
| Missing Link | Journal without source_id | HIGH |
| Unbalanced | Sum(debits) != Sum(credits) | CRITICAL |
| Duplicate | Same source_id multiple journals | HIGH |
| Stale | Unposted > 24h | MEDIUM |

### Immutable Correction Pattern

```typescript
// Corrective action types
type CorrectionType = 'VOID' | 'REFUND' | 'ADJUSTMENT';

// Never mutate original - always create new record
interface JournalEntry {
  id: string;
  source_id: string;
  source_type: 'POS' | 'MANUAL' | 'VOID' | 'REFUND';
  correction_of?: string;  // Reference to original
  debit: Decimal;
  credit: Decimal;
  // ... immutably correct
}
```

### Dependencies

- Database (scheduled jobs)
- Accounting/GL module
- Alert system
- Grafana dashboards

### Test Approach

1. **Reconciliation Tests:** Create intentional mismatches, verify detection
2. **Atomicity Tests:** Fail mid-transaction, verify rollback
3. **Immutability Tests:** Attempt mutation, verify rejection
4. **Correction Tests:** Create void/refund, verify audit trail

### References

- Epic: `_bmad-output/planning-artifacts/epics-split/epic-11-operational-trust-and-scale-readiness.md`
- Accounting invariants: Architecture docs

### Related Stories

- Story 11.1: Reliability Baseline and SLO Instrumentation
- Story 11.2: POS Payment and Offline Performance Hardening
- Story 11.3: Sync Idempotency and Retry Resilience Hardening
- Story 11.5: Reporting Reliability, Performance, and Accessibility Hardening

---

## Dev Agent Record

*To be completed when story is implemented.*
