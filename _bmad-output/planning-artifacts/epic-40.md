# Epic 40: Backoffice Feature Completeness - API-to-UI Gap Closure

> **Epic Number:** 40
> **Status:** draft
> **Priority:** P1
> **Target Sprint:** TBD

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

## Success Criteria

- Credit notes can be fully managed (CRUD, post, void) through backoffice UI
- Fiscal year closing workflow (preview, initiate, approve) is available in backoffice
- Sales orders can be created and managed (optional, depends on need)
- Receivables ageing report is accessible in the reports section

---

## Stories

### Phase 1: Critical (Must Have)

| Story | Title | Estimate | Priority | Dependencies |
|-------|-------|----------|----------|--------------|
| 40.1 | Sales Credit Notes Management Page | 24h | P0 | None |
| 40.2 | Fiscal Year Closing Workflow | 16h | P0 | None |

### Phase 2: Important (Should Have)

| Story | Title | Estimate | Priority | Dependencies |
|-------|-------|----------|----------|--------------|
| 40.3 | Sales Orders Management Page | 20h | P1 | None |
| 40.4 | Receivables Ageing Report | 12h | P1 | None |

**Total Estimate:** 72h (Phase 1: 40h, Phase 2: 32h)

---

## Technical Context

### API Endpoints Already Available

The following API endpoints already exist and are fully functional:

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

### UI Patterns to Follow

All new pages must follow existing backoffice patterns:

1. **Framework:** React + Mantine UI components
2. **State Management:** React hooks in `apps/backoffice/src/hooks/`
3. **Routing:** Define routes in `apps/backoffice/src/app/routes.ts`
4. **Layout:** Use `AppLayout` with proper navigation items
5. **ACL:** Enforce permissions using resource-level permissions (Epic 39)

### Reference Implementations

- **Sales Invoices Page:** `apps/backoffice/src/features/sales-invoices-page.tsx` - Use as pattern for credit notes list/form
- **Fiscal Years Page:** `apps/backoffice/src/features/fiscal-years-page.tsx` - Use as base for closing workflow enhancements
- **Credit Notes API:** `apps/api/src/routes/sales/credit-notes.ts` - Reference for data structures and permissions

---

## Module Enablement

All features must respect module enablement:

| Feature | Module | Config Key |
|---------|--------|------------|
| Credit Notes | Sales | `modules.sales.enabled` |
| Fiscal Years | Accounting | `modules.accounting.enabled` |
| Sales Orders | Sales | `modules.sales.enabled` |
| Receivables Ageing | Sales + Accounting | `modules.sales.enabled` && `modules.accounting.enabled` |

---

## ACL Permissions Required

All features must enforce resource-level permissions per Epic 39:

| Feature | Module | Resource | Permissions Needed |
|---------|--------|----------|-------------------|
| Credit Notes List | sales | credit_notes | READ |
| Credit Note Create | sales | credit_notes | CREATE |
| Credit Note Edit | sales | credit_notes | UPDATE |
| Credit Note Post | sales | credit_notes | UPDATE (status transition) |
| Credit Note Void | sales | credit_notes | UPDATE (status transition) |
| Fiscal Years List | accounting | fiscal_years | READ |
| Fiscal Year Close | accounting | fiscal_years | MANAGE |
| Sales Orders List | sales | orders | READ |
| Sales Order Create | sales | orders | CREATE |
| Sales Order Edit | sales | orders | UPDATE |
| Ageing Report | accounting | reports | ANALYZE |

---

## Definition of Done

### For Each Story

- [ ] UI components implemented following Mantine patterns
- [ ] React hooks created for data fetching and mutations
- [ ] Routes registered in `apps/backoffice/src/app/routes.ts`
- [ ] Navigation items added to sidebar/menu
- [ ] ACL permissions enforced on all actions
- [ ] Module enablement checks implemented
- [ ] Form validation using Zod schemas
- [ ] Error handling with user-friendly messages
- [ ] Loading states implemented
- [ ] Responsive design for mobile/desktop

### Cross-Cutting

- [ ] All new code passes `npm run typecheck -w @jurnapod/backoffice`
- [ ] All new code passes `npm run lint -w @jurnapod/backoffice`
- [ ] No console errors or warnings
- [ ] Consistent styling with existing backoffice pages

---

## Out of Scope

The following are explicitly out of scope for this epic:

- API endpoint creation (all APIs already exist)
- Database schema changes
- Backend business logic changes
- Mobile app features (backoffice web only)
- POS features
- Advanced reporting features beyond ageing

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| API contract mismatches | High | Low | Review API contracts before implementation |
| Permission model confusion | Medium | Medium | Reference Epic 39 documentation |
| UI pattern inconsistency | Low | Medium | Strictly follow existing page patterns |
| Module enablement edge cases | Medium | Low | Test with all module combinations |

---

## Related Documentation

- [Epic 39: Permission System Consolidation](./epic-39-sprint-plan.md)
- [Epic 32: Financial Period Close](./epic-32-sprint-plan.md) - Related to fiscal year closing
- [AGENTS.md](../../AGENTS.md) - Project-wide conventions

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial draft |
