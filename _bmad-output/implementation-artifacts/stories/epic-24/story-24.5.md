# story-24.5: Update sync-push stock handlers

## Description

Update `lib/sync/push/stock.ts` to use the costing package for stock deductions in sync push flow.

## Acceptance Criteria

- [ ] `deductStockWithCost` in sync handler uses costing package
- [ ] Sync push tests pass
- [ ] `client_tx_id` idempotency preserved
- [ ] POS offline-first behavior unchanged

## Files to Modify

- `apps/api/src/lib/sync/push/stock.ts` (update to use costing contract)

## Dependencies

- story-24.4 (COGS posting update must be complete)

## Implementation

1. Import `deductWithCost` from `@jurnapod/modules-inventory-costing`
2. Update sync stock handler to use costing package
3. Ensure error handling matches sync protocol expectations
4. Verify no change in sync behavior

## Validation

```bash
npm run test:unit:sync -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts
```

## Notes

Sync push is critical for POS offline-first. Ensure:
- `client_tx_id` idempotency is preserved
- Duplicate payloads don't create duplicate effects
- Per-transaction outcomes remain explicit (OK, DUPLICATE, ERROR)