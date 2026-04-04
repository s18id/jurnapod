# Story 32.5: Roll-Forward Workspace UI

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-32.5 |
| Title | Roll-Forward Workspace UI |
| Status | pending |
| Type | Feature |
| Sprint | 2 of 2 |
| Priority | P1 |
| Estimate | 16h |

---

## Story

As an Accountant,
I want an interactive workspace for period close that shows me the full close checklist in one view,
So that I can methodically work through close steps without switching between screens.

---

## Background

The workspace depends on all upstream components: close engine (32.1), reconciliation contract/view (32.2), validation checklist (32.3), and immutable transition audit (32.4). This story combines them into an operational workspace that guides the accountant through close with hard progression gates.

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
8. Approval action uses idempotency key and reflects latest lock/audit state from 32.1 + 32.4
9. `npm run typecheck -w @jurnapod/api` passes
10. `npm run build -w @jurnapod/api` passes

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

### Integration Contract

- Consume reconciliation contract outputs from 32.2 (GL-vs-subledger variance by account family)
- Consume trial-balance/pre-close checklist outputs from 32.3
- Surface latest transition events from 32.4 audit timeline
- Close approval actions must pass through 32.1 idempotent approval endpoint

---

## Tasks

- [ ] Design workspace data structure
- [ ] Build `GET /admin/dashboards/period-close-workspace` endpoint
- [ ] Implement checklist evaluation (each step checked live)
- [ ] Add detail links for each failed checklist item
- [ ] Add progress tracking
- [ ] Wire idempotent approval action with retry-safe UX
- [ ] Integration tests
- [ ] Run typecheck + build

---

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

---

## Dependencies

- Story 32.1 (Fiscal year close procedure)
- Story 32.2 (Multi-period reconciliation dashboard)
- Story 32.3 (Trial balance validation with variance reporting)
- Story 32.4 (Period transition audit trail)
