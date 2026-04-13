# Story 41.2: Hook Token Migration

> **Epic:** 41 - Backoffice Auth Token Centralization  
> **Priority:** P0  
> **Estimate:** 12h  
> **Status:** ✅ Done

---

## Story

As a **developer**,  
I want hooks to not require `accessToken` parameter,  
So that components don't need to pass tokens down to data fetching hooks.

---

## Context

Multiple hooks accepted `accessToken` as a parameter, requiring pages and components to thread tokens through the component tree.

### Hooks Requiring Migration

| Hook File | Functions |
|-----------|-----------|
| `use-journals.ts` | useJournalBatches, useJournalBatch, createManualJournalEntry |
| `use-sales-invoices.ts` | useSalesInvoices |
| `use-outlet-account-mappings.ts` | useOutletAccountMappings |
| `use-modules.ts` | useModules, useModuleActions |
| `use-sales-orders.ts` | useSalesOrders |
| `use-reservations.ts` | useReservations |
| `use-outlet-tables.ts` | useOutletTables |
| `use-table-board.ts` | useTableBoard |
| `use-export.ts` | useExport (uses apiStreamingRequest) |
| `use-variants.ts` | useVariants |
| `use-import.ts` | useUpload, useValidate, useApply, useGetTemplate, useImportWizard |

---

## Acceptance Criteria

### AC1: Remove accessToken from Hooks
- [x] `accessToken` removed from all hook function signatures
- [x] Hooks call `apiRequest()` without passing token
- [x] All existing functionality preserved

### AC2: Update Hook Callers
- [x] All page components updated to use new hook signatures
- [x] No broken imports or call sites

### AC3: XHR Hooks Use Wrappers
- [x] useUpload uses uploadWithProgress()
- [x] useApply uses applyWithProgress()
- [x] useGetTemplate uses apiStreamingRequest()

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/backoffice/src/hooks/use-journals.ts` | Removed accessToken param |
| `apps/backoffice/src/hooks/use-sales-invoices.ts` | Removed accessToken param |
| `apps/backoffice/src/hooks/use-outlet-account-mappings.ts` | Removed accessToken param |
| `apps/backoffice/src/hooks/use-modules.ts` | Removed accessToken param |
| `apps/backoffice/src/hooks/use-sales-orders.ts` | Removed accessToken param |
| `apps/backoffice/src/hooks/use-reservations.ts` | Removed accessToken param |
| `apps/backoffice/src/hooks/use-outlet-tables.ts` | Removed accessToken param |
| `apps/backoffice/src/hooks/use-table-board.ts` | Removed accessToken param |
| `apps/backoffice/src/hooks/use-export.ts` | Uses apiStreamingRequest |
| `apps/backoffice/src/hooks/use-variants.ts` | Removed accessToken param |
| `apps/backoffice/src/hooks/use-import.ts` | Uses uploadWithProgress, applyWithProgress |
| `apps/backoffice/src/features/sales-payments-page.tsx` | Fixed hook calls |
| `apps/backoffice/src/features/transactions-page.tsx` | Fixed hook calls |

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial story |
| 2026-04-13 | 1.1 | Completed implementation |
