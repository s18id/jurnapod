# story-25.2.completion.md: Extract domain model/types/errors/helpers to treasury

## Status

**DONE** (approved by bmad-agent-review)

## Files Created/Modified

- **Created:** `packages/modules/treasury/src/types.ts`
  - Extracted domain types: `CashBankType`, `CashBankStatus`, `CashBankTransaction`, `AccountClass`, `AccountInfo`
  - Added service-layer types: `CreateCashBankInput`, `CashBankListFilters`

- **Created:** `packages/modules/treasury/src/errors.ts`
  - Extracted errors: `CashBankValidationError`, `CashBankStatusError`, `CashBankNotFoundError`, `CashBankForbiddenError`

- **Created:** `packages/modules/treasury/src/helpers.ts`
  - Extracted pure helpers: `toMinorUnits`, `normalizeMoney`, `isCashBankTypeName`, `classifyCashBankAccount`, `validateDirectionByTransactionType`

- **Modified:** `packages/modules/treasury/src/index.ts`
  - Re-exported types/errors/helpers and shared cash-bank enum schemas

- **Modified:** `_bmad-output/implementation-artifacts/stories/epic-25/story-25.2.md`
  - Acceptance criteria checked
  - Dev Agent Record included
  - Final status set to DONE

- **Modified:** `_bmad-output/implementation-artifacts/sprint-status.yaml`
  - `25-2-extract-domain-types-errors-helpers: done`

## Validation Evidence

```bash
npm run typecheck -w @jurnapod/modules-treasury  # PASS
npm run build -w @jurnapod/modules-treasury      # PASS
npm run typecheck -w @jurnapod/api               # PASS
```

## Review Outcome

- **Reviewer:** bmad-agent-review
- **Verdict:** APPROVED
- **Blockers:** None (no P0/P1)
- **Follow-up notes:** P2/P3 documentation/style observations only; non-blocking for closure.
