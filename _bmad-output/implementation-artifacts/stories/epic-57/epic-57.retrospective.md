# Epic 57 Retrospective — 2026-05-06

**Epic:** 57 — AR + Treasury Correctness
**Sprint:** 57
**Date:** 2026-05-06
**Facilitator:** Bob (Scrum Master)
**Participants:** Ahmad (Project Lead), Alice (Product Owner), Charlie (Senior Dev), Dana (QA Engineer), Elena (Junior Dev)

---

## Deliverables Summary

| Story | Title | Status | Key Deliverable |
|-------|-------|--------|-----------------|
| 57.1 | AR Snapshot/Trigger Compatibility | ✅ done | Trigger 0201 verified for AR archive path; 8/8 ACs pass |
| 57.2 | AR Invoice + Payment Posting Correctness | ✅ done | Balanced journal entries; idempotency via `client_ref`; 10/10 ACs pass |
| 57.3 | AR Credits/Void/Refund Invariants | ✅ done | `CreditNotePostingHook`; AP archive transition; 11/11 ACs pass |
| 57.4 | Treasury Handoff + Reconciliation Correctness | ✅ done | Account validation → 400; 9/9 ACs pass |

**Totals:** 4/4 stories ✅ | 38/38 ACs ✅ | 45 integration tests passing ✅

---

## What Went Well

1. **Early contract clarity (Option A decision)** — `payment.account_id` as treasury handoff field, no `treasury_bank_account_id` introduced. Decision made at Story 57.4 kickoff, not during implementation. Avoided mid-sprint rework.

2. **Pattern reuse — `CreditNotePostingHook`** — Interface in `packages/modules/sales`, adapter in `apps/api/src/lib/modules-sales/`, called inside `postCreditNote()` transaction. Same structure as `InvoicePostingHook`/`PaymentPostingHook` from Story 57.2. Three stories now establish this as a canonical pattern.

3. **Full-fixture canonical path** — Every test in 57.1–57.4 used production package flows. No ad-hoc SQL in test setup. `createTestBankAccount()` from test-fixtures used for treasury accounts. Tests readable and maintainable.

4. **Trigger compatibility spike first** — Story 57.1 verified trigger 0201 doesn't block AR snapshot archive path before Stories 57.2–57.4 started. De-risked the entire epic.

5. **AGENTS.md §C respected** — No new business DB triggers introduced. Archive transition implemented in application code.

6. **Error mapping hardening** — All domain error types mapped to appropriate HTTP status codes across AR routes. Defensive string-match fallbacks documented.

---

## What Could Be Improved

1. **Cross-module `instanceof` failure pattern discovered late** — `DatabaseReferenceError` from `ensureAccountIsTarget()` in `modules-sales` failed `instanceof DatabaseReferenceError` check in API route due to cross-bundle module duplication. Found in CI, not in unit tests. Fix was correct but detection timing was suboptimal. Requires earlier verification in story kickoff.

2. **Concurrent payment posting deadlock (known limitation)** — Test for AC4 fell back to concurrent draft creation + sequential posting. True concurrent posting can deadlock under current lock behavior. Gap documented as NOTE in test. No plan to address yet — needs sizing.

3. **Decision rationale should live in story specs** — Option A contract was settled in kickoff but the rationale lived in Slack/PR comments, not in the story spec. Future maintainers won't know why `account_id` was chosen over `treasury_bank_account_id`.

---

## Carry-Forward Commitments to Epic 58

| # | Commitment | Rationale |
|---|------------|-----------|
| 1 | Upfront contract resolution at kickoff — ambiguous architectural decisions settled before implementation | Option A decision in 57.4 proved value of early clarity |
| 2 | `CreditNotePostingHook` as canonical template — three stories established the pattern | Reuse, not reinvention; Epic 58 should start with this as given |
| 3 | Full-fixture canonical path mandatory — no ad-hoc SQL test setup | Production invariants = test invariants |
| 4 | Trigger/compatibility spike first — verify assumptions about existing DB objects before designing around them | Trigger 0201 check saved potential rework |
| 5 | `ensureAccountIsTarget()` message-based fallback documented as intentional cross-module error handling pattern | Prevents future confusion about why fallback exists |

---

## Action Items (MAX 2 — per AGENTS.md §E46-A2)

| ID | Action | Owner | Deadline | Success Criterion |
|----|--------|-------|----------|-------------------|
| **E57-A1** | Add cross-module error boundary verification step to story kickoff checklist | Bob (process owner) + Charlie (content author) | End of Epic 58 kickoff | Story spec template updated with step; step used in ≥1 Epic 58 story kickoff |
| **E57-A2** | Spike concurrent posting deadlock: investigate lock behavior, size the fix | Elena (Junior Dev) | Before Epic 58 mid-sprint review | Spike complete with options: (a) fix is <1 sprint → goes into Epic 58 scope, OR (b) fix is >1 sprint → deferred to backlog with estimated effort |

---

## Documentation Debt (Not a Sprint Action)

| Item | Owner | Rationale |
|------|-------|-----------|
| AP archive idempotency inline comment | Charlie | Re-archiving already-ARCHIVED snapshot is a no-op by design; future devs need to understand why without reading the full transaction logic |

---

## Retrospective Health

- **Psychological safety:** ✅ No blame, systems focus, specific examples cited
- **Action item discipline:** ✅ Exactly 2 items, each with owner + deadline + success criterion
- **Carry-forward utility:** ✅ 5 concrete commitments, each with rationale
- **Discussion depth:** ✅ All three improvement areas explored with team input

---

**Epic 57 Retrospective: CLOSED**
Next: Epic 58 Kickoff

(End of file — total 124 lines)