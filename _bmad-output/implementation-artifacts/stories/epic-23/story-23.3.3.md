# story-23.3.3: Extract payments/credit-notes to modules-sales

## Description
Move payment and credit-note workflows from the API to the modules-sales package, preserving immutability semantics for finalized records.

## Acceptance Criteria

- [ ] Payment and credit-note workflows moved to `modules-sales`
- [ ] Finalized record immutability semantics preserved (VOID/REFUND paths intact)
- [ ] No tenant scope regression (`company_id`, `outlet_id` checks remain)

## Files to Modify

- `packages/modules/sales/src/payments/*` (create)
- `packages/modules/sales/src/credit-notes/*` (create)
- `apps/api/src/lib/payments/*` (adapter/removal)
- `apps/api/src/lib/credit-notes/*` (adapter/removal)

## Dependencies

- story-23.3.2 (Orders/invoices extraction should be complete)

## Estimated Effort

4 hours

## Priority

P2

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run test:unit:sales -w @jurnapod/api
npm run test:unit:critical -w @jurnapod/api
```

## Notes

Credit notes affect GL postings. Ensure proper integration with modules-accounting posting interfaces. Maintain VOID/REFUND workflow integrity.
