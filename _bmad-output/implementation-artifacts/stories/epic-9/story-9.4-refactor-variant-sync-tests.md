# Story 9.4: Refactor Variant Sync Tests

**Status:** backlog
**Epic:** Epic 9: Use Library Functions in Tests
**Story ID:** 9-4-refactor-variant-sync-tests

## Context
Refactor variant price and stock tests to use library functions.

## Acceptance Criteria
1. `lib/pricing/variant-price-resolver.ts` - price resolution functions used
2. `lib/inventory/variant-stock.ts` - stock functions used
3. Tests pass after refactoring

## Files to Refactor
- `lib/pricing/variant-price-resolver.test.ts`
- `lib/inventory/variant-stock.test.ts`
- `routes/sync/push-variant.test.ts`

## Technical Notes
- Variant stock functions handle dual-table sync
- Price resolution has caching considerations

## Dependencies
Story 9.2 (core functions must be available)

## Estimated Effort
1 day

## Priority
P1

## Risk Level
Medium - Variant sync has complex business logic
