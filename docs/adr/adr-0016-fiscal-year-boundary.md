# ADR-0016: Fiscal Year Service API Boundary

## Status

Accepted

## Date

2026-04-05

## Context

During Epic 31-7c (Accounts Route Thinning), we analyzed `apps/api/src/lib/fiscal-years.ts` which provides fiscal year CRUD operations. This library was not extracted to `@jurnapod/modules-accounting` during previous extraction work because it has significant dependencies:

### Dependencies Found

1. **Direct Kysely SQL queries** - Business logic for fiscal year validation (date ranges, overlaps, open conflicts)
2. **Company settings** - Uses `company_settings` table via `readCompanySetting()` and `allowMultipleOpenFiscalYears()`
3. **Outlet resolution** - `resolveCompanySettingOutletId()` queries outlets table
4. **Date formatting** - Custom `formatDateOnly()` and `parseDateOnly()` functions
5. **Transaction handling** - Complex transaction boundaries for create/update operations

### Why Not Extracted Earlier

- Fiscal year management was considered lower priority than posting/accounting extraction
- Company settings abstraction was not yet available in module packages
- The `FiscalYearGuard` interface (for date validation) was extracted, but full CRUD was not

## Decision

**Fiscal year CRUD operations remain in `apps/api/src/lib/fiscal-years.ts`** with the understanding that this is a documented architectural exception, not the desired end state.

### Rationale

1. **Pragmatism**: Full extraction would require:
   - Creating `FiscalYearService` in `@jurnapod/modules-accounting` or `@jurnapod/modules-platform`
   - Abstracting company settings access into a port interface
   - Significant testing effort for a stable domain
   
2. **Low Coupling Risk**: Fiscal year CRUD is self-contained - it doesn't create journals or posting directly (though journals depend on it via `FiscalYearGuard`)

3. **Future Extraction Path**: When Epic 32 (Financial Period Close & Reconciliation) is tackled, fiscal year extraction should be included as part of that work since the fiscal year domain is directly relevant to period close operations.

## Consequences

### Negative
- Inconsistent API detachment - accounts routes are thin but fiscal year routes are not
- Business logic still in API lib

### Positive
- Faster completion of route thinning for accounts (most critical paths thin)
- Clear documented boundary for future work
- Fiscal year extraction bundled with Epic 32 will have better context

## Review

This ADR should be re-evaluated when Epic 32 (Financial Period Close & Reconciliation) begins. If company settings abstraction improves or fiscal year dependencies become clearer, extraction may become easier.

## Alternatives Considered

### Alternative A: Extract Now
- Create `FiscalYearService` in `modules-accounting`
- Create `SettingsPort` interface for company settings access
- **Rejected**: Too much upfront work for incremental benefit

### Alternative B: Leave as Technical Debt
- Document and track via TD-XXX
- **Rejected**: ADR provides better architectural visibility than TD items

## Dependents

- `apps/api/src/lib/fiscal-years.ts`
- `apps/api/src/routes/accounts.ts` (fiscal year endpoints)
- `packages/modules/accounting/src/fixed-assets/interfaces/fixed-asset-ports.ts` (`FiscalYearGuard`)
- `packages/modules/accounting/src/journals-service.ts` (`JournalOutsideFiscalYearError`)
