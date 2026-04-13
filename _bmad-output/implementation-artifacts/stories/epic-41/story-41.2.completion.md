# Story 41.2 Completion Report

**Story:** Hook Token Migration  
**Epic:** 41 - Backoffice Auth Token Centralization  
**Status:** ✅ DONE  
**Completed:** 2026-04-13

---

## Summary

Removed `accessToken` from 11 hook files and 2 page files. All hooks now use centralized token resolution through `apiRequest()` or dedicated wrapper functions.

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/backoffice/src/hooks/use-journals.ts` | Removed accessToken param from 3 functions |
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

## Migration Summary

| Hook | Functions Migrated |
|------|-------------------|
| use-journals.ts | useJournalBatches, useJournalBatch, createManualJournalEntry |
| use-sales-invoices.ts | useSalesInvoices |
| use-outlet-account-mappings.ts | useOutletAccountMappings |
| use-modules.ts | useModules, useModuleActions |
| use-sales-orders.ts | useSalesOrders |
| use-reservations.ts | useReservations |
| use-outlet-tables.ts | useOutletTables |
| use-table-board.ts | useTableBoard |
| use-export.ts | useExport |
| use-variants.ts | useVariants |
| use-import.ts | useUpload, useValidate, useApply, useGetTemplate, useImportWizard |

---

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| ESLint | ✅ Passes |
| Build | ✅ Successful |

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial implementation |
