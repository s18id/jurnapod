# Epic 46: Purchasing / Accounts Payable

**Status:** done
**Theme:** Financial Domain — Purchasing Module
**Started:** 2026-04-19
**Completed:** 2026-04-19

## Context

Epic 46 introduces the full Purchasing / Accounts Payable (AP) module to Jurnapod, covering the complete AP lifecycle from supplier master through purchase orders, goods receipts, AP invoices, payments, supplier credit notes, and AP aging reporting. The module follows the established layered architecture pattern (domain library → route adapter) and integrates with the General Ledger via journal posting adapters in `@jurnapod/modules-accounting`.

This is a transactional skeleton: the core AP workflow is scaffolded with journal posting, exchange rate support, and credit limit tracking. Three-way matching and approval workflows are deferred to a future epic.

**Package Owners:**
- Supplier master, exchange rates → `@jurnapod/modules-platform` / new purchasing subdomain
- Purchase orders, GRN, AP invoice, AP payment, credit notes → new purchasing domain libraries
- GL journal posting → `@jurnapod/modules-accounting`
- AP aging → `@jurnapod/modules-reporting`

## Goals

1. Deliver a fully functional AP subledger covering the PO → GRN → Invoice → Payment lifecycle
2. Integrate AP transactions with the General Ledger (journal posting, account ownership validation)
3. Support multi-currency AP transactions with exchange rate temporal tracking

## Stories

| Story | Title | Status | Est | Actual |
|-------|-------|--------|-----|--------|
| 46.1 | Supplier Master + Credit Limits | done | 3h | 3h |
| 46.2 | Exchange Rates | done | 2h | 2h |
| 46.3 | Purchase Orders | done | 3h | 3h |
| 46.4 | Goods Receipts | done | 3h | 3h |
| 46.5 | Purchase Invoices | done | 4h | 4h |
| 46.6 | AP Payments | done | 3h | 3h |
| 46.7 | Supplier Credit Notes | done | 3h | 3h |
| 46.8 | AP Aging Report | done | 2h | 2h |

## Success Criteria

- [x] PO → GRN → AP Invoice → Payment lifecycle functional end-to-end
- [x] GL journal posting adapter in place; all AP transactions post to journals
- [x] Exchange rate temporal schema supports multi-currency AP
- [x] AP aging report with timezone-aware cutoff date
- [x] 11 migrations (0166–0185) run cleanly without rollback incidents
- [x] 155/155 integration tests passing
- [x] Zero data loss, zero production incidents

## Dependencies

- Epic 32 (Financial Period Close) — fiscal year structures
- Epic 39 (ACL) — `purchasing.*` resource-level permissions
- Epic 25 (modules-treasury) — payment account integration

## Risks

| Risk | Mitigation |
|------|------------|
| Currency conversion formula errors | P0 catch in Story 46.5 review; integration tests assert `base = original * rate` |
| AP → GL integration correctness | Journal balance verified in integration tests per story |
| Mid-sprint schema discovery | 11 incremental migrations kept blast radius small |

## Notes

- Post-review P0 catches in Story 46.5: currency conversion formula, account ownership validation, route error mapping — all resolved before merge
- `createTestPurchasingAccounts()` and `createTestPurchasingSettings()` introduced as canonical fixtures (promoted in Epic 47 readiness gate)
- Three-way matching, approval workflows, and supplier scorecard deferred to future epics

## Retrospective

See: [Epic 46 Retrospective](./epic-46-retrospective.md)
