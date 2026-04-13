# Epic 40: Backoffice Feature Completeness - API-to-UI Gap Closure

> **Epic Number:** 40
> **Status:** completed
> **Priority:** P1
> **Completed:** 2026-04-13

---

## Overview

An analysis of API endpoints vs backoffice UI features revealed several critical gaps where APIs exist but no corresponding backoffice interface exists. This epic addresses these gaps to provide users with complete functionality through the backoffice UI.

---

## Goals

1. Close critical gaps between API capabilities and backoffice UI
2. Enable users to manage sales credit notes through the UI
3. Complete the fiscal year closing workflow in the backoffice
4. Add sales orders management (if applicable)
5. Expose receivables ageing report in the UI

---

## Success Criteria ✅

- [x] Credit notes can be fully managed (CRUD, post, void) through backoffice UI
- [x] Fiscal year closing workflow (preview, initiate, approve) is available in backoffice
- [x] Sales orders can be created and managed (optional, depends on need)
- [x] Receivables ageing report is accessible in the reports section

---

## Stories

| Story | Title | Estimate | Priority | Status |
|-------|-------|----------|----------|--------|
| 40.1 | [Sales Credit Notes Management Page](./story-40.1.md) | 24h | P0 | ✅ Done |
| 40.2 | [Fiscal Year Closing Workflow](./story-40.2.md) | 16h | P0 | ✅ Done |
| 40.3 | [Sales Orders Management Page](./story-40.3.md) | 20h | P1 | ✅ Done |
| 40.4 | [Receivables Ageing Report](./story-40.4.md) | 12h | P1 | ✅ Done |

**Total Estimate:** 72h (Phase 1: 40h, Phase 2: 32h)

---

## Story Details

### Story 40.1: Sales Credit Notes Management Page ✅
- **Story File:** [story-40.1.md](./story-40.1.md)
- **Completion Report:** [story-40.1.completion.md](./story-40.1.completion.md)

**Goal:** Create full UI for managing sales credit notes.

**Tasks:**
- [x] Create sales-credit-notes-page.tsx with list view
- [x] Add credit note create/edit form
- [x] Implement credit note detail view
- [x] Add post and void actions
- [x] Add outlet and customer filters
- [x] Add status filter (DRAFT, POSTED, VOID)
- [x] Add date range filter
- [x] Enforce ACL permissions (sales.credit_notes)
- [x] Add module enablement check (modules.sales.enabled)

**Files Created/Modified:**
- `apps/backoffice/src/features/sales-credit-notes-page.tsx` (new)
- `apps/backoffice/src/app/routes.ts` (added route)
- `apps/backoffice/src/features/pages.tsx` (added nav item)

---

### Story 40.2: Fiscal Year Closing Workflow ✅
- **Story File:** [story-40.2.md](./story-40.2.md)
- **Completion Report:** [story-40.2.completion.md](./story-40.2.completion.md)

**Goal:** Complete the fiscal year closing workflow with preview, initiate, and approve steps.

**Tasks:**
- [x] Enhance existing fiscal-years-page.tsx
- [x] Add close preview with journal entry preview
- [x] Add close initiate action
- [x] Add close approve action (requires MANAGE permission)
- [x] Add fiscal year status badges
- [x] Improve fiscal year list/filter UI
- [x] Add fiscal year create modal
- [x] Enforce ACL permissions (accounting.fiscal_years)

**Files Created/Modified:**
- `apps/backoffice/src/features/fiscal-years-page.tsx` (enhanced)

---

### Story 40.3: Sales Orders Management Page ✅
- **Story File:** [story-40.3.md](./story-40.3.md)
- **Completion Report:** [story-40.3.completion.md](./story-40.3.completion.md)

**Goal:** Create UI for managing sales orders.

**Tasks:**
- [x] Create sales-orders-page.tsx with list view
- [x] Add order create/edit form
- [x] Add order detail view
- [x] Add convert-to-invoice action
- [x] Add status filter (DRAFT, CONFIRMED, FULFILLED, CANCELLED)
- [x] Add outlet and customer filters
- [x] Enforce ACL permissions (sales.orders)
- [x] Add module enablement check (modules.sales.enabled)

