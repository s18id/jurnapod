# Story 32.1: Fiscal Year Close Procedure

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-32.1 |
| Title | Fiscal Year Close Procedure |
| Status | pending |
| Type | Feature |
| Sprint | 1 of 1 |
| Priority | P1 |
| Estimate | 4h |

---

## Story

As an Accountant,
I want to close a fiscal year with a defined procedure that locks periods and records audit information,
So that financial data is finalized for reporting and compliance.

---

## Background

Jurnapod has `fiscal-years.ts` in API lib and `modules-accounting` has fiscal year services. This story adds the close procedure: locking all periods in a fiscal year, enforcing closing sequence (all prior periods must be closed), and generating closing journal entries (for income/expense accounts) that require manual approval.

---

## Acceptance Criteria

1. Fiscal year close requires all periods in the year to be in `CLOSED` or `ADJUSTED` status
2. Locked fiscal year cannot accept new journal postings
3. Closing entries (income/expense → retained earnings) generated but require manual approval
4. Period status transitions: `OPEN` → `ADJUSTED` → `CLOSED`
5. Cannot reopen a `CLOSED` period without special audit procedure
6. `npm run typecheck -w @jurnapod/api` passes
7. `npm run build -w @jurnapod/api` passes

---

## Technical Notes

### Fiscal Year State Machine

```
OPEN → ADJUSTED → CLOSED
  ↑__________________|
   (reopen with audit trail)
```

### Closing Entry Formula

```
Dr Income Summary (or P&L Summary)   XXX
  Cr Retained Earnings                       XXX

Dr Retained Earnings                       XXX
  Cr Expense Summary (if expenses > income) XXX
```

### Key APIs

- `POST /fiscal-years/{id}/close` — initiate close procedure
- `GET /fiscal-years/{id}/close-preview` — preview closing entries before approval
- `POST /fiscal-years/{id}/close/approve` — approve and post closing entries
- `GET /fiscal-years/{id}/status` — current status and period states

### Architecture Rules

- All operations enforce `company_id`
- Closing entries are journal postings — go through `modules-accounting` posting flow
- NO MOCK DB for DB-backed business logic tests
- GL imbalance check (`gl_imbalance_detected_total`) runs after closing entries

---

## Tasks

- [ ] Read existing `fiscal-years.ts` and `modules-accounting` fiscal year services
- [ ] Design fiscal year close state machine
- [ ] Implement close preview (what entries would be created)
- [ ] Implement close approval (creates journal entries)
- [ ] Add period status transition validation
- [ ] Add period lock enforcement in journal posting
- [ ] Integration tests with real DB

---

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```
