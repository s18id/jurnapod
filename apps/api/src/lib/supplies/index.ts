// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplies Service - Thin Adapter
 * 
 * This module delegates to modules-inventory services.
 * Maintains backward compatibility for API consumers.
 */

// Re-export types from modules-inventory
export type {
  Supply,
  CreateSupplyInput,
  UpdateSupplyInput,
  ListSuppliesFilters
} from "@jurnapod/modules-inventory";

// Re-export error classes from modules-inventory
export { InventoryConflictError as DatabaseConflictError } from "@jurnapod/modules-inventory";

// Import service singleton from modules-inventory
import { suppliesService } from "@jurnapod/modules-inventory";

/**
 * List all supplies for a company.
 */
export async function listSupplies(companyId: number, filters?: { isActive?: boolean }) {
  return suppliesService.listSupplies(companyId, filters);
}

/**
 * Find a supply by ID.
 */
export async function findSupplyById(companyId: number, supplyId: number) {
  return suppliesService.findSupplyById(companyId, supplyId);
}

/**
 * Create a new supply.
 */
export async function createSupply(
  companyId: number,
  input: {
    sku?: string | null;
    name: string;
    unit?: string;
    is_active?: boolean;
  },
  actor?: { userId: number; canManageCompanyDefaults?: boolean }
) {
  return suppliesService.createSupply(companyId, input, actor);
}

/**
 * Update an existing supply.
 */
export async function updateSupply(
  companyId: number,
  supplyId: number,
  input: {
    sku?: string | null;
    name?: string;
    unit?: string;
    is_active?: boolean;
  },
  actor?: { userId: number; canManageCompanyDefaults?: boolean }
) {
  return suppliesService.updateSupply(companyId, supplyId, input, actor);
}

/**
 * Delete a supply.
 */
export async function deleteSupply(
  companyId: number,
  supplyId: number,
  actor?: { userId: number; canManageCompanyDefaults?: boolean }
): Promise<boolean> {
  return suppliesService.deleteSupply(companyId, supplyId, actor);
}