**Files Created/Modified:**
- `apps/backoffice/src/features/sales-orders-page.tsx` (new)
- `apps/backoffice/src/hooks/sales-orders/use-sales-orders.ts` (new)
- `apps/backoffice/src/app/routes.ts` (added route)
- `apps/backoffice/src/features/pages.tsx` (added nav item)

---

### Story 40.4: Receivables Ageing Report ✅
- **Story File:** [story-40.4.md](./story-40.4.md)
- **Completion Report:** [story-40.4.completion.md](./story-40.4.completion.md)

**Goal:** Expose receivables ageing report in the UI.

**Tasks:**
- [x] Create receivables-ageing-page.tsx
- [x] Create use-receivables-ageing hook
- [x] Add ageing summary cards (total receivables, current, 30/60/90+ days)
- [x] Add ageing table with customer breakdown
- [x] Add export button for CSV/PDF
- [x] Add outlet and date filters
- [x] Enforce ACL permissions (accounting.reports ANALYZE)
- [x] Add module enablement check (modules.sales.enabled && modules.accounting.enabled)

**Files Created/Modified:**
- `apps/backoffice/src/features/receivables-ageing-page.tsx` (new)
- `apps/backoffice/src/hooks/use-receivables-ageing.ts` (new)
- `apps/backoffice/src/types/reports/receivables-ageing.ts` (new)
- `apps/backoffice/src/components/reports/receivables-ageing/` (new components)
  - `ageing-summary-cards.tsx`
  - `ageing-table.tsx`
  - `ageing-filters.tsx`
  - `ageing-export-button.tsx`
- `apps/backoffice/src/app/routes.ts` (added route)
- `apps/backoffice/src/features/pages.tsx` (added nav item)

---

## Technical Context

### API Endpoints Used

The following API endpoints were already available:

**Sales Credit Notes:**
- `GET /api/v1/sales/credit-notes` - List credit notes
- `GET /api/v1/sales/credit-notes/:id` - Get credit note details
- `POST /api/v1/sales/credit-notes` - Create credit note
- `PATCH /api/v1/sales/credit-notes/:id` - Update credit note (draft only)
- `POST /api/v1/sales/credit-notes/:id/post` - Post credit note to GL
- `POST /api/v1/sales/credit-notes/:id/void` - Void credit note

**Fiscal Years:**
- `GET /api/v1/accounting/fiscal-years` - List fiscal years
- `GET /api/v1/accounting/fiscal-years/:id` - Get fiscal year details
- `POST /api/v1/accounting/fiscal-years` - Create fiscal year
- `POST /api/v1/accounting/fiscal-years/:id/close-preview` - Preview closing entries
- `POST /api/v1/accounting/fiscal-years/:id/close-initiate` - Initiate year close
- `POST /api/v1/accounting/fiscal-years/:id/close-approve` - Approve year close

**Sales Orders:**
- `GET /api/v1/sales/orders` - List orders
- `GET /api/v1/sales/orders/:id` - Get order details
- `POST /api/v1/sales/orders` - Create order
- `PATCH /api/v1/sales/orders/:id` - Update order
- `POST /api/v1/sales/orders/:id/convert-to-invoice` - Convert to invoice

**Reports:**
- `GET /api/v1/reports/receivables-ageing` - Receivables ageing report

### UI Patterns Used

All pages follow existing backoffice patterns:

1. **Framework:** React + Mantine UI components
2. **State Management:** React hooks in `apps/backoffice/src/hooks/`
3. **Routing:** Routes defined in `apps/backoffice/src/app/routes.ts`
4. **Layout:** Uses `AppLayout` with proper navigation items
5. **ACL:** Enforces permissions using resource-level permissions (Epic 39)

---

## Module Enablement

All features respect module enablement:

| Feature | Module | Config Key |
|---------|--------|------------|
| Credit Notes | Sales | `modules.sales.enabled` |
| Fiscal Years | Accounting | `modules.accounting.enabled` |
| Sales Orders | Sales | `modules.sales.enabled` |
| Receivables Ageing | Sales + Accounting | `modules.sales.enabled` && `modules.accounting.enabled` |

