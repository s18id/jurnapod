// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Fixed Assets Domain Types
 *
 * Types derived from:
 * - packages/db/src/kysely/schema.ts (FixedAssetBooks, FixedAssetCategories, FixedAssets, FixedAssetEvents)
 * - packages/modules/accounting/src/posting/depreciation.ts (DepreciationPlan, DepreciationRun)
 *
 * Note: DECIMAL columns in MySQL are represented as strings in our type system.
 */

// =============================================================================
// Enums / Status Constants
// =============================================================================

export const FIXED_ASSET_STATUS = {
  ACTIVE: "ACTIVE",
  DISPOSED: "DISPOSED",
  IMPAIRED: "IMPAIRED",
} as const;
export type FixedAssetStatus = (typeof FIXED_ASSET_STATUS)[keyof typeof FIXED_ASSET_STATUS];

export const DEPRECIATION_METHOD = {
  STRAIGHT_LINE: "STRAIGHT_LINE",
  DECLINING_BALANCE: "DECLINING_BALANCE",
  SUM_OF_YEARS: "SUM_OF_YEARS",
  UNITS_OF_PRODUCTION: "UNITS_OF_PRODUCTION",
} as const;
export type DepreciationMethod = (typeof DEPRECIATION_METHOD)[keyof typeof DEPRECIATION_METHOD];

export const DEPRECIATION_PLAN_STATUS = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  CLOSED: "CLOSED",
  VOID: "VOID",
} as const;
export type DepreciationPlanStatus = (typeof DEPRECIATION_PLAN_STATUS)[keyof typeof DEPRECIATION_PLAN_STATUS];

export const DEPRECIATION_RUN_STATUS = {
  PENDING: "PENDING",
  POSTED: "POSTED",
  VOID: "VOID",
} as const;
export type DepreciationRunStatus = (typeof DEPRECIATION_RUN_STATUS)[keyof typeof DEPRECIATION_RUN_STATUS];

export const LIFECYCLE_EVENT_TYPE = {
  ACQUISITION: "ACQUISITION",
  TRANSFER: "TRANSFER",
  IMPAIRMENT: "IMPAIRMENT",
  REVALUATION: "REVALUATION",
  DISPOSAL: "DISPOSAL",
  DEPRECIATION: "DEPRECIATION",
  VOID: "VOID",
} as const;
export type LifecycleEventType = (typeof LIFECYCLE_EVENT_TYPE)[keyof typeof LIFECYCLE_EVENT_TYPE];

export const LIFECYCLE_EVENT_STATUS = {
  PENDING: "PENDING",
  POSTED: "POSTED",
  VOIDED: "VOIDED",
} as const;
export type LifecycleEventStatus = (typeof LIFECYCLE_EVENT_STATUS)[keyof typeof LIFECYCLE_EVENT_STATUS];

// =============================================================================
// Fixed Asset Category
// =============================================================================

