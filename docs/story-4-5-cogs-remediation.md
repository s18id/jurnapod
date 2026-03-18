# Story 4.5 COGS Remediation Notes

Date: 2026-03-17
Story: 4-5-cogs-integration

## What was fixed

1. COGS posting now fails closed in invoice posting flow.
   - File: `apps/api/src/lib/sales.ts`
   - Change: invoice posting now throws when COGS posting fails instead of logging and continuing.

2. Transaction ownership conflict was resolved for COGS posting.
   - File: `apps/api/src/lib/cogs-posting.ts`
   - Change: `postCogsForSale()` now detects whether the provided connection is currently in a transaction (`@@in_transaction`) and uses `transactionOwner: "external"` only when appropriate.

3. Multi-item inventory credit account bug was fixed.
   - File: `apps/api/src/lib/cogs-posting.ts`
   - Change: journal mapper now aggregates inventory credit lines by inventory asset account instead of always using the first item's account.

4. Cost query/schema drift was fixed.
   - File: `apps/api/src/lib/cogs-posting.ts`
   - Change: cost calculation now checks schema columns via `information_schema` and supports current schema safely:
     - Optional `inventory_transactions.unit_cost`
     - Optional `item_prices.base_cost`
     - Standard `item_prices.price` fallback

5. Company-scope validation was added for item account fields.
   - File: `apps/api/src/lib/master-data.ts`
   - Change: `createItem()` and `updateItem()` now validate `cogs_account_id` and `inventory_asset_account_id` using company-scoped account existence checks.

6. Integration coverage was added.
   - File: `apps/api/tests/integration/cogs-posting.integration.test.mjs`
   - Added tests for:
      - COGS journal creation and balancing on invoice posting
      - tenant isolation for item account id assignment

7. COGS journal date semantics were corrected.
   - Files: `apps/api/src/lib/cogs-posting.ts`, `apps/api/src/lib/sales.ts`
   - Change: `journal_lines.line_date` now uses invoice business date (`saleDate`/`invoice_date`) instead of runtime UTC date.

## Test evidence

- Passed: `node --test --test-concurrency=1 --import tsx src/lib/cogs-posting.test.ts src/lib/sales.cogs-feature-gate.test.ts`
- Passed: `node --test --test-concurrency=1 tests/integration/cogs-posting.integration.test.mjs`
- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: `npm run test:unit`

Note: `npm run test:integration` has one existing failure in
`master-data.integration.test.mjs` (`item deactivation hides from POS sync but preserves data`) that is outside this COGS remediation scope.
