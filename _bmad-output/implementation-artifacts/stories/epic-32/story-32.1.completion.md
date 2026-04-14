# Story 32.1: Fiscal Year Close Procedure — Completion Notes

**Story:** story-32.1  
**Title:** Fiscal Year Close Procedure  
**Completed:** 2026-04-05  
**Commit:** f3990b8

---

## Acceptance Criteria Status

| # | Criteria | Status | Evidence |
|---|----------|--------|----------|
| 1 | All periods in year must be CLOSED/ADJUSTED | ✅ Done | Close procedure checks period status before proceeding |
| 2 | Locked fiscal year rejects new journals | ✅ Done | `FiscalYearClosedError` thrown by `JournalsService.ensureFiscalYearIsOpen()` |
| 3 | Closing entries require manual approval | ✅ Done | Two-step flow: `/close/initiate` + `/close/approve` |
| 4 | Period status transitions: OPEN → ADJUSTED → CLOSED | ✅ Done | State machine implemented in data model |
| 5 | Cannot reopen CLOSED period without audit | ✅ Done | Business rule enforced in close procedure |
| 6 | Typecheck passes | ✅ Done | `npm run typecheck -w @jurnapod/api` passes |
| 7 | Build passes | ✅ Done | `npm run build -w @jurnapod/api` passes |

---

## Implementation Summary

### APIs Implemented

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/fiscal-years/{id}/close` | POST | Initiate close procedure (idempotent) |
| `/fiscal-years/{id}/close-preview` | GET | Preview closing entries before approval |
| `/fiscal-years/{id}/close/approve` | POST | Approve and post closing entries |
| `/fiscal-years/{id}/status` | GET | Current status and period states |

### Closing Entry Process (3-step)

1. **Close income accounts** — Dr [income accounts] for their balance
2. **Close expense accounts** — Cr [expense accounts] for their balance
3. **Transfer to Retained Earnings** — Net income: Cr RE; Net loss: Dr RE

### Key Technical Decisions

1. **Atomic transaction** — All operations wrapped in single transaction
2. **Idempotency** — `fiscal_year_close_requests` table with unique constraint
3. **GL imbalance check** — Runs after posting closing entries
4. **Period lock** — `FiscalYearClosedError` thrown for closed years

### Bug Fixes (pre-commit review)

- Closing entry signs corrected (net income/loss transfer direction)
- Transaction boundary wrapped for atomicity
- Balance check tolerance tightened to 0.001

---

## Files Modified/Created

| File | Change |
|------|--------|
| `apps/api/src/routes/accounts.ts` | Close/approve endpoints |
| `apps/api/src/routes/fiscal-year-close.test.ts` | Integration tests |
| `apps/api/src/lib/fiscal-years.ts` | Close procedure logic |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Status updated |

---

## Definition of Done Checklist

- [x] All Acceptance Criteria implemented with evidence
- [x] No breaking changes without cross-package alignment
- [x] Unit tests written and passing
- [x] Integration tests for API boundaries
- [x] Database pool cleanup hooks present
- [x] `npm run typecheck -w @jurnapod/api` passes
- [x] `npm run build -w @jurnapod/api` passes
- [x] Code review completed with no blockers
- [x] AI review conducted (bmad-agent-review)

---

## Notes

- Story 32.1 and 32.2 implemented in parallel with coordination file
- All P0/P1 bugs fixed before commit
- Re-reviewed after fixes, approved for commit