---

## ACL Permissions Enforced

All features enforce resource-level permissions per Epic 39:

| Feature | Module | Resource | Permissions |
|---------|--------|----------|-------------|
| Credit Notes List | sales | credit_notes | READ |
| Credit Note Create | sales | credit_notes | CREATE |
| Credit Note Edit | sales | credit_notes | UPDATE |
| Credit Note Post | sales | credit_notes | UPDATE |
| Credit Note Void | sales | credit_notes | UPDATE |
| Fiscal Years List | accounting | fiscal_years | READ |
| Fiscal Year Close | accounting | fiscal_years | MANAGE |
| Sales Orders List | sales | orders | READ |
| Sales Order Create | sales | orders | CREATE |
| Sales Order Edit | sales | orders | UPDATE |
| Ageing Report | accounting | reports | ANALYZE |

---

## Definition of Done ✅

### For Each Story

- [x] UI components implemented following Mantine patterns
- [x] React hooks created for data fetching and mutations
- [x] Routes registered in `apps/backoffice/src/app/routes.ts`
- [x] Navigation items added to sidebar/menu
- [x] ACL permissions enforced on all actions
- [x] Module enablement checks implemented
- [x] Form validation using Zod schemas
- [x] Error handling with user-friendly messages
- [x] Loading states implemented
- [x] Responsive design for mobile/desktop

### Cross-Cutting

- [x] All new code passes `npm run typecheck -w @jurnapod/backoffice`
- [x] All new code passes `npm run lint -w @jurnapod/backoffice`
- [x] No console errors or warnings
- [x] Consistent styling with existing backoffice pages

---

## Out of Scope

- API endpoint creation (all APIs already existed)
- Database schema changes
- Backend business logic changes
- Mobile app features (backoffice web only)
- POS features
- Advanced reporting features beyond ageing

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| API contract mismatches | High | Low | Reviewed API contracts before implementation - discovered gaps during build |
| Permission model confusion | Medium | Medium | Referenced Epic 39 documentation |
| UI pattern inconsistency | Low | Medium | Strictly followed existing page patterns |
| Module enablement edge cases | Medium | Low | Tested with module combinations |

---

## Retrospective Findings

### What Went Well

- **API-first approach enabled high velocity** - Clear contracts reduced ambiguity, no backend development needed
- **ACL permissions consistent** - Epic 39 resource-level permissions applied consistently across all 4 features
- **Clean testing separation** - UI tested interaction layer, not business logic
- **Good business ROI** - 4 features delivered in 72h estimate

### Lessons Learned

1. **"API exists" ≠ "API is complete"** - Customer API had placeholder data, fiscal year close_info missing, discovered during UI implementation
2. **Permission design ≠ implementation** - Route-level checks used, not per-button visibility (P2 gap)
3. **Documentation depth varied by bug count** - Should be consistent regardless of implementation difficulty

### Action Items

| # | Action | Owner | Priority |
|---|--------|-------|----------|
| 1 | API Contract Verification before UI stories | Winston + Amelia | P1 |
| 2 | Formal API Gap Tracking process | John + Mary | P1 |
| 3 | Consistent Story Completion Docs | Amelia + Paige | P2 |
| 4 | Per-Button Permission Enforcement | Amelia | P2 |

**Full retrospective document:** [epic-40.retrospective.md](./epic-40.retrospective.md)

---

## Related Documentation

- [Epic 39: Permission System Consolidation](./epic-39-sprint-plan.md)
- [Epic 32: Financial Period Close](./epic-32-sprint-plan.md) - Related to fiscal year closing
- [Epic 41: Auth Token Centralization](./epic-41.md) - Follow-up epic
- [Epic 40 Retrospective](./epic-40.retrospective.md) - Post-epic review
- [AGENTS.md](../../AGENTS.md) - Project-wide conventions

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial draft |
| 2026-04-13 | 1.1 | Completed all 4 stories, added implementation details |
| 2026-04-13 | 1.2 | Added retrospective findings and action items |
