# Epic 30 Sprint Plan

## Overview

**Epic:** Sync & Financial Observability
**Duration:** 1 sprint
**Goal:** Establish production observability with SLOs, metrics, alerting, and dashboards.

## Story Dependencies

```
30.1 (SLOs + metrics schema)
  └── 30.2 (outbox health) ── parallel with 30.3
        └── 30.4 (alerting) ── sequential
              └── 30.5 (dashboards + runbook) ── sequential
```

## Sprint Breakdown

### Story 30.1: Define Sync SLOs and metrics schema
- **Estimate:** 2h
- **Priority:** P1
- **Dependencies:** None
- **Focus:** Define metrics schema, SLO thresholds in config

### Story 30.2: Implement outbox health metrics
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 30.1
- **Focus:** Track lag, retry depth, failure rate, duplicate suppression

### Story 30.3: Financial posting monitoring
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 30.1 (after schema)
- **Focus:** Track journal posting success/failure, GL imbalance detection

### Story 30.4: Alerting infrastructure
- **Estimate:** 3h
- **Priority:** P1
- **Dependencies:** 30.2 + 30.3
- **Focus:** Configure alerts for SLO breaches, invariant violations

### Story 30.5: Dashboards and runbook
- **Estimate:** 2h
- **Priority:** P2
- **Dependencies:** 30.4
- **Focus:** Operational dashboards, runbook documentation

## Key Risks & Decisions

| # | Risk | Decision |
|---|------|----------|
| 1 | Metrics storage | Use in-memory + periodic flush to DB (not real-time streaming) |
| 2 | Alert channels | Support Slack initially, PagerDuty as future option |
| 3 | Dashboard complexity | Start with built-in dashboard, Grafana as future option |

## Validation Commands

### Story 30.1
```bash
npm run typecheck -w @jurnapod/api
```

### Story 30.2
```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

### Story 30.3
```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

### Story 30.4
```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

### Story 30.5
```bash
npm run typecheck --workspaces --if-present
npm run build --workspaces --if-present
```
