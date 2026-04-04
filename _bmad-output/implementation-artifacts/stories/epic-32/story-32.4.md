# Story 32.4: Period Transition Audit Trail

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-32.4 |
| Title | Period Transition Audit Trail |
| Status | pending |
| Type | Feature |
| Sprint | 1 of 1 |
| Priority | P2 |
| Estimate | 3h |

---

## Story

As a Compliance Officer,
I want a complete audit trail of period transitions,
So that I can answer "who closed period 3, when, and what changed" for audit inquiries.

---

## Background

When a period transitions (e.g., `OPEN` → `ADJUSTED` → `CLOSED`), the system must record who initiated it, when, what the prior/new state was, and any related journal entries created. This audit trail is required for financial compliance.

---

## Acceptance Criteria

1. Every period status transition is recorded in `audit_logs` with:
   - `actor_user_id` — who made the change
   - `company_id` — tenant context
   - `action` — e.g., `PERIOD_CLOSE`, `PERIOD_REOPEN`, `PERIOD_ADJUST`
   - `prior_state`, `new_state` — period status before/after
   - `metadata` — JSON with journal entry IDs, notes, etc.
2. Audit log queryable by fiscal year, period, action type, actor, date range
3. Cannot delete or modify audit records
4. Period transitions visible in admin dashboard
5. `npm run typecheck -w @jurnapod/api` passes

---

## Technical Notes

### Audit Log Entry Schema

```typescript
interface PeriodTransitionAudit {
  id: number;
  company_id: number;
  actor_user_id: number;
  fiscal_year_id: number;
  period_number: number;
  action: 'OPEN' | 'ADJUSTED' | 'CLOSED' | 'REOPENED';
  prior_state: string;
  new_state: string;
  metadata: Record<string, unknown>; // journal_entry_ids, notes, etc.
  created_at: Date;
}
```

### Filtering Rules

- `audit_logs.success` filtering only (not `result`)
- All queries enforce `company_id`
- Date range filtering for compliance reports

---

## Tasks

- [ ] Design audit log schema for period transitions
- [ ] Add migration for `period_transition_audit` table (if needed)
- [ ] Implement audit logging in period transition functions
- [ ] Add query endpoint: `GET /audit/period-transitions`
- [ ] Add filters: by fiscal year, period, actor, action, date range
- [ ] Enforce immutability (no update/delete)
- [ ] Integration tests

---

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```
