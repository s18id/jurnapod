// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Fixed Assets Domain Errors
 *
 * Domain-specific error types for fixed asset operations.
 */

export class FixedAssetNotFoundError extends Error {
  readonly code = "FIXED_ASSET_NOT_FOUND";
  constructor() {
    super("Fixed asset not found");
    this.name = "FixedAssetNotFoundError";
  }
}

export class FixedAssetAccessDeniedError extends Error {
  readonly code = "FIXED_ASSET_ACCESS_DENIED";
  constructor() {
    super("Access denied to this fixed asset");
    this.name = "FixedAssetAccessDeniedError";
  }
}

export class FixedAssetCategoryNotFoundError extends Error {
  readonly code = "FIXED_ASSET_CATEGORY_NOT_FOUND";
  constructor() {
    super("Fixed asset category not found");
    this.name = "FixedAssetCategoryNotFoundError";
  }
}

export class FixedAssetCategoryNotEmptyError extends Error {
  readonly code = "FIXED_ASSET_CATEGORY_NOT_EMPTY";
  constructor() {
    super("Cannot delete category that has associated assets");
    this.name = "FixedAssetCategoryNotEmptyError";
  }
}

export class FixedAssetHasEventsError extends Error {
  readonly code = "FIXED_ASSET_HAS_EVENTS";
  constructor() {
    super("Cannot delete asset that has lifecycle events");
    this.name = "FixedAssetHasEventsError";
  }
}

export class FixedAssetCodeExistsError extends Error {
  readonly code = "FIXED_ASSET_CODE_EXISTS";
  constructor() {
    super("Fixed asset code already exists");
    this.name = "FixedAssetCodeExistsError";
  }
}

export class FixedAssetCategoryCodeExistsError extends Error {
  readonly code = "FIXED_ASSET_CATEGORY_CODE_EXISTS";
  constructor() {
    super("Fixed asset category code already exists");
    this.name = "FixedAssetCategoryCodeExistsError";
  }
}

export class DepreciationPlanNotFoundError extends Error {
  readonly code = "DEPRECIATION_PLAN_NOT_FOUND";
  constructor() {
    super("Depreciation plan not found");
    this.name = "DepreciationPlanNotFoundError";
  }
}

export class DepreciationPlanStatusError extends Error {
  readonly code = "DEPRECIATION_PLAN_STATUS_ERROR";
  constructor(message = "Depreciation plan has posted runs") {
    super(message);
    this.name = "DepreciationPlanStatusError";
  }
}

export class DepreciationPlanValidationError extends Error {
  readonly code = "DEPRECIATION_PLAN_VALIDATION_ERROR";
  constructor(message = "Invalid depreciation plan") {
    super(message);
    this.name = "DepreciationPlanValidationError";
  }
}

export class DepreciationRunNotFoundError extends Error {
  readonly code = "DEPRECIATION_RUN_NOT_FOUND";
  constructor() {
    super("Depreciation run not found");
    this.name = "DepreciationRunNotFoundError";
  }
}

export class DepreciationRunValidationError extends Error {
  readonly code = "DEPRECIATION_RUN_VALIDATION_ERROR";
  constructor(message = "Invalid depreciation run") {
    super(message);
    this.name = "DepreciationRunValidationError";
  }
}

// =============================================================================
// Lifecycle Service Errors
// =============================================================================

export class LifecycleEventNotFoundError extends Error {
  readonly code = "LIFECYCLE_EVENT_NOT_FOUND";
  constructor() {
    super("Lifecycle event not found");
    this.name = "LifecycleEventNotFoundError";
  }
}

export class LifecycleEventVoidedError extends Error {
  readonly code = "LIFECYCLE_EVENT_VOIDED";
  constructor() {
    super("Lifecycle event has already been voided");
    this.name = "LifecycleEventVoidedError";
  }
}

export class LifecycleEventNotVoidableError extends Error {
  readonly code = "LIFECYCLE_EVENT_NOT_VOIDABLE";
  constructor() {
    super("Event type cannot be voided");
    this.name = "LifecycleEventNotVoidableError";
  }
}

export class LifecycleDuplicateEventError extends Error {
  readonly code = "LIFECYCLE_DUPLICATE_EVENT";
  constructor(public readonly existingEventId: number) {
    super("Duplicate event with same idempotency key");
    this.name = "LifecycleDuplicateEventError";
  }
}

export class LifecycleAssetDisposedError extends Error {
  readonly code = "LIFECYCLE_ASSET_DISPOSED";
  constructor() {
    super("Asset has already been disposed");
    this.name = "LifecycleAssetDisposedError";
  }
}

export class LifecycleInvalidStateError extends Error {
  readonly code = "LIFECYCLE_INVALID_STATE";
  constructor(message: string) {
    super(message);
    this.name = "LifecycleInvalidStateError";
  }
}

export class LifecycleFiscalYearClosedError extends Error {
  readonly code = "LIFECYCLE_FISCAL_YEAR_CLOSED";
  constructor(message = "Event date is outside any open fiscal year") {
    super(message);
    this.name = "LifecycleFiscalYearClosedError";
  }
}

export class LifecycleJournalUnbalancedError extends Error {
  readonly code = "LIFECYCLE_JOURNAL_UNBALANCED";
  constructor(message: string) {
    super(message);
    this.name = "LifecycleJournalUnbalancedError";
  }
}

export class LifecycleInvalidReferenceError extends Error {
  readonly code = "LIFECYCLE_INVALID_REFERENCE";
  constructor(message: string) {
    super(message);
    this.name = "LifecycleInvalidReferenceError";
  }
}

/**
 * MySQL duplicate key error code
 */
const MYSQL_DUPLICATE_ENTRY_CODE = 1062;

/**
 * Check if an error is a MySQL duplicate key error (ER_DUP_ENTRY).
 * This handles both Kysely-thrown errors and raw mysql2 errors.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  if (error instanceof Error) {
    // Kysely with mysql2 driver wraps the error
    if ("code" in error && error.code === "ER_DUP_ENTRY") return true;
    if ("number" in error && error.number === MYSQL_DUPLICATE_ENTRY_CODE) return true;
  }
  return false;
}
