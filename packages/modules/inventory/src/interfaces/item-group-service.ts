// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Item group service interface for inventory module.
 * All methods require company_id scoping.
 */

import type { MutationAuditActor } from "./shared.js";

export type ItemGroup = {
  id: number;
  company_id: number;
  parent_id: number | null;
  code: string | null;
  name: string;
  is_active: boolean;
  updated_at: string;
};

export class ItemGroupBulkConflictError extends Error {
  constructor(
    message: string,
    public readonly code: "DUPLICATE_CODE" | "CODE_EXISTS" | "PARENT_CODE_NOT_FOUND" | "CYCLE_DETECTED"
  ) {
    super(message);
  }
}

export interface ItemGroupService {
  /**
   * List all item groups for a company, optionally filtered by active status.
   * @param companyId - The company ID (required)
   * @param filters - Optional filters
   */
  listItemGroups(companyId: number, filters?: { isActive?: boolean }): Promise<ItemGroup[]>;

  /**
   * Find a single item group by ID.
   * @param companyId - The company ID (required)
   * @param groupId - The item group ID
   */
  findItemGroupById(companyId: number, groupId: number): Promise<ItemGroup | null>;

  /**
   * Create a new item group.
   * @param companyId - The company ID (required)
   * @param input - Item group creation input
   * @param actor - Optional audit actor
   */
  createItemGroup(
    companyId: number,
    input: {
      code?: string | null;
      name: string;
      parent_id?: number | null;
      is_active?: boolean;
    },
    actor?: MutationAuditActor
  ): Promise<ItemGroup>;

  /**
   * Create multiple item groups in bulk with cycle detection.
   * @param companyId - The company ID (required)
   * @param rows - Array of item group rows
   * @param actor - Optional audit actor
   */
  createItemGroupsBulk(
    companyId: number,
    rows: Array<{
      code: string | null;
      name: string;
      parent_code: string | null;
      is_active?: boolean;
    }>,
    actor?: MutationAuditActor
  ): Promise<{ created_count: number; groups: ItemGroup[] }>;

  /**
   * Update an existing item group.
   * @param companyId - The company ID (required)
   * @param groupId - The item group ID
   * @param input - Item group update input
   * @param actor - Optional audit actor
   */
  updateItemGroup(
    companyId: number,
    groupId: number,
    input: {
      code?: string | null;
      name?: string;
      parent_id?: number | null;
      is_active?: boolean;
    },
    actor?: MutationAuditActor
  ): Promise<ItemGroup | null>;

  /**
   * Delete an item group.
   * @param companyId - The company ID (required)
   * @param groupId - The item group ID
   * @param actor - Optional audit actor
   * @returns true if deleted, false if not found
   */
  deleteItemGroup(companyId: number, groupId: number, actor?: MutationAuditActor): Promise<boolean>;
}
