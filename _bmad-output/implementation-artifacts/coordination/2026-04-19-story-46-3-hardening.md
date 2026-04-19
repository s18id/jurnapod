# Coordination: Story 46.3 Hardening (Parallel Tracks)

## Objective
Bring Story 46.3 to real implementation-complete state by fixing lifecycle/line-update gaps and correcting sprint tracking integrity.

## Parallel Work Batches

### Batch A (metadata/process, independent)
- Fix malformed sprint keys in `sprint-status.yaml`
- Set `46-3-purchase-orders` to `in-progress` during implementation
- Keep `46-2-exchange-rates` as done (already green)

### Batch B (PO route hardening)
- File: `apps/api/src/routes/purchasing/purchase-orders.ts`
- Implement transactional create (header + lines)
- Implement PATCH full-line replacement (recommended contract)
- Recompute `total_amount` from replaced lines
- Add `item_id` existence + tenant validation
- Enforce receipt-aware status transition gates (`RECEIVED` only when all lines received)
- Reduce dead code/duplication where safe

### Batch C (tests)
- File: `apps/api/__test__/integration/purchasing/purchase-orders.test.ts`
- Add/update tests for:
  - PATCH full-line replacement + recompute totals
  - invalid `SENT -> RECEIVED` when incomplete
  - invalid `PARTIAL_RECEIVED -> RECEIVED` when incomplete
  - item validation failure paths
  - create transaction rollback behavior

## Dependency Rules
- Batch A can run anytime.
- Batch C depends on Batch B contract (PATCH behavior).
- Final verification runs after B and C complete.

## Guardrails
- No DB mocks in integration tests.
- Keep tenant scoping (`company_id`) strict.
- Do not weaken ACL checks.
- Do not mark 46.3 done until AC2/AC3/AC5 gaps are validated.
