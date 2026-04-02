// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplies service interface for inventory module.
 * All methods require company_id scoping.
 */

import type { MutationAuditActor } from "./shared.js";

export interface Supply {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  unit: string;
  is_active: boolean;
  updated_at: string;
}

export interface CreateSupplyInput {
  sku?: string | null;
  name: string;
  unit?: string;
  is_active?: boolean;
}

export interface UpdateSupplyInput {
  sku?: string | null;
  name?: string;
  unit?: string;
  is_active?: boolean;
}

export interface ListSuppliesFilters {
  isActive?: boolean;
}

export interface SuppliesService {
  /**
   * List all supplies for a company.
   */
  listSupplies(companyId: number, filters?: ListSuppliesFilters): Promise<Supply[]>;

  /**
   * Find a supply by ID.
   */
  findSupplyById(companyId: number, supplyId: number): Promise<Supply | null>;

  /**
   * Create a new supply.
   */
  createSupply(
    companyId: number,
    input: CreateSupplyInput,
    actor?: MutationAuditActor
  ): Promise<Supply>;

  /**
   * Update an existing supply.
   */
  updateSupply(
    companyId: number,
    supplyId: number,
    input: UpdateSupplyInput,
    actor?: MutationAuditActor
  ): Promise<Supply | null>;

  /**
   * Delete a supply.
   */
  deleteSupply(
    companyId: number,
    supplyId: number,
    actor?: MutationAuditActor
  ): Promise<boolean>;
}
