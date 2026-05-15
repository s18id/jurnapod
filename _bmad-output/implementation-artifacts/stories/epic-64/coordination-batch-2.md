# Epic 64 — Batch 2 Coordination

## Objective
Execute Batch 2 stories (64.4–64.7) with explicit file ownership and consolidated verification.

Stories in scope:
- 64.4 trial-balance-service-export
- 64.5 ap-reconciliation-service-export
- 64.6 ar-reconciliation-service-export
- 64.7 cash-bank-service-export

## Global Rules
- Implementers MUST NOT update `sprint-status.yaml` directly during implementation.
- Implementers MUST keep changes scoped to story-owned files.
- Implementers MUST run focused tests using background nohup + PID workflow.
- Package changes MUST build owner package before dependent validations.

## File Ownership Matrix

| Story Group | Owner Agent | Exclusive Files |
|---|---|---|
| 64.4 + 64.5 + 64.6 | @bmad-dev (A) | `packages/modules/accounting/src/index.ts`, `apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts`, `apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts`, `apps/api/__test__/integration/reporting/sales-revenue-projection-reconciliation.test.ts`, `apps/api/__test__/integration/reporting/ar-aging-projection-reconciliation.test.ts` |
| 64.7 | @bmad-dev (B) | `packages/modules/treasury/src/index.ts`, `apps/api/__test__/integration/reporting/cash-flow-consistency-reconciliation.test.ts`, `apps/api/__test__/integration/reporting/treasury-balance-projection-reconciliation.test.ts` |

## Validation Expectations
- 64.4/64.5/64.6:
  - `npm run build -w @jurnapod/modules-accounting`
  - focused API tests for each reporting reconciliation file
  - grep checks to ensure no inline verification SQL remains in target files
- 64.7:
  - `npm run build -w @jurnapod/modules-treasury`
  - focused API tests for cash-flow + treasury-balance reconciliation files
  - grep checks to ensure no inline verification SQL remains in target files

## Integration Notes
- Consolidated review runs once both owners complete.
- Story 64.9 remains out of scope for this coordination file.
