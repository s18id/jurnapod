# Story 30.7: Wire GL Imbalance Detection and Tenant Safety

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-30.7 |
| Title | Wire GL imbalance detection and enforce tenant safety |
| Status | done |
| Type | Bug Fix |
| Sprint | 1 of 1 (remediation) |
| Priority | P1 |

---

## Story

As an Operations Engineer,
I want GL imbalance monitoring operationalized and tenant-safe observability,
So that financial invariants are monitored and tenant data is properly isolated.

---

## Architect Findings

### P1 Issue: GL Imbalance Not Wired

**Problem:** `checkGlImbalance()` / `findAllGlImbalances()` exist but no runtime path calls them to increment `gl_imbalance_detected_total`.

**Affected Files:**
- `packages/modules/accounting/src/journals-service.ts` - methods exist
- `journalMetrics.recordGlImbalance()` exists but not called

### P1 Issue: Tenant Isolation in Observability

**Problem:** Dashboards query global Prometheus registry and aggregate all label series with no `company_id` filter. Metrics don't include tenant labels.

**Affected Files:**
- `apps/api/src/lib/metrics/dashboard-metrics.ts` - reads global register
- `apps/api/src/lib/metrics/outbox-metrics.ts` - no company labels
- `apps/api/src/lib/metrics/journal-metrics.ts` - no tenant labels

---

## Acceptance Criteria

1. GL imbalance check wired into posting boundary or periodic monitoring job
2. `gl_imbalance_detected_total` incremented when imbalance found
3. Tenant-scoped metrics include `company_id` label
4. Dashboard queries filter by authenticated tenant context

---

## Tasks

- [x] Wire GL imbalance check into posting boundary or create periodic monitoring job
- [x] Ensure `gl_imbalance_detected_total` increments correctly
- [x] Add `company_id` label to tenant-scoped metrics (outbox, journal)
- [x] Update dashboard queries to filter by authenticated tenant
- [x] Validate with typecheck and build

---

## Dev Notes

**GL Imbalance Wiring Options:**
1. Call `checkGlImbalance()` at end of journal batch creation
2. Create periodic background job to scan recent batches

**Tenant Label Approach:**
```typescript
// Add company_id to metric labels
const outboxMetrics = new Gauge({
  name: 'outbox_lag_items',
  help: 'Outbox lag items',
  labelNames: ['company_id', 'outlet_id']
});
```

**Dashboard Tenant Filtering:**
```typescript
// Filter by authenticated company
const companyId = c.get('companyId');
const metrics = await getMetrics({ companyId });
```

---

## Completion Notes

- GL imbalance detection wired in sync push posting flow and increments `gl_imbalance_detected_total` on detected imbalance.
- Tenant labels (`company_id`) added to outbox/journal tenant-scoped metrics with explicit number→string conversion for Prometheus labels.
- Dashboard snapshot queries now filter by authenticated `companyId` for outbox and journal health views.
- API typecheck/build validations passed after wiring.
