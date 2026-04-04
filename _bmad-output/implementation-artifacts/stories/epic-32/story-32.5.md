# Story 32.5: Roll-Forward Workspace UI

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-32.5 |
| Title | Roll-Forward Workspace UI |
| Status | pending |
| Type | Feature |
| Sprint | 1 of 1 |
| Priority | P2 |
| Estimate | 5h |

---

## Story

As an Accountant,
I want an interactive workspace for period close that shows me the full close checklist in one view,
So that I can methodically work through close steps without switching between screens.

---

## Background

The individual features (fiscal year close, trial balance, reconciliation, audit trail) are built in Stories 32.1–32.4. This story combines them into an interactive workspace — a single-page dashboard or TUI that guides the accountant through the close process step by step.

---

## Acceptance Criteria

1. Workspace shows current period status and next steps
2. Interactive checklist:
   - [ ] All variance variances resolved (Stories 32.2, 32.3)
   - [ ] Trial balance balanced (Story 32.3)
   - [ ] No GL imbalances (Story 32.3)
   - [ ] All journal entries posted and approved
   - [ ] Fiscal year close approved (Story 32.1)
   - [ ] Audit trail recorded (Story 32.4)
3. Each checklist item links to relevant detail view/report
4. Progress indicator (X of Y steps complete)
5. Cannot proceed to close until all prerequisites pass
6. Workspace accessible via `GET /admin/dashboards/period-close-workspace`
7. Tenant-scoped: `company_id` filter enforced
8. `npm run typecheck -w @jurnapod/api` passes
9. `npm run build -w @jurnapod/api` passes

---

## Technical Notes

### Workspace Data

```typescript
interface PeriodCloseWorkspace {
  fiscal_year_id: number;
  current_period: number;
  status: 'OPEN' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'CLOSED';
  checklist: {
    id: string;
    label: string;
    status: 'pending' | 'passed' | 'failed' | 'skipped';
    detail_url: string;
    error_message?: string;
  }[];
  completed_steps: number;
  total_steps: number;
}
```

### Checklist Items (from Stories 32.1–32.4)

1. Reconciliation complete (Story 32.2)
2. Trial balance validated (Story 32.3)
3. No GL imbalances (Story 32.3)
4. All variance under threshold (Story 32.3)
5. Period transition audit recorded (Story 32.4)
6. Fiscal year close approved (Story 32.1)

---

## Tasks

- [ ] Design workspace data structure
- [ ] Build `GET /admin/dashboards/period-close-workspace` endpoint
- [ ] Implement checklist evaluation (each step checked live)
- [ ] Add detail links for each failed checklist item
- [ ] Add progress tracking
- [ ] Integration tests
- [ ] Run typecheck + build

---

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```
