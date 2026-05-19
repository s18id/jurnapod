# Story 69-2-c Completion Report

**Story:** AP Invoices Post/Void + Audit Links  
**Epic:** 69 - Backoffice Purchasing Rollout  
**Status:** ✅ DONE  
**Completed:** 2026-05-19

---

## Summary

Story 69-2-c delivered AP invoice backoffice screens and API contract hardening for list/detail/create/post/void workflows. The implementation adds invoice list filters, ReviewPanel-backed create/post/void flows, backend-authoritative post/void refetch behavior, accounting trace display, audit-link suppression when no verified audit identifier exists, resource-level permission gates, and focused API/UI regression coverage.

---

## Sign-Off Evidence

| Gate | Result | Evidence |
|------|--------|----------|
| Architecture readiness | ✅ GO | Winston re-check reported no remaining P0/P1/P2/P3 findings. |
| QA kickoff readiness | ✅ GO | Quinn kickoff review reported no remaining P0/P1 findings after story corrections. |
| Implementation review | ✅ GO | Consolidated post-implementation review found no remaining P0/P1/P2/P3 findings after P2/P3 corrections. |
| Owner sign-off | ✅ GO | Ahmad explicitly signed off on 2026-05-19. |
| Backoffice unfreeze | ✅ Confirmed | Ahmad confirmed Story 69-2-c backoffice implementation unfreeze on 2026-05-19. |

---

## Files Created/Modified

### Created

| File | Description |
|------|-------------|
| `apps/backoffice/src/features/purchasing/invoices/api.ts` | Backoffice AP invoice API contracts, query keys, mutations, partial post/void refetch helpers, and envelope mapping. |
| `apps/backoffice/src/features/purchasing/invoices/index.tsx` | AP invoice list/detail/create/post/void UI, ReviewPanel forms, permission gates, trace references, and error handling. |
| `apps/backoffice/__test__/unit/features/purchasing-invoices.test.tsx` | Focused unit/component-adjacent coverage for filters, ReviewPanel flows, post/void refetch, audit-link absence, permissions, submit locks, and allocation references. |
| `_bmad-output/implementation-artifacts/stories/epic-69/story-69-2-c.completion.md` | Completion report with acceptance criteria evidence, validation, and sign-off trail. |

### Modified

| File | Changes |
|------|---------|
| `_bmad-output/implementation-artifacts/stories/epic-69/story-69-2-c.md` | Readiness sign-offs, implementation review sign-off, owner sign-off, and done status. |
| `_bmad-output/implementation-artifacts/stories/epic-69/story-69-2.md` | Parent split-control status updated for `69-2-c`. |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Story `69-2-c-ap-invoices-audit-links` marked done through canonical utility. |
| `apps/api/src/routes/purchasing/purchase-invoices.ts` | Hardened invoice list filters, mapped invalid filters to `400 INVALID_REQUEST`, accepted status labels and date-only filters, and documented DELETE permission for void. |
| `apps/api/__test__/integration/purchasing/purchase-invoices.test.ts` | Added API contract coverage for filter hardening, CASHIER post/void denial, and partial post/void responses. |
| `apps/backoffice/src/app/layout.tsx` | Added AP invoice route to Purchasing navigation group. |
| `apps/backoffice/src/app/routes.ts` | Added `/purchasing/invoices` route metadata with `purchasing.invoices.READ`. |
| `apps/backoffice/src/app/router.tsx` | Added lazy route rendering for AP invoice page. |
| `apps/backoffice/src/app/router/routes.tsx` | Added AP invoice route constant. |

---

## Acceptance Criteria Status

| AC | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Invoice list/detail screens render status, supplier, totals, and allocation state where backend provides it; filters support supplier, status, and date after API hardening. | ✅ Complete | `buildPurchaseInvoiceSearchParams` maps supplier/status/date/limit/offset; API route accepts `DRAFT`/`POSTED`/`VOID` and date-only filters; detail drawer renders `po_line_id` allocation references. |
| AC2 | Invoice create uses ReviewPanel and backend-returned totals after save. | ✅ Complete | `InvoiceCreateReviewForm` uses `ReviewPanel`; create flow saves through `/purchasing/invoices`, fetches backend detail, and displays backend total/status. |
| AC3 | Post action requires final review, calls canonical post endpoint, displays journal batch/warnings, and fetches detail before final status/totals display. | ✅ Complete | `postPurchaseInvoiceAndRefetch` calls `POST /purchasing/invoices/:id/post` then `GET /purchasing/invoices/:id`; UI displays `journal_batch_id` and warnings. |
| AC4 | Void action requires ReviewPanel confirmation, shows before/after diff, calls canonical void endpoint, displays reversal batch, and fetches detail before final VOID display. | ✅ Complete | `voidPurchaseInvoiceAndRefetch` calls `POST /purchasing/invoices/:id/void` then detail fetch; UI displays reversal batch and before/after diff; no `void_reason` is submitted. |
| AC5 | Audit deep-link is displayed only when backend exposes a verified audit identifier or query contract. | ✅ Complete | UI displays an explicit audit gap message and does not render fabricated audit links. |
| AC6 | Permission gates enforce `purchasing.invoices` with correct CREATE/UPDATE/DELETE semantics. | ✅ Complete | Page and actions use `purchasing.invoices.READ/CREATE/UPDATE/DELETE`; API route uses resource-level `requireAccess`; CASHIER denial tests cover post and void. |

---

## Key Features Implemented

### AP Invoice Screens

- Added AP invoice list route with supplier, status, date, and pagination filters.
- Added AP invoice detail drawer with supplier, dates, totals, journal trace, posting status, void status, and line allocation references.
- Added route/nav integration for `/purchasing/invoices`.

