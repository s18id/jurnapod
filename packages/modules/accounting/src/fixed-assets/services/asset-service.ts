// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Asset Service for Fixed Assets
 *
 * Handles CRUD operations for fixed assets.
 * All operations are scoped to a company.
 */

import type {
  FixedAsset,
  FixedAssetCreateInput,
  FixedAssetUpdateInput,
  FixedAssetFilters,
  AssetBook,
  AssetBookUpsertInput,
} from "../interfaces/types.js";
import type { FixedAssetRepository } from "../repositories/index.js";
import type { FixedAssetPorts } from "../interfaces/fixed-asset-ports.js";
import {
  FixedAssetNotFoundError,
  FixedAssetHasEventsError,
  FixedAssetAccessDeniedError,
} from "../errors.js";

export type MutationAuditActor = {
  userId: number;
  canManageCompanyDefaults?: boolean;
};

export interface AssetServiceOptions {
  repository: FixedAssetRepository;
  ports: FixedAssetPorts;
}

/**
 * AssetService provides business logic for fixed assets.
 */
export class AssetService {
  private readonly repo: FixedAssetRepository;
  private readonly ports: FixedAssetPorts;

  constructor(options: AssetServiceOptions) {
    this.repo = options.repository;
    this.ports = options.ports;
  }

  /**
   * List assets for a company.
   */
  async list(companyId: number, filters?: FixedAssetFilters): Promise<FixedAsset[]> {
    return this.repo.listAssets(companyId, filters);
  }

  /**
   * Get a single asset by ID.
   */
  async getById(companyId: number, assetId: number): Promise<FixedAsset | null> {
    return this.repo.findAssetById(assetId, companyId);
  }

  /**
   * Get a single asset by ID, throwing if not found.
   */
  async getByIdOrThrow(companyId: number, assetId: number): Promise<FixedAsset> {
    const asset = await this.repo.findAssetById(assetId, companyId);
    if (!asset) {
      throw new FixedAssetNotFoundError();
    }
    return asset;
  }

  /**
   * Create a new asset.
   * Creates the initial asset book entry as well.
   */
  async create(
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
    _actor?: MutationAuditActor
  ): Promise<FixedAsset> {
    // Validate outlet access if outlet is specified
    if (typeof input.outlet_id === "number" && _actor) {
      const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(
        _actor.userId,
        companyId,
        input.outlet_id
      );
      if (!hasAccess) {
        throw new FixedAssetAccessDeniedError();
      }
    }

    const createInput: FixedAssetCreateInput = {
      company_id: companyId,
      outlet_id: input.outlet_id,
      category_id: input.category_id,
      asset_tag: input.asset_tag,
      name: input.name,
      serial_number: input.serial_number,
      purchase_cost: input.purchase_cost !== undefined ? String(input.purchase_cost) : null,
      purchase_date: input.purchase_date ? new Date(input.purchase_date) : null,
    };

    const asset = await this.repo.createAsset(createInput);

    // Create initial asset book entry
    if (asset.purchase_cost) {
      const bookInput: AssetBookUpsertInput = {
        cost_basis: asset.purchase_cost,
        accum_depreciation: "0",
        accum_impairment: "0",
        carrying_amount: asset.purchase_cost,
        last_event_id: 0,
        as_of_date: new Date(),
      };
      await this.repo.upsertAssetBook(asset.id, companyId, bookInput);
    }

    return asset;
  }

  /**
   * Update an existing asset.
   */
  async update(
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
  ): Promise<FixedAsset> {
    // Ensure asset exists
    const existing = await this.repo.findAssetById(assetId, companyId);
    if (!existing) {
      throw new FixedAssetNotFoundError();
    }

    // Check outlet access if asset has outlet and actor is provided
    if (actor && existing.outlet_id != null) {
      const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(
        actor.userId,
        companyId,
        existing.outlet_id
      );
      if (!hasAccess) {
        throw new FixedAssetAccessDeniedError();
      }
    }

    // Validate new outlet access if being changed
    if (typeof input.outlet_id === "number" && actor) {
      const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(
        actor.userId,
        companyId,
        input.outlet_id
      );
      if (!hasAccess) {
        throw new FixedAssetAccessDeniedError();
      }
    }

    const updateInput: FixedAssetUpdateInput = {};
    if (input.outlet_id !== undefined) updateInput.outlet_id = input.outlet_id;
    if (input.category_id !== undefined) updateInput.category_id = input.category_id;
    if (input.asset_tag !== undefined) updateInput.asset_tag = input.asset_tag;
    if (input.name !== undefined) updateInput.name = input.name;
    if (input.serial_number !== undefined) updateInput.serial_number = input.serial_number;
    if (input.purchase_date !== undefined) updateInput.purchase_date = input.purchase_date ? new Date(input.purchase_date) : null;
    if (input.purchase_cost !== undefined) updateInput.purchase_cost = input.purchase_cost !== null ? String(input.purchase_cost) : null;
    if (input.is_active !== undefined) updateInput.is_active = input.is_active;

    return this.repo.updateAsset(assetId, companyId, updateInput);
  }

  /**
   * Delete an asset.
   * Throws FixedAssetHasEventsError if the asset has lifecycle events.
   */
  async delete(
    companyId: number,
    assetId: number,
    actor?: MutationAuditActor
  ): Promise<void> {
    // Ensure asset exists
    const existing = await this.repo.findAssetById(assetId, companyId);
    if (!existing) {
      throw new FixedAssetNotFoundError();
    }

    // Check outlet access if asset has outlet
    if (actor && existing.outlet_id != null) {
      const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(
        actor.userId,
        companyId,
        existing.outlet_id
      );
      if (!hasAccess) {
        throw new FixedAssetAccessDeniedError();
      }
    }

    // Check for lifecycle events
    const eventCount = await this.repo.countAssetEvents(assetId, companyId);
    if (eventCount > 0) {
      throw new FixedAssetHasEventsError();
    }

    await this.repo.deleteAsset(assetId, companyId);
  }

  /**
   * Get the current book values for an asset.
   */
  async getBook(companyId: number, assetId: number): Promise<AssetBook | null> {
    // Ensure asset exists
    const existing = await this.repo.findAssetById(assetId, companyId);
    if (!existing) {
      throw new FixedAssetNotFoundError();
    }

    return this.repo.findBookByAssetId(assetId, companyId);
  }
}