export interface FixedAssetCategory {
  id: number;
  company_id: number;
  code: string;
  name: string;
  depreciation_method: string;
  useful_life_months: number;
  residual_value_pct: string;
  accum_depr_account_id: number | null;
  expense_account_id: number | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FixedAssetCategoryCreateInput {
  company_id: number;
  code: string;
  name: string;
  depreciation_method?: string;
  useful_life_months: number;
  residual_value_pct?: string;
  accum_depr_account_id?: number | null;
  expense_account_id?: number | null;
}

export interface FixedAssetCategoryUpdateInput {
  code?: string;
  name?: string;
  depreciation_method?: string;
  useful_life_months?: number;
  residual_value_pct?: string;
  accum_depr_account_id?: number | null;
  expense_account_id?: number | null;
  is_active?: boolean;
}

// =============================================================================
// Fixed Asset
// =============================================================================

export interface FixedAsset {
  id: number;
  company_id: number;
  outlet_id: number | null;
  category_id: number | null;
  asset_tag: string | null;
  name: string;
  serial_number: string | null;
  purchase_cost: string | null;
  purchase_date: Date | null;
  disposed_at: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FixedAssetCreateInput {
  company_id: number;
  outlet_id?: number | null;
  category_id?: number | null;
  asset_tag?: string | null;
  name: string;
  serial_number?: string | null;
  purchase_cost?: string | null;
  purchase_date?: Date | null;
}

export interface FixedAssetUpdateInput {
  outlet_id?: number | null;
  category_id?: number | null;
  asset_tag?: string | null;
  name?: string;
  serial_number?: string | null;
  purchase_cost?: string | null;
  purchase_date?: Date | null;
  is_active?: boolean;
}

// =============================================================================
// Depreciation Plan (from posting/depreciation.ts pattern)
// =============================================================================

export interface DepreciationPlan {
  id: number;
  company_id: number;
  outlet_id: number | null;
  asset_id: number;
  method: DepreciationMethod;
  useful_life_months: number;
  start_date: Date;
  salvage_value: number;
  purchase_cost_snapshot: number;
  expense_account_id: number;
  accum_depr_account_id: number;
  status: DepreciationPlanStatus;
  created_at: Date;
  updated_at: Date;
}

export interface DepreciationPlanCreateInput {
  company_id: number;
  asset_id: number;
  outlet_id?: number | null;
  method: DepreciationMethod;
  useful_life_months: number;
  start_date: Date;
  salvage_value: number;
  purchase_cost_snapshot?: number;
  expense_account_id: number;
  accum_depr_account_id: number;
  status?: DepreciationPlanStatus;
}

export interface DepreciationPlanUpdateInput {
  outlet_id?: number | null;
  method?: DepreciationMethod;
  start_date?: Date;
  useful_life_months?: number;
  salvage_value?: number;
  expense_account_id?: number;
  accum_depr_account_id?: number;
  status?: DepreciationPlanStatus;
}

export interface DepreciationRun {
  id: number;
  plan_id: number;
  company_id: number;
  run_date: Date;
  period_year: number;
  period_month: number;
  amount: number;
  journal_batch_id: number | null;
  status: DepreciationRunStatus;
  created_at: Date;
  updated_at: Date;
}

export interface DepreciationRunCreateInput {
  plan_id: number;
  company_id: number;
  run_date: Date;
  period_year: number;
  period_month: number;
  amount: number;
  journal_batch_id?: number | null;
  status?: DepreciationRunStatus;
}

export type DepreciationRunResult = {
  run: DepreciationRun;
  duplicate: boolean;
};

// =============================================================================
// Lifecycle Events
// =============================================================================

export interface LifecycleEvent {
  id: number;
  asset_id: number;
  company_id: number;
  outlet_id: number | null;
  event_type: string;
  event_date: Date;
  event_data: Record<string, unknown> | null;
  created_by: number;
  journal_batch_id: number | null;
  status: string;
  idempotency_key: string;
  voided_at: Date | null;
  voided_by: number | null;
  created_at: Date;
}

export interface LifecycleEventCreateInput {
  asset_id: number;
  company_id: number;
  outlet_id?: number | null;
  event_type: string;
  event_date: Date;
  event_data?: string | null;
  created_by: number;
  idempotency_key: string;
}

// =============================================================================
// Asset Book (current book values)
// =============================================================================

export interface AssetBook {
  id: number;
  asset_id: number;
  company_id: number;
  cost_basis: string;
  accum_depreciation: string;
  accum_impairment: string;
  carrying_amount: string;
  last_event_id: number;
  as_of_date: Date;
  updated_at: Date;
}

export interface AssetBookUpsertInput {
  cost_basis: string;
  accum_depreciation: string;
  accum_impairment: string;
  carrying_amount: string;
  last_event_id: number;
  as_of_date: Date;
}

// =============================================================================
// Filter Types
// =============================================================================

export interface FixedAssetCategoryFilters {
  is_active?: boolean;
}

export interface FixedAssetFilters {
  outlet_id?: number | null;
  category_id?: number | null;
  is_active?: boolean;
  status?: FixedAssetStatus;
  allowedOutletIds?: number[];
}

export interface DepreciationPlanFilters {
  asset_id?: number;
  status?: DepreciationPlanStatus;
}

export interface DepreciationRunFilters {
  plan_id?: number;
  status?: DepreciationRunStatus;
  period_year?: number;
  period_month?: number;
}

export interface LifecycleEventFilters {
  asset_id?: number;
  event_type?: LifecycleEventType;
  status?: LifecycleEventStatus;
}

// =============================================================================
// Lifecycle Input/Output Types
// =============================================================================

export interface AcquisitionInput {
  outlet_id?: number | null;
  event_date: string;
  cost: number;
  useful_life_months: number;
  salvage_value?: number;
  asset_account_id: number;
  offset_account_id: number;
  expense_account_id?: number;
  accum_depr_account_id?: number;
  notes?: string;
  idempotency_key?: string;
}

export interface AcquisitionResult {
  event_id: number;
  journal_batch_id: number;
  book: {
    cost_basis: number;
    carrying_amount: number;
  };
  duplicate: boolean;
}

export interface TransferInput {
  to_outlet_id: number;
  transfer_date: string;
  notes?: string;
  idempotency_key?: string;
}

export interface TransferResult {
  event_id: number;
  journal_batch_id: number | null;
  to_outlet_id: number;
  duplicate: boolean;
}

export interface ImpairmentInput {
  impairment_date: string;
  impairment_amount: number;
  reason: string;
  expense_account_id: number;
  accum_impairment_account_id: number;
  idempotency_key?: string;
}

export interface ImpairmentResult {
  event_id: number;
  journal_batch_id: number;
  book: {
    carrying_amount: number;
    accum_impairment: number;
  };
  duplicate: boolean;
}

export interface DisposalInput {
  disposal_date: string;
  disposal_type: "SALE" | "SCRAP";
  proceeds?: number;
  disposal_cost?: number;
  cash_account_id: number;
  asset_account_id: number;
  accum_depr_account_id: number;
  accum_impairment_account_id?: number;
  gain_account_id?: number;
  loss_account_id?: number;
  disposal_expense_account_id?: number;
  notes?: string;
  idempotency_key?: string;
}

export interface DisposalResult {
  event_id: number;
  journal_batch_id: number;
  disposal: {
    proceeds: number;
    cost_removed: number;
    gain_loss: number;
  };
  book: {
    carrying_amount: number;
  };
  duplicate: boolean;
}

export interface VoidEventInput {
  void_reason: string;
  idempotency_key?: string;
}

export interface VoidResult {
  void_event_id: number;
  original_event_id: number;
  journal_batch_id: number | null;
  duplicate: boolean;
}

export interface LedgerEntry {
  id: number;
  event_type: string;
  event_date: string;
  journal_batch_id: number | null;
  status: string;
  event_data: Record<string, unknown>;
}

export interface LedgerResult {
  asset_id: number;
  events: LedgerEntry[];
}

export interface BookResult {
  asset_id: number;
  cost_basis: number;
  accum_depreciation: number;
  accum_impairment: number;
  carrying_amount: number;
  as_of_date: string;
  last_event_id: number;
}