### ReviewPanel Workflows

- Added ReviewPanel-backed create draft invoice flow.
- Added ReviewPanel-backed post flow with override reason support and backend warning display.
- Added ReviewPanel-backed void flow with before/after status diff and reversal trace display.
- Added synchronous submit locks for create, post, and void to prevent duplicate UI submissions.

### API Contract Hardening

- Hardened invoice list filter parsing to accept canonical status labels and `YYYY-MM-DD` date-only filters.
- Invalid status, date, supplier, limit, and offset filters return `400 INVALID_REQUEST` instead of leaking `500` failures.
- Post and void response shape remains partial; UI refetches authoritative invoice detail before displaying final state.

---

## Technical Implementation

### Data Flow

```text
Invoice list filter → /purchasing/invoices query → backend envelope → table/detail drawer
Create ReviewPanel → validation → POST /purchasing/invoices → GET detail → backend totals/status display
Post ReviewPanel → POST /purchasing/invoices/:id/post → GET detail → journal trace + POSTED state display
Void ReviewPanel → POST /purchasing/invoices/:id/void → GET detail → reversal trace + VOID state display
```

### API Endpoints Used

- `GET /purchasing/invoices` - List AP invoices.
- `POST /purchasing/invoices` - Create draft AP invoice.
- `GET /purchasing/invoices/:id` - Fetch invoice detail.
- `POST /purchasing/invoices/:id/post` - Post invoice and create journal effects.
- `POST /purchasing/invoices/:id/void` - Void invoice and create reversal effects.

### Security

- Navigation metadata and page actions use resource-level ACL gates.
- Negative authorization API coverage uses CASHIER for expected denial.
- Frontend uses relative `/purchasing/...` paths through `apiRequest`.
- Backend authorization remains authoritative.

---

## Code Quality

| Check | Result |
|-------|--------|
| Backoffice focused tests | ✅ Pass — `logs/story-69-2-c-backoffice-test-r2.log`, 9 tests passed. |
| API invoice integration tests | ✅ Pass — `logs/story-69-2-c-api-invoices-test-r2.log`, 29 tests passed. |
| Backoffice typecheck | ✅ Pass — `logs/story-69-2-c-typecheck-backoffice-r3.exit` = 0. |
| API typecheck | ✅ Pass — `logs/story-69-2-c-typecheck-api-r3.exit` = 0. |
| Whitespace check | ✅ Pass — `git diff --check`. |
| POS freeze check | ✅ Pass — `git status --short -- apps/pos` returned no changes. |

---

## Known Limitations

### Audit Deep-Link Contract

1. Current AP invoice APIs do not expose a verified audit identifier or audit-log query contract. The UI does not fabricate audit links and displays journal/reversal batch IDs as accounting trace references only.

### UX Scope

1. Supplier selection remains ID-based in this slice. A richer supplier picker MAY be added in a future UX-focused slice.

---

## Testing Performed

- ✅ Backoffice focused test suite: `logs/story-69-2-c-backoffice-test-r2.log` — 9 tests passed.
- ✅ API purchase invoice integration suite: `logs/story-69-2-c-api-invoices-test-r2.log` — 29 tests passed.
- ✅ Backoffice typecheck: `logs/story-69-2-c-typecheck-backoffice-r3.exit` — 0.
- ✅ API typecheck: `logs/story-69-2-c-typecheck-api-r3.exit` — 0.
- ✅ Sprint status validation: `npx tsx scripts/validate-sprint-status.ts` passed after canonical update.
- ✅ POS freeze check: `git status --short -- apps/pos` returned no changes.
- ✅ Diff whitespace check: `git diff --check` passed.

---

## Cleanup Audit

### Checklist

- [x] Modified areas reviewed for outdated comments and unreachable dead paths introduced by this story.
- [x] Stale API permission comment corrected to include DELETE for void.
- [x] `apps/pos` freeze respected; no POS files modified.

### Findings

- [x] Clean — no additional cleanup debt introduced in story scope.

---

## API Gaps Encountered

| Gap | Discovered | Resolution |
|-----|------------|------------|
| AP invoice list filter route accepted legacy numeric/UTC parsing instead of canonical status labels and date-only filters. | 2026-05-19 readiness review | Route hardened to accept canonical labels/date-only filters and return `400 INVALID_REQUEST` for invalid filters. |
| AP invoice APIs expose no audit identifier. | 2026-05-19 readiness review | UI suppresses audit deep-links and displays journal/reversal batch IDs as trace references only. |
| AP invoice post/void responses are partial. | 2026-05-19 readiness review | UI always refetches invoice detail after post/void success before displaying final backend state. |

---

## Dev Notes

### Pattern Consistency

- `apps/backoffice/src/features/purchasing/orders-receipts/api.ts` provided purchasing query/mutation patterns.
- `apps/backoffice/src/features/purchasing/orders-receipts/index.tsx` provided purchasing page and ReviewPanel modal patterns.
- `apps/backoffice/src/components/ReviewPanel/ReviewPanel.tsx` remains the canonical ReviewPanel component.

### Error Handling

- Modal submit errors render inside ReviewPanel sections.
- Row action detail fetch failures surface formatted API errors on the page.
- `409 PERIOD_CLOSED` renders as a non-retryable backend error by status/code, not `instanceof`.

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-19 | 1.0 | Implemented Story 69-2-c AP invoice screens, API filter hardening, tests, review fixes, and completion evidence. |

---

## Notes

- Story was not marked done until reviewer GO and Ahmad owner sign-off were both recorded.
- No commit was made.
- `sprint-status.yaml` was updated with the canonical utility and validated after update.

---

**Story is COMPLETE.**
