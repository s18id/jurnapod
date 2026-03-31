# Epic 16: Alert System Hardening & Batch Processing

**Status:** Draft - Pending Review
**Theme:** Address TD-031 (alert retry logic) and TD-032 (batch processing backfills)
**Epic Number:** 16
**Dependencies:** Epic 15 (in progress)
**Estimated Duration:** ~6 hours (1-2 days)

---

## Summary

Epic 16 addresses two remaining P2 technical debt items from Epic 8: alert retry logic and batch processing backfills.

## Context

### Why This Epic

1. **TD-031 (P2) - Alert Retry Logic**: Webhook dispatch currently lacks exponential backoff. This can cause alert storms and missed notifications during temporary failures.

2. **TD-032 (P2) - Batch Processing Backfills**: Large table backfills can cause lock contention. Batching would reduce impact on production traffic.

## Goals

1. Implement exponential backoff for alert/webhook delivery
2. Add batch processing capability for large backfill operations
3. Maintain production stability during batch operations

## Stories

| Story | Title | Priority | Est |
|-------|-------|----------|-----|
| 16.1 | Alert Retry with Exponential Backoff | P2 | 3h |
| 16.2 | Batch Processing for Backfills | P2 | 2h |
| 16.3 | Epic 16 Documentation | P2 | 1h |

**Total Estimated:** ~6 hours

---

## Technical Debt to Address

| ID | Description | Priority | Status |
|----|-------------|----------|--------|
| TD-031 | Alert retry logic - webhook dispatch lacks exponential backoff | P2 | Open |
| TD-032 | Batch processing - large table backfills could be batched | P2 | Open |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Epic 15 | In Progress | Foundation work must complete first |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Alert retry changes affect existing notification behavior | Backward-compatible configuration |
| Batch processing changes impact import/export | Careful testing with production-like data volumes |

---

## Out of Scope

- TD-030 (already resolved in Epic 15)
- Real-time alert system redesign
- Distributed batch processing across instances

---

*Epic 16 draft - subject to refinement during Epic 15 retrospective.*