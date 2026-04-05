# Error Code Taxonomy

This document defines the conventions for error codes across the Jurnapod monorepo.

---

## 1. Convention

All domain errors **must** have a `code: string` property that is:

- **Format**: `SCREAMING_SNAKE_CASE`
- **Scope**: Unique within the package
- **Stability**: Never reuse retired codes across versions

### Why Error Codes?

- Enables programmatic error handling in clients
- Provides stable API contracts independent of error message text
- Facilitates error tracking and monitoring in production

---

## 2. Code Format by Domain

| Domain | Prefix | Examples |
|--------|--------|----------|
| **Accounting** | `FISCAL_YEAR_*`, `ACCOUNT_*`, `JOURNAL_*`, `RECONCILIATION_*`, `COGS_*` | `FISCAL_YEAR_NOT_FOUND`, `ACCOUNT_CODE_EXISTS`, `JOURNAL_NOT_BALANCED` |
| **Fixed Assets** | `FIXED_ASSET_*`, `DEPRECIATION_*`, `LIFECYCLE_*` | `FIXED_ASSET_NOT_FOUND`, `DEPRECIATION_PLAN_STATUS_ERROR` |
| **Sales** | `SALE_*`, `PAYMENT_*`, `INVOICE_*` | `PAYMENT_ALLOCATION_ERROR` |
| **Inventory** | `INVENTORY_*`, `STOCK_*`, `COST_*` | `INSUFFICIENT_INVENTORY` |
| **Platform** | `COMPANY_*`, `OUTLET_*`, `USER_*`, `ROLE_*`, `PERMISSION_*` | `COMPANY_NOT_FOUND`, `USER_EMAIL_EXISTS` |
| **Sync** | `SYNC_*` | `SYNC_STOCK_CONFLICT`, `SYNC_VALIDATION_ERROR` |
| **Treasury** | `CASH_BANK_*` | `CASH_BANK_NOT_FOUND`, `CASH_BANK_VALIDATION_ERROR` |
| **Reservations** | `SESSION_*`, `TABLE_SYNC_*` | `SESSION_NOT_FOUND`, `TABLE_SYNC_CONFLICT` |

---

## 3. Error Severity Levels

