# Story 69-2-d Readiness Coordination

**Story:** 69-2-d AP Payments + Supplier Credits  
**Created:** 2026-05-19  
**Purpose:** Coordinate parallel readiness review for Architecture and QA before implementation begins.

## Scope

Review `_bmad-output/implementation-artifacts/stories/epic-69/story-69-2-d.md` against existing payment and credit API contracts:

- `apps/api/src/routes/purchasing/ap-payments.ts`
- `apps/api/src/routes/purchasing/purchase-credits.ts`
- `packages/shared/src/schemas/purchasing.ts`
- `packages/shared/src/constants/purchasing.ts`
- `packages/modules/purchasing/src/types/ap-payment.ts`
- `packages/modules/purchasing/src/types/purchase-credit.ts`
- Existing tests under `apps/api/__test__/integration/purchasing/`

## Coordination Rules

- Reviewers MUST NOT edit files.
- Report P0/P1/P2/P3 findings with file and line references.
- Identify whether Story 69-2-d is ready for implementation or requires story correction first.
- Implementation MUST NOT begin until Architecture readiness GO, QA kickoff GO, and Ahmad explicit 69-2-d backoffice unfreeze confirmation are recorded.

## Known Initial Observations For Verification

- Payment collection key appears to be `payments`.
- Credit collection key appears to be `credits`.
- Payment statuses appear to be `DRAFT`, `POSTED`, `VOID`.
- Credit statuses appear to be `DRAFT`, `PARTIAL`, `APPLIED`, `VOID`.
- Payment post response appears partial: `{ id, journal_batch_id }`.
- Payment void response appears partial: `{ id, reversal_batch_id }`.
- Credit apply response appears partial: `{ id, journal_batch_id, applied_amount, remaining_amount, status }`.
- Credit void response appears partial: `{ id, reversal_batch_id }` where `reversal_batch_id` MAY be null.
- Current routes use `UPDATE` permission for payment void and credit void; story AC6 must align or explicitly require API correction.
- Current list routes use shared schemas that transform date-only strings with native `new Date(...)`; reviewers MUST classify whether this is acceptable legacy boundary behavior or requires story hardening before UI date filters are exposed.
