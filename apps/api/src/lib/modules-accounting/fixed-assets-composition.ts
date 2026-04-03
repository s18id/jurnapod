// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Fixed Assets Service Composition
 * 
 * Wires together the fixed assets services from modules-accounting:
 * - FixedAssetRepository: database access adapter
 * - AccessScopeChecker: authorization adapter
 * - FiscalYearGuard: fiscal year validation adapter
 * 
 * This composition creates fully wired services:
 * - CategoryService
 * - AssetService
 * - DepreciationService
 * - LifecycleService
 */

import {
  CategoryService,
  AssetService,
  DepreciationService,
  LifecycleService,
} from "@jurnapod/modules-accounting";
import { createFixedAssetRepository, getFixedAssetRepository } from "./fixed-assets-db.js";
import { getAccessScopeChecker } from "./access-scope-checker.js";
import { getFiscalYearGuard } from "./fiscal-year-guard.js";

/**
 * Create a fully wired CategoryService.
 */
export function createComposedCategoryService(): CategoryService {
  const repository = createFixedAssetRepository();
  return new CategoryService({ repository });
}

/**
 * Create a fully wired AssetService.
 */
export function createComposedAssetService(): AssetService {
  const repository = getFixedAssetRepository();
  const accessScopeChecker = getAccessScopeChecker();
  const fiscalYearGuard = getFiscalYearGuard();
  
  return new AssetService({
    repository,
    ports: { accessScopeChecker, fiscalYearGuard }
  });
}

/**
 * Create a fully wired DepreciationService.
 */
export function createComposedDepreciationService(): DepreciationService {
  const repository = getFixedAssetRepository();
  const accessScopeChecker = getAccessScopeChecker();
  const fiscalYearGuard = getFiscalYearGuard();
  
  return new DepreciationService({
    repository,
    ports: { accessScopeChecker, fiscalYearGuard }
  });
}

/**
 * Create a fully wired LifecycleService.
 */
export function createComposedLifecycleService(): LifecycleService {
  const repository = getFixedAssetRepository();
  const accessScopeChecker = getAccessScopeChecker();
  const fiscalYearGuard = getFiscalYearGuard();
  
  return new LifecycleService({
    repository,
    ports: { accessScopeChecker, fiscalYearGuard }
  });
}

// Singleton instances for consistent reuse across the API
let _categoryService: CategoryService | null = null;
let _assetService: AssetService | null = null;
let _depreciationService: DepreciationService | null = null;
let _lifecycleService: LifecycleService | null = null;

export function getComposedCategoryService(): CategoryService {
  if (!_categoryService) {
    _categoryService = createComposedCategoryService();
  }
  return _categoryService;
}

export function getComposedAssetService(): AssetService {
  if (!_assetService) {
    _assetService = createComposedAssetService();
  }
  return _assetService;
}

export function getComposedDepreciationService(): DepreciationService {
  if (!_depreciationService) {
    _depreciationService = createComposedDepreciationService();
  }
  return _depreciationService;
}

export function getComposedLifecycleService(): LifecycleService {
  if (!_lifecycleService) {
    _lifecycleService = createComposedLifecycleService();
  }
  return _lifecycleService;
}

// =============================================================================
// Legacy wrapper functions for backward compatibility with API lib signatures
// These allow the test file to import from the new module structure
// =============================================================================

type MutationAuditActor = {
  userId: number;
  canManageCompanyDefaults?: boolean;
};

// Category wrappers
export async function listFixedAssetCategories(
  companyId: number,
  filters?: { isActive?: boolean }
) {
  return getComposedCategoryService().list(companyId, filters ? { is_active: filters.isActive } : undefined);
}

export async function findFixedAssetCategoryById(companyId: number, categoryId: number) {
  return getComposedCategoryService().getById(companyId, categoryId);
}

export async function createFixedAssetCategory(
  companyId: number,
  input: {
    code: string;
    name: string;
    depreciation_method?: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
    useful_life_months: number;
    residual_value_pct?: number;
    expense_account_id?: number | null;
    accum_depr_account_id?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return getComposedCategoryService().create(companyId, input, actor);
}

export async function updateFixedAssetCategory(
  companyId: number,
  categoryId: number,
  input: {
    code?: string;
    name?: string;
    depreciation_method?: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
    useful_life_months?: number;
    residual_value_pct?: number;
    expense_account_id?: number | null;
    accum_depr_account_id?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return getComposedCategoryService().update(companyId, categoryId, input, actor);
}

export async function deleteFixedAssetCategory(
  companyId: number,
  categoryId: number,
  _actor?: MutationAuditActor
): Promise<boolean> {
  try {
    await getComposedCategoryService().delete(companyId, categoryId, _actor);
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "FIXED_ASSET_CATEGORY_NOT_FOUND") return false;
    throw error;
  }
}

// Asset wrappers
export async function listFixedAssets(
  companyId: number,
  filters?: { outletId?: number; isActive?: boolean; allowedOutletIds?: number[] }
) {
  return getComposedAssetService().list(companyId, filters ? {
    outlet_id: filters.outletId,
    is_active: filters.isActive,
    allowedOutletIds: filters.allowedOutletIds,
  } : undefined);
}

export async function findFixedAssetById(companyId: number, assetId: number) {
  try {
    return await getComposedAssetService().getById(companyId, assetId);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "FIXED_ASSET_NOT_FOUND" || code === "FIXED_ASSET_ACCESS_DENIED") return null;
    throw error;
  }
}

export async function createFixedAsset(
  companyId: number,
  input: {
    outlet_id?: number | null;
    category_id?: number | null;
    asset_tag?: string | null;
    name: string;
    serial_number?: string | null;
    purchase_date?: string | null;
    purchase_cost?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return getComposedAssetService().create(companyId, input, actor);
}

export async function updateFixedAsset(
  companyId: number,
  assetId: number,
  input: {
    outlet_id?: number | null;
    category_id?: number | null;
    asset_tag?: string | null;
    name?: string;
    serial_number?: string | null;
    purchase_date?: string | null;
    purchase_cost?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  try {
    return await getComposedAssetService().update(companyId, assetId, input, actor);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "FIXED_ASSET_NOT_FOUND" || code === "FIXED_ASSET_ACCESS_DENIED") return null;
    throw error;
  }
}

export async function deleteFixedAsset(
  companyId: number,
  assetId: number,
  _actor?: MutationAuditActor
): Promise<boolean> {
  try {
    await getComposedAssetService().delete(companyId, assetId, _actor);
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "FIXED_ASSET_NOT_FOUND") return false;
    throw error;
  }
}
