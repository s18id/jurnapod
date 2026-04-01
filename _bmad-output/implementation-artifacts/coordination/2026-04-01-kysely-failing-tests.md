## Coordination: Native Kysely migration for failing tests

Date: 2026-04-01
Owner: primary BMAD build agent

### Scope
- `apps/api/src/lib/cost-tracking.ts`
- `apps/api/src/lib/stock.ts`
- `apps/api/src/lib/taxes.test.ts`
- `apps/api/src/lib/table-occupancy.test.ts`

### Constraints
- Fix only currently failing tests in provided error list.
- Prefer native Kysely query builder patterns.
- Do not use `sql` tag except where truly needed.
- Maintain tenant/outlet scoping and transactional correctness.

### Failure clusters
1. Nested transaction errors from `withTransaction` being called with a `Transaction` instance.
2. Date serialization errors from `.toISOString()` on non-Date row values.
3. `taxes.test.ts` uses old executor mock (`execute`) while implementation expects Kysely executor (`selectFrom`).
4. `table-occupancy.test.ts` relies on legacy fake-pool SQL-capture assumptions that no longer match Kysely runtime.

### Batch plan
Single batch (shared file touch/dependencies):
1. Refactor transaction handling in `cost-tracking.ts` + `stock.ts`.
2. Add robust date normalization in `stock.ts`.
3. Rewrite `taxes.test.ts` to real Kysely-compatible tests.
4. Rewrite `table-occupancy.test.ts` to Kysely-compatible behavioral tests.
5. Run targeted tests:
   - `npm run test:unit:single -w @jurnapod/api src/lib/stock.test.ts`
   - `npm run test:unit:single -w @jurnapod/api src/lib/taxes.test.ts`
   - `npm run test:unit:single -w @jurnapod/api src/lib/table-occupancy.test.ts`
