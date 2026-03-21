# Story 11.5: Reporting Reliability, Performance, and Accessibility Hardening

Status: backlog

## Story

As a backoffice user,
I want trial balance and ledger reports to be fast, reliable, and accessible,
So that financial oversight works consistently for all users.

## Acceptance Criteria

### AC 1: Report Performance and Consistency

**Given** realistic large datasets and concurrent report usage
**When** users run Trial Balance and General Ledger reports
**Then** report generation meets p95 latency target (< 5s for standard range/profile) and defined success-rate SLO
**And** repeated identical queries return consistent totals and balances

- [ ] Task 1: Profile current report query performance
- [ ] Task 2: Add database indexes for common report filters
- [ ] Task 3: Implement query result caching
- [ ] Task 4: Test with large datasets (100k+ transactions)
- [ ] Task 5: Verify p95 < 5s under load
- [ ] Task 6: Test deterministic results on repeated queries

### AC 2: Error Handling and Safe Retry

**Given** timeout, cancellation, or transient backend failures
**When** report requests fail
**Then** users receive deterministic, non-ambiguous error states with safe retry actions
**And** no partial/corrupt financial output is presented as final

- [ ] Task 1: Implement request timeout handling
- [ ] Task 2: Add cancellation support for long queries
- [ ] Task 3: Create user-friendly error messages
- [ ] Task 4: Implement safe retry with confirmation
- [ ] Task 5: Prevent partial result display
- [ ] Task 6: Test failure scenarios end-to-end

### AC 3: Accessibility Compliance

**Given** report UI and exported interactions are audited for accessibility
**When** keyboard/screen reader users apply filters, run reports, and inspect tables
**Then** interaction patterns, announcements, and contrast meet WCAG 2.1 AA
**And** critical status and validation information is not conveyed by color alone

- [ ] Task 1: Audit report UI with axe-core
- [ ] Task 2: Fix contrast issues (4.5:1 minimum)
- [ ] Task 3: Ensure keyboard navigation for all actions
- [ ] Task 4: Add screen reader announcements
- [ ] Task 5: Test with NVDA/VoiceOver
- [ ] Task 6: Add non-color status indicators

### AC 4: Report Observability

**Given** report observability is enabled
**When** requests execute in production
**Then** telemetry captures latency, error class, dataset size bucket, and retry outcomes per report type
**And** alerts detect sustained degradations before violating report SLO commitments

- [ ] Task 1: Add latency histogram per report type
- [ ] Task 2: Track error class distribution
- [ ] Task 3: Track dataset size buckets
- [ ] Task 4: Track retry success/failure
- [ ] Task 5: Configure SLO alerts
- [ ] Task 6: Create operational dashboards

## Dev Notes

### Performance Budget

| Report | p95 Target | Dataset Size |
|--------|------------|--------------|
| Trial Balance | < 5s | Standard (30-day) |
| General Ledger | < 5s | Standard (30-day) |
| Sales Report | < 3s | Standard (30-day) |

### Error State Design

| Error Type | User Message | Action |
|------------|-------------|--------|
| Timeout | "Report is taking longer than expected. Please try again." | Retry button |
| Backend Error | "Unable to generate report. Our team has been notified." | Contact support |
| Partial Result | Never shown | Always complete or nothing |

### Accessibility Requirements

- All interactive elements keyboard accessible
- Focus visible on all elements
- Screen reader announcements for state changes
- Minimum 4.5:1 contrast ratio
- Error messages not color-only
- Skip links for report tables
- Proper table headers with scope

### Dependencies

- Report APIs (existing)
- Database indexes
- OpenTelemetry
- axe-core/testing

### Test Approach

1. **Performance Tests:** Load test with realistic data
2. **Error Tests:** Simulate failures, verify UX
3. **Accessibility Tests:** axe-core, keyboard, screen reader
4. **Observability Tests:** Verify metrics emitted

### References

- Epic: `_bmad-output/planning-artifacts/epics-split/epic-11-operational-trust-and-scale-readiness.md`
- WCAG 2.1 AA: https://www.w3.org/WAI/WCAG21/quickref/

### Related Stories

- Story 11.1: Reliability Baseline and SLO Instrumentation
- Story 11.4: Posting Correctness and Reconciliation Guardrails

---

## Dev Agent Record

*To be completed when story is implemented.*
