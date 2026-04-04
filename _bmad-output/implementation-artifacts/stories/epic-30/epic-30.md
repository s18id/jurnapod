# Epic 30: Sync & Financial Observability

**Status:** ✅ Complete
**Date:** 2026-04-04
**Completed:** 2026-04-04
**Stories:** 5 total
**Sprint Plan:** `_bmad-output/planning-artifacts/epic-30-sprint-plan.md`

---

## Executive Summary

Epic 30 establishes production observability for the Jurnapod ERP, implementing SLOs and monitoring for sync operations and financial posting. After completing the API Detachment series (Epics 23-29), this epic adds operational visibility to measure and alert on system health.

**Key Goals:**
- Define and measure Sync SLOs (latency, success rate, duplicate suppression)
- Monitor financial posting correctness (journal imbalances, missing postings)
- Alert on invariant drift before it becomes incidents
- Enable data-driven operational decisions

---

## Goals & Non-Goals

### Goals
- Define Sync SLOs with measurable thresholds
- Implement outbox health monitoring (lag, retry depth, failure rate)
- Track `client_tx_id` duplicate suppression metrics
- Monitor journal posting success/failure by domain
- Detect GL imbalances and missing journal entries
- Create alerting for critical invariant violations
- Build lightweight operational dashboards

### Non-Goals
- No new business logic or feature development
- No schema changes
- No POS app changes
- No full-featured enterprise monitoring (lightweight approach initially)
- No real-time streaming analytics

---

## Architecture

### Monitoring Stack (Proposed)

```
┌─────────────────────────────────────────────────────────────┐
│                    Monitoring Architecture                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐      │
│  │  POS     │───▶│  API     │───▶│  Metrics        │      │
│  │  Client  │    │  Server  │    │  Collector      │      │
│  └──────────┘    └──────────┘    └────────┬────────┘      │
│                                              │               │
│                                              ▼               │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐      │
│  │ Outbox   │───▶│ Sync     │───▶│  Alerting        │      │
│  │ Queue    │    │ Service  │    │  Engine         │      │
│  └──────────┘    └──────────┘    └────────┬────────┘      │
│                                              │               │
│                                              ▼               │
│                                    ┌──────────────────┐      │
│                                    │  Dashboards      │      │
│                                    │  (Grafana/Builtin)│      │
│                                    └──────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Metrics to Track

| Category | Metric | SLO Target |
|----------|--------|------------|
| **Sync Latency** | Push/Pull latency p50/p95/p99 | < 500ms / < 2s |
| **Sync Reliability** | Success rate | > 99.5% |
| **Duplicate Suppression** | `client_tx_id` duplicate rate | < 0.1% |
| **Outbox Health** | Lag (items pending) | < 100 |
| **Outbox Health** | Retry depth | < 3 |
| **Outbox Health** | Failure rate | < 0.5% |
| **Journal Posting** | Success rate by domain | > 99.9% |
| **Journal Posting** | GL balance errors | 0 |
| **Journal Posting** | Missing journal alerts | 0 |

---

## Success Criteria

- [x] Sync SLOs defined with thresholds in configuration
- [x] Outbox health metrics exposed via `/metrics` endpoint
- [x] Duplicate suppression rate tracked and reported
- [x] Journal posting success/failure tracked by domain
- [x] GL imbalance detection implemented
- [x] Alerts configured for SLO breaches
- [x] Dashboards displaying sync and financial health
- [x] Runbook documentation for common alert responses

---

## Stories

| # | Title | Status |
|---|-------|--------|
| [story-30.1](./story-30.1.md) | Define Sync SLOs and metrics schema | ✅ Done |
| [story-30.2](./story-30.2.md) | Implement outbox health metrics | ✅ Done |
| [story-30.3](./story-30.3.md) | Financial posting monitoring | ✅ Done |
| [story-30.4](./story-30.4.md) | Alerting infrastructure | ✅ Done |
| [story-30.5](./story-30.5.md) | Dashboards and runbook | ✅ Done |

## Remediation Stories (Post-Review)

| # | Title | Priority | Status |
|---|-------|----------|--------|
| [story-30.6](./story-30.6.md) | Fix metric contracts and alert semantics | P1 | ✅ Done |
| [story-30.7](./story-30.7.md) | Wire GL imbalance detection and tenant safety | P1 | ✅ Done |
