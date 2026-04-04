# Story 30.5: Dashboards and Runbook

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-30.5 |
| Title | Dashboards and runbook |
| Status | review |
| Type | Documentation |
| Sprint | 1 of 1 |
| Dependencies | 30.4 |
| Priority | P2 |

---

## Story

As an Operations Engineer,
I want operational dashboards and runbooks,
So that I can quickly diagnose issues and follow documented procedures during incidents.

---

## Acceptance Criteria

1. Built-in dashboard showing sync health metrics
2. Built-in dashboard showing financial posting metrics
3. Runbook with response procedures for common alerts
4. Dashboard refreshes automatically with metrics data

---

## Technical Notes

### Dashboard Panels

**Sync Health Dashboard:**
- Sync latency (p50, p95, p99) over time
- Sync success/failure rate over time
- Outbox lag trend
- Duplicate suppression rate

**Financial Health Dashboard:**
- Journal posting success rate by domain
- Posting failures by reason
- GL imbalance count
- Missing journal alert count

### Runbook Sections

```markdown
# Runbook: Sync Issues

## High Outbox Lag
**Symptoms:** outbox_lag_items > 100

**Diagnosis:**
1. Check API server health
2. Check database connectivity
3. Check for deadlocks

**Response:**
1. Scale API servers if needed
2. Restart sync workers
3. Escalate if持续 > 30min

## Duplicate Suppression Spike
**Symptoms:** client_tx_id_duplicates_total > 100 in 5min

**Diagnosis:**
1. Check POS app version
2. Check network retry patterns

**Response:**
1. Verify client_tx_id generation
2. Check for client bugs
```

---

## Tasks

- [x] Create sync health dashboard page
- [x] Create financial posting dashboard page
- [x] Write runbook for top 5 alerts
- [x] Add dashboard to API admin routes
- [x] Validate with typecheck and build

---

## Dev Notes

- Use simple HTML/JSON dashboards initially (no Grafana dependency)
- Runbook can be markdown file served statically
- Dashboard data sourced from `/metrics` endpoint

---

## Dev Agent Record

### Implementation Plan

1. Created `apps/api/src/lib/metrics/dashboard-metrics.ts` with:
   - `getOutboxMetricsSnapshot()` - Captures outbox lag, retry depth, duplicates, failures by reason
   - `getSyncHealthMetricsSnapshot()` - Captures push/pull operations, conflicts, latency percentiles
   - `getJournalHealthMetricsSnapshot()` - Captures journal posting success/failure by domain, GL imbalances, alert status

2. Created `apps/api/src/routes/admin-dashboards.ts` with:
   - `GET /admin/dashboard/sync` - Self-contained HTML dashboard with auto-refresh (30s)
   - `GET /admin/dashboard/financial` - Self-contained HTML dashboard with auto-refresh (30s)
   - Both routes require authentication and settings.read permission

3. Created `apps/api/src/routes/admin-runbook.ts` with:
   - `GET /admin/runbook.md` - Operations runbook as markdown
   - Covers sync issues (High Outbox Lag, Duplicate Suppression, Sync Latency, Sync Failure Rate)
   - Covers financial issues (Journal Failures, GL Imbalance, Missing Journal)
   - Includes general troubleshooting, escalation path, and useful commands

4. Updated `apps/api/src/server.ts` to register new admin routes

5. Created `apps/api/src/lib/metrics/dashboard-metrics.test.ts` with 18 unit tests

### Completion Notes

- ✅ Sync health dashboard at `/admin/dashboard/sync` with:
  - Outbox health metrics (lag items, retry depth, duplicates, failures)
  - Sync operations (push/pull counts, conflicts)
  - Outbox by outlet breakdown
  - Failure breakdown by reason
  - Latency distribution (p50, p95, p99)
- ✅ Financial health dashboard at `/admin/dashboard/financial` with:
  - Journal posting overview (successes, failures, success rate)
  - GL health (imbalances, missing journals, unbalanced batches)
  - Posting by domain with success rates
  - Failures by reason
  - Alert status indicators
- ✅ Runbook accessible at `/admin/runbook.md` with:
  - High Outbox Lag procedures
  - Duplicate Suppression Spike procedures
  - Sync Latency Breach procedures
  - Sync Failure Rate procedures
  - Journal Posting Failures procedures
  - GL Imbalance procedures
  - Missing Journal procedures
  - General troubleshooting guide
  - Escalation path
  - Useful commands
- ✅ Dashboard auto-refresh every 30 seconds via meta refresh
- ✅ TypeScript typecheck passes
- ✅ Build passes
- ✅ 18 unit tests added and passing

### Files Created/Modified

**Created:**
- `apps/api/src/routes/admin-dashboards.ts` - Admin dashboard routes (sync and financial)
- `apps/api/src/routes/admin-runbook.ts` - Admin runbook route
- `apps/api/src/lib/metrics/dashboard-metrics.ts` - Dashboard metrics snapshot functions
- `apps/api/src/lib/metrics/dashboard-metrics.test.ts` - Unit tests for dashboard metrics

**Modified:**
- `apps/api/src/server.ts` - Added imports and route registrations for admin dashboards and runbook

### Change Log

- 2026-04-04: Implemented dashboards and runbook following story spec
