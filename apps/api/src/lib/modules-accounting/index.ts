// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Modules Accounting Adapter
 * 
 * Provides adapters for integrating modules-accounting fixed assets services
 * with the API.
 */

export { createFixedAssetRepository, getFixedAssetRepository } from "./fixed-assets-db.js";
export { ApiAccessScopeChecker, getAccessScopeChecker } from "./access-scope-checker.js";
export { ApiFiscalYearGuard, getFiscalYearGuard } from "./fiscal-year-guard.js";
export {
  createComposedCategoryService,
  createComposedAssetService,
  createComposedDepreciationService,
  createComposedLifecycleService,
  getComposedCategoryService,
  getComposedAssetService,
  getComposedDepreciationService,
  getComposedLifecycleService,
  // Legacy wrapper exports for test compatibility
  listFixedAssetCategories,
  findFixedAssetCategoryById,
  createFixedAssetCategory,
  updateFixedAssetCategory,
  deleteFixedAssetCategory,
  listFixedAssets,
  findFixedAssetById,
  createFixedAsset,
  updateFixedAsset,
  deleteFixedAsset,
} from "./fixed-assets-composition.js";
