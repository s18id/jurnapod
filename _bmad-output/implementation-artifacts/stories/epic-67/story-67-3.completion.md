# Story 67-3 Completion Report

**Story:** Pricing Management — Default vs Outlet Override Visibility  
**Epic:** 67 - Backoffice Catalog Operations  
**Status:** Done — Reviewer GO + Owner Sign-off  
**Completed:** 2026-05-18

---

## Summary

Story 67-3 implements a pricing management surface that makes company default prices, selected-outlet overrides, and all-outlet override coverage visible through the shared catalog primitives. The implementation preserves existing import/export and price mutation flows while adding explicit effective-price resolution helpers, permission-aware mutation UX, all-outlets compact columns, desktop drawer editors, and mobile full-screen editor behavior.

The reviewer/QA recommendation is **GO**. Ahmad granted owner sign-off on 2026-05-18 after the final review-fix pass.

---

## Files Created/Modified

| File | Change |
|------|--------|
| `apps/backoffice/src/features/prices/price-resolution.ts` | Added canonical frontend helpers for price bucketing, default/outlet/all-outlets resolution, deterministic all-outlets override ordering, filtering, scope labels, action availability, and currency/difference formatting. |
| `apps/backoffice/src/features/prices-page.tsx` | Reworked price page to use shared FilterBar, ScopeBadge, permission gates, all-outlets mode, client-side bucket derivation from current backend list response, recency-ordered outlet columns, and drawer/full-screen editor props. |
| `apps/backoffice/src/features/prices-page/prices-table.tsx` | Replaced inline Mantine table with EntityTable-based pricing table including default price, outlet override price, effective price, ScopeBadge, all-outlet compact columns, recency-aware override sorting, and permission-aware actions. |
| `apps/backoffice/src/features/prices-page/prices-mobile-card.tsx` | Added pinned override display, effective price summary, no-default guard, and permission-aware action labels. |
| `apps/backoffice/src/features/prices-page/create-price-modal.tsx` | Desktop price creation uses Drawer; mobile uses full-screen Modal. |
| `apps/backoffice/src/features/prices-page/edit-price-modal.tsx` | Desktop price editing uses Drawer; mobile uses full-screen Modal. |
| `apps/backoffice/src/features/prices-page/override-price-modal.tsx` | Desktop override editing uses Drawer; mobile uses full-screen Modal. |
| `apps/backoffice/src/hooks/use-export.ts` | Extended export filter type to include `all_outlets` price view mode. |
| `apps/backoffice/vitest.config.ts` | Included unit tests under `__test__/unit/features/prices/`. |
| `apps/backoffice/__test__/unit/features/prices/price-resolution.test.ts` | Added focused unit coverage for price resolution, all-outlets summaries, action gates, scope labels, filtering, and empty inputs. |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Updated Story 67-3 to `review`. |

---

## Acceptance Criteria Evidence

| AC | Status | Evidence |
|----|--------|----------|
| AC1 | ✅ Complete | EntityTable pricing list displays item, SKU, default price, outlet override price, effective price, scope, and status. |
| AC2 | ✅ Complete | Overrides use pinned icon, blue background tint, bold price text, and effective price indicator. |
| AC3 | ✅ Complete | ScopeBadge renders Default Prices, selected Outlet, and All Outlets scopes. |
| AC4 | ✅ Complete | Selected outlet mode shows defaults + selected outlet overrides. All Outlets mode shows compact outlet columns with max 5 by default and Show more. |
| AC5 | ✅ Complete | Set override flow preserves POST `/inventory/item-prices` with `outlet_id`. |
| AC6 | ✅ Complete | Remove override flow preserves DELETE `/inventory/item-prices/:id`; delete is only exposed where safe. |
| AC7 | ✅ Complete | Desktop create/edit/override price entry uses Drawer pattern with validation. |
| AC8 | ✅ Complete | Effective price helpers explicitly resolve default vs selected outlet override semantics and are unit-tested. |
| AC9 | ✅ Complete | Mutation actions use canonical `inventory.items.UPDATE` frontend UX gates; read-only users see read-only actions. |
| AC10 | ✅ Complete | Mobile cards show default/override/effective price states; editors use full-screen Modal behavior. |

---

## Validation Evidence

| Gate | Result | Evidence |
|------|--------|----------|
| Focused unit tests | ✅ Pass — 9/9 | `logs/story-67-3-price-resolution-tests-r7.log` |
| Lint | ✅ Pass | `logs/story-67-3-lint-r7.log` |
| Typecheck | ✅ Pass | `logs/story-67-3-typecheck-r8.log` |
| Build | ✅ Pass | `logs/story-67-3-build-r6.log` |
| Diff whitespace | ✅ Pass | `git diff --check` |
| Sprint status validation | ✅ Pass | `npx tsx scripts/validate-sprint-status.ts` |

---

## QA Outcome

**Decision:** GO.

| Severity | Finding | Resolution |
|----------|---------|------------|
| P0 | None | No action required. |
| P1 | None | No action required. |
| P2 | Initial all-outlets scope/sort/mobile consistency findings | Fixed and verified by final QA. |
| P3 | Initial accessibility/test coverage gaps | Fixed for action labels and focused price-resolution edge cases. |

Final targeted QA verification confirmed all previously reported P2 findings are fixed and returned **GO**. The owner sign-off pass added deterministic all-outlets override ordering, an explicit `Overrides Only` scope label, recency-ordered all-outlets columns, and all-outlets create-action suppression before final validation.

---

## Known Follow-up

| Severity | Follow-up | Rationale |
|----------|-----------|-----------|
| P2 | Add API-level real-DB price CRUD and CASHIER negative authorization coverage in an API integration story if required by story owner. | `apps/backoffice` currently has unit-only test structure; backend route behavior is existing API scope. Frontend mutation UX gates and pure price resolution are covered in this story. |

---

## Owner Sign-off

- ✅ Ahmad granted owner sign-off on 2026-05-18.
- ✅ Story may be marked done after sprint-status validation passes.

---

**Story has reviewer/QA GO and owner sign-off.**
