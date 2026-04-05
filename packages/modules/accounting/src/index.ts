// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { PostingRequest } from "@jurnapod/shared";
import type { JournalLine } from "@jurnapod/shared";
import type { PostingMapper } from "./posting/index.js";

export * from "./posting/index.js";
export * from "./accounts-service";
export * from "./account-types-service";
export * from "./journals-service";
export * from "./reconciliation/index.js";
export * from "./reconciliation/subledger/index.js";
// Fixed assets subdomain - re-exported with conflict resolution for DepreciationPlan/DepreciationRun
// (Those types are already exported from posting/ with different meanings)
export {
  CategoryService,
  AssetService,
  DepreciationService,
  LifecycleService,
  FixedAssetRepository,
} from "./fixed-assets/index.js";
// Fixed assets domain errors
export * from "./fixed-assets/errors.js";
export type {
  FixedAssetCategory,
  FixedAssetCategoryCreateInput,
  FixedAssetCategoryUpdateInput,
  FixedAssetCategoryFilters,
  FixedAsset,
  FixedAssetCreateInput,
  FixedAssetUpdateInput,
  AssetBook,
  LifecycleEvent,
  LifecycleEventCreateInput,
  LifecycleEventFilters,
  // FixedAssetDepreciationPlan and FixedAssetDepreciationRun avoid conflict with posting types
  DepreciationPlan as FixedAssetDepreciationPlan,
  DepreciationPlanCreateInput,
  DepreciationRun as FixedAssetDepreciationRun,
  DepreciationRunCreateInput,
  DepreciationRunFilters,
  // Port types
  FixedAssetPorts,
  AccessScopeChecker,
  FiscalYearGuard,
  FiscalYearContext,
  // Status constants
  FIXED_ASSET_STATUS,
  DEPRECIATION_METHOD,
  DEPRECIATION_PLAN_STATUS,
  DEPRECIATION_RUN_STATUS,
  LIFECYCLE_EVENT_TYPE,
  LIFECYCLE_EVENT_STATUS,
} from "./fixed-assets/index.js";

export class AccountingImportMapper implements PostingMapper {
  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    return [];
  }
}
