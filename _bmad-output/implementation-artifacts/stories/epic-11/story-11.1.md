# Story 11.1: Reliability Baseline and SLO Instrumentation

Status: backlog

## Story

As an engineering lead,
I want baseline metrics and SLO definitions for critical flows,
So that hardening work is measurable and regressions are visible.

## Acceptance Criteria

### AC 1: Critical Flow SLO Definitions

**Given** critical flows are defined (`payment_capture`, `offline_local_commit`, `sync_replay_idempotency`, `pos_to_gl_posting`, `trial_balance`, `general_ledger`)
**When** SLOs are ratified
**Then** each flow has explicit SLI definitions, targets, and measurement windows (e.g., 28-day rolling)
**And** targets align to product NFRs (POS p95 < 1s, sync completion < 30s, report p95 < 5s, business-hours availability >= 99.9%)

- [ ] Task 1: Document all critical flows with owners
- [ ] Task 2: Define SLI for each flow (what is measured)
- [ ] Task 3: Set SLO targets aligned to NFRs
- [ ] Task 4: Configure 28-day rolling measurement windows
- [ ] Task 5: Get stakeholder ratification on targets

### AC 2: Instrumentation Implementation

**Given** instrumentation is implemented
**When** requests/jobs execute
**Then** structured logs, metrics, and distributed traces include correlation IDs (`request_id`, `client_tx_id`, `journal_batch_id` where applicable)
**And** cardinality-safe labels include `company_id`/`outlet_id` scope without leaking PII

- [ ] Task 1: Add correlation ID propagation middleware
- [ ] Task 2: Implement structured logging (pino/similar)
- [ ] Task 3: Add OpenTelemetry traces for critical paths
- [ ] Task 4: Ensure company_id/outlet_id labels (no PII)
- [ ] Task 5: Verify no high-cardinality labels added

### AC 3: Dashboards and Alerts

**Given** dashboards and alerts are configured
**When** SLI burn rate or error budget thresholds are breached
**Then** actionable alerts fire with flow name, symptom class, and runbook link
**And** alert noise controls (dedup/suppression windows) are defined

- [ ] Task 1: Create Grafana dashboards per flow
- [ ] Task 2: Configure error budget alerts
- [ ] Task 3: Add runbook links to alerts
- [ ] Task 4: Configure dedup windows (e.g., 5m, 30m, 1h)
- [ ] Task 5: Test alert delivery and routing

### AC 4: Quality Gates

**Given** a release candidate lacks required telemetry on any critical path
**When** quality gates run
**Then** rollout is blocked until coverage is restored
**And** missing telemetry is reported as a release-blocking defect

- [ ] Task 1: Create telemetry coverage check in CI
- [ ] Task 2: Define minimum coverage thresholds
- [ ] Task 3: Block release on coverage degradation
- [ ] Task 4: Create issue tracker integration for defects

## Dev Notes

### Critical Flows Inventory

| Flow | Owner | SLI | Target |
|------|-------|-----|--------|
| payment_capture | POS Team | p95 latency | < 1s |
| offline_local_commit | POS Team | success rate | >= 99.9% |
| sync_replay_idempotency | Sync Team | duplicate rate | < 0.01% |
| pos_to_gl_posting | GL Team | latency + accuracy | p95 < 5s, 0 drift |
| trial_balance | Reports Team | p95 latency | < 5s |
| general_ledger | Reports Team | p95 latency | < 5s |

### Correlation ID Strategy

```typescript
// Request flow
request_id: UUID v4 (generated at API entry)
  -> client_tx_id: from POS device (for payment/sync)
  -> journal_batch_id: for GL posting flows
  -> trace_id: OpenTelemetry trace (propagated)

Labels (cardinality-safe):
  - company_id
  - outlet_id
  - flow_name
  - status (success/error/timeout)
```

### Dependencies

- OpenTelemetry SDK
- Grafana/Prometheus (metrics)
- PagerDuty/OpsGenie (alerts)
- GitHub Actions (CI quality gates)

### Test Approach

1. **Coverage Test:** Verify all critical paths emit telemetry
2. **Correlation Test:** End-to-end trace with all IDs present
3. **Alert Test:** Trigger test alert, verify delivery
4. **Quality Gate Test:** Block rollout on missing telemetry

### References

- Epic: `_bmad-output/planning-artifacts/epics-split/epic-11-operational-trust-and-scale-readiness.md`
- NFR Source: PRD or Architecture docs

### Related Stories

- Story 11.2: POS Payment and Offline Performance Hardening
- Story 11.3: Sync Idempotency and Retry Resilience Hardening
- Story 11.4: Posting Correctness and Reconciliation Guardrails
- Story 11.5: Reporting Reliability, Performance, and Accessibility Hardening

---

## Dev Agent Record

*To be completed when story is implemented.*