| Level | Meaning | Examples |
|-------|---------|----------|
| **P0** | Data loss risk, security breach, permanent inconsistency | `JOURNAL_NOT_BALANCED`, `LIFECYCLE_JOURNAL_UNBALANCED` |
| **P1** | Operation failure, validation failure, business rule violation | `FISCAL_YEAR_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `INSUFFICIENT_INVENTORY` |
| **P2** | Warning, degraded operation, recoverable | `PAYMENT_VARIANCE_CONFIG_ERROR`, `SYNC_STOCK_OVERFLOW` |

---

## 4. Existing Error Codes (Accounting Module)

### Fiscal Year Errors

| Code | Class | Severity |
|------|-------|----------|
| `FISCAL_YEAR_NOT_FOUND` | `FiscalYearNotFoundError` | P1 |
| `FISCAL_YEAR_CODE_EXISTS` | `FiscalYearCodeExistsError` | P1 |
| `FISCAL_YEAR_DATE_RANGE` | `FiscalYearDateRangeError` | P1 |
| `FISCAL_YEAR_OVERLAP` | `FiscalYearOverlapError` | P1 |
| `FISCAL_YEAR_OPEN_CONFLICT` | `FiscalYearOpenConflictError` | P1 |
| `FISCAL_YEAR_NOT_OPEN` | `FiscalYearNotOpenError` | P1 |
| `FISCAL_YEAR_SELECTION_ERROR` | `FiscalYearSelectionError` | P1 |
| `FISCAL_YEAR_ALREADY_CLOSED` | `FiscalYearAlreadyClosedError` | P1 |
| `FISCAL_YEAR_CLOSE_CONFLICT` | `FiscalYearCloseConflictError` | P1 |
| `FISCAL_YEAR_CLOSE_PRECONDITION_FAILED` | `FiscalYearClosePreconditionError` | P1 |
| `FISCAL_YEAR_CLOSE_PREVIEW_FAILED` | `FiscalYearClosePreviewError` | P2 |
| `FISCAL_YEAR_CLOSED` | `FiscalYearClosedError` | P1 |

### Account Errors

| Code | Class | Severity |
|------|-------|----------|
| `ACCOUNT_CODE_EXISTS` | `AccountCodeExistsError` | P1 |
| `ACCOUNT_CIRCULAR_REFERENCE` | `CircularReferenceError` | P1 |
| `ACCOUNT_IN_USE` | `AccountInUseError` | P1 |
| `ACCOUNT_NOT_FOUND` | `AccountNotFoundError` | P1 |
| `PARENT_ACCOUNT_COMPANY_MISMATCH` | `ParentAccountCompanyMismatchError` | P1 |
| `ACCOUNT_TYPE_COMPANY_MISMATCH` | `AccountTypeCompanyMismatchError` | P1 |
| `RETAINED_EARNINGS_ACCOUNT_NOT_FOUND` | `RetainedEarningsAccountNotFoundError` | P1 |

### Journal Errors

| Code | Class | Severity |
|------|-------|----------|
| `JOURNAL_NOT_BALANCED` | `JournalNotBalancedError` | P0 |
| `JOURNAL_NOT_FOUND` | `JournalNotFoundError` | P1 |
| `INVALID_JOURNAL_LINE` | `InvalidJournalLineError` | P1 |
| `JOURNAL_OUTSIDE_FISCAL_YEAR` | `JournalOutsideFiscalYearError` | P1 |
| `UNBALANCED_JOURNAL` | `UnbalancedJournalError` | P0 |

### Account Type Errors

| Code | Class | Severity |
|------|-------|----------|
| `ACCOUNT_TYPE_NAME_EXISTS` | `AccountTypeNameExistsError` | P1 |
| `ACCOUNT_TYPE_NOT_FOUND` | `AccountTypeNotFoundError` | P1 |
| `ACCOUNT_TYPE_IN_USE` | `AccountTypeInUseError` | P1 |

### Fixed Asset Errors

| Code | Class | Severity |
|------|-------|----------|
| `FIXED_ASSET_NOT_FOUND` | `FixedAssetNotFoundError` | P1 |
| `FIXED_ASSET_ACCESS_DENIED` | `FixedAssetAccessDeniedError` | P1 |
| `FIXED_ASSET_CATEGORY_NOT_FOUND` | `FixedAssetCategoryNotFoundError` | P1 |
| `FIXED_ASSET_CATEGORY_NOT_EMPTY` | `FixedAssetCategoryNotEmptyError` | P1 |
| `FIXED_ASSET_HAS_EVENTS` | `FixedAssetHasEventsError` | P1 |
| `FIXED_ASSET_CODE_EXISTS` | `FixedAssetCodeExistsError` | P1 |
| `FIXED_ASSET_CATEGORY_CODE_EXISTS` | `FixedAssetCategoryCodeExistsError` | P1 |

### Depreciation Errors

| Code | Class | Severity |
|------|-------|----------|
| `DEPRECIATION_PLAN_NOT_FOUND` | `DepreciationPlanNotFoundError` | P1 |
| `DEPRECIATION_PLAN_STATUS_ERROR` | `DepreciationPlanStatusError` | P1 |
| `DEPRECIATION_PLAN_VALIDATION_ERROR` | `DepreciationPlanValidationError` | P1 |
| `DEPRECIATION_RUN_NOT_FOUND` | `DepreciationRunNotFoundError` | P1 |
| `DEPRECIATION_RUN_VALIDATION_ERROR` | `DepreciationRunValidationError` | P1 |

### Lifecycle Errors

| Code | Class | Severity |
|------|-------|----------|
| `LIFECYCLE_EVENT_NOT_FOUND` | `LifecycleEventNotFoundError` | P1 |
| `LIFECYCLE_EVENT_VOIDED` | `LifecycleEventVoidedError` | P1 |
| `LIFECYCLE_EVENT_NOT_VOIDABLE` | `LifecycleEventNotVoidableError` | P1 |
| `LIFECYCLE_DUPLICATE_EVENT` | `LifecycleDuplicateEventError` | P1 |
| `LIFECYCLE_ASSET_DISPOSED` | `LifecycleAssetDisposedError` | P1 |
| `LIFECYCLE_INVALID_STATE` | `LifecycleInvalidStateError` | P1 |
| `LIFECYCLE_FISCAL_YEAR_CLOSED` | `LifecycleFiscalYearClosedError` | P1 |
| `LIFECYCLE_JOURNAL_UNBALANCED` | `LifecycleJournalUnbalancedError` | P0 |
| `LIFECYCLE_INVALID_REFERENCE` | `LifecycleInvalidReferenceError` | P1 |

### COGS Errors

| Code | Class | Severity |
|------|-------|----------|
| `COGS_CALCULATION_ERROR` | `CogsCalculationError` | P1 |
| `COGS_ACCOUNT_CONFIG_ERROR` | `CogsAccountConfigError` | P1 |
| `COGS_POSTING_ERROR` | `CogsPostingError` | P0 |

---

## 5. Adding New Error Codes

When adding a new domain error:

1. **Choose the correct prefix** based on the domain table above
2. **Use descriptive name** that explains the failure condition
3. **Assign severity** based on the impact
4. **Add `code` property** as a class field (not constructor argument)

### Example

```typescript
export class InventoryBelowMinimumError extends Error {
  code = "INVENTORY_BELOW_MINIMUM";
  constructor(itemId: number, currentQty: number, minimumQty: number) {
    super(`Inventory item ${itemId} below minimum: ${currentQty} < ${minimumQty}`);
    this.name = "InventoryBelowMinimumError";
  }
}
```

---

## 6. Anti-Patterns

- ❌ **Do not** reuse retired error codes for different failure conditions
- ❌ **Do not** use numeric error codes or arbitrary strings
- ❌ **Do not** expose internal SQL error messages to clients
- ❌ **Do not** throw base `Error` class without a domain-specific error wrapper

---

## 7. API Response Format

Errors returned from API routes should include both the machine-readable code and human-readable message:

```json
{
  "error": {
    "code": "FISCAL_YEAR_NOT_FOUND",
    "message": "Fiscal year not found",
    "details": {}
  }
}
```
