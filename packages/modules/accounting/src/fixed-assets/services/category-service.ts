// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Category Service for Fixed Assets
 *
 * Handles CRUD operations for fixed asset categories.
 * All operations are scoped to a company.
 */

import type {
  FixedAssetCategory,
  FixedAssetCategoryCreateInput,
  FixedAssetCategoryUpdateInput,
  FixedAssetCategoryFilters,
} from "../interfaces/types.js";
import type { FixedAssetRepository } from "../repositories/index.js";
import {
  FixedAssetCategoryNotFoundError,
  FixedAssetCategoryNotEmptyError,
  FixedAssetCategoryCodeExistsError,
  isDuplicateKeyError,
} from "../errors.js";

export type MutationAuditActor = {
  userId: number;
  canManageCompanyDefaults?: boolean;
};

export interface CategoryServiceOptions {
  repository: FixedAssetRepository;
}

/**
 * CategoryService provides business logic for fixed asset categories.
 */
export class CategoryService {
  private readonly repo: FixedAssetRepository;

  constructor(options: CategoryServiceOptions) {
    this.repo = options.repository;
  }

  /**
   * List categories for a company.
   */
  async list(
    companyId: number,
    filters?: FixedAssetCategoryFilters
  ): Promise<FixedAssetCategory[]> {
    return this.repo.listCategories(companyId, filters);
  }

  /**
   * Get a single category by ID.
   */
  async getById(companyId: number, categoryId: number): Promise<FixedAssetCategory | null> {
    return this.repo.findCategoryById(categoryId, companyId);
  }

  /**
   * Get a single category by ID, throwing if not found.
   */
  async getByIdOrThrow(companyId: number, categoryId: number): Promise<FixedAssetCategory> {
    const category = await this.repo.findCategoryById(categoryId, companyId);
    if (!category) {
      throw new FixedAssetCategoryNotFoundError();
    }
    return category;
  }

  /**
   * Create a new category.
   */
  async create(
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
    _actor?: MutationAuditActor
  ): Promise<FixedAssetCategory> {
    // Check for duplicate code
    const existing = await this.repo.findCategoryByCode(input.code, companyId);
    if (existing) {
      throw new FixedAssetCategoryCodeExistsError();
    }

    const createInput: FixedAssetCategoryCreateInput = {
      company_id: companyId,
      code: input.code,
      name: input.name,
      depreciation_method: input.depreciation_method ?? "STRAIGHT_LINE",
      useful_life_months: input.useful_life_months,
      residual_value_pct: input.residual_value_pct !== undefined ? String(input.residual_value_pct) : "0",
      expense_account_id: input.expense_account_id,
      accum_depr_account_id: input.accum_depr_account_id,
    };

    try {
      return await this.repo.createCategory(createInput);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new FixedAssetCategoryCodeExistsError();
      }
      throw error;
    }
  }

  /**
   * Update an existing category.
   */
  async update(
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
    _actor?: MutationAuditActor
  ): Promise<FixedAssetCategory> {
    // Ensure category exists
    const existing = await this.repo.findCategoryById(categoryId, companyId);
    if (!existing) {
      throw new FixedAssetCategoryNotFoundError();
    }

    // Check for duplicate code if code is being changed
    if (input.code && input.code !== existing.code) {
      const duplicate = await this.repo.findCategoryByCode(input.code, companyId);
      if (duplicate) {
        throw new FixedAssetCategoryCodeExistsError();
      }
    }

    const updateInput: FixedAssetCategoryUpdateInput = {};
    if (input.code !== undefined) updateInput.code = input.code;
    if (input.name !== undefined) updateInput.name = input.name;
    if (input.depreciation_method !== undefined) updateInput.depreciation_method = input.depreciation_method;
    if (input.useful_life_months !== undefined) updateInput.useful_life_months = input.useful_life_months;
    if (input.residual_value_pct !== undefined) updateInput.residual_value_pct = String(input.residual_value_pct);
    if (input.expense_account_id !== undefined) updateInput.expense_account_id = input.expense_account_id;
    if (input.accum_depr_account_id !== undefined) updateInput.accum_depr_account_id = input.accum_depr_account_id;
    if (input.is_active !== undefined) updateInput.is_active = input.is_active;

    try {
      return await this.repo.updateCategory(categoryId, companyId, updateInput);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new FixedAssetCategoryCodeExistsError();
      }
      throw error;
    }
  }

  /**
   * Delete a category.
   * Throws FixedAssetCategoryNotEmptyError if the category has associated assets.
   */
  async delete(
    companyId: number,
    categoryId: number,
    _actor?: MutationAuditActor
  ): Promise<void> {
    // Ensure category exists
    const existing = await this.repo.findCategoryById(categoryId, companyId);
    if (!existing) {
      throw new FixedAssetCategoryNotFoundError();
    }

    // Check for child assets
    const assetCount = await this.repo.countAssetsByCategory(categoryId, companyId);
    if (assetCount > 0) {
      throw new FixedAssetCategoryNotEmptyError();
    }

    await this.repo.deleteCategory(categoryId, companyId);
  }
}
