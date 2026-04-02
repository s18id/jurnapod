// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Item variant service interface for inventory module.
 * All methods require company_id scoping.
 */

import type { MutationAuditActor } from "./shared.js";
import type {
  CreateVariantAttributeRequest,
  UpdateVariantAttributeRequest,
  UpdateVariantRequest,
  ItemVariantResponse,
  VariantAttribute,
  SyncPullVariant
} from "@jurnapod/shared";

export {
  type CreateVariantAttributeRequest,
  type UpdateVariantAttributeRequest,
  type UpdateVariantRequest,
  type ItemVariantResponse,
  type VariantAttribute,
  type SyncPullVariant
} from "@jurnapod/shared";

export interface ItemVariantService {
  /**
   * List variant attributes for an item.
   * @param companyId - The company ID (required)
   * @param itemId - The item ID
   */
  listVariantAttributes(companyId: number, itemId: number): Promise<VariantAttribute[]>;

  /**
   * Create a new variant attribute with values.
   * @param companyId - The company ID (required)
   * @param itemId - The item ID
   * @param input - Attribute creation input
   */
  createVariantAttribute(
    companyId: number,
    itemId: number,
    input: CreateVariantAttributeRequest
  ): Promise<VariantAttribute>;

  /**
   * Update an existing variant attribute.
   * @param companyId - The company ID (required)
   * @param attributeId - The attribute ID
   * @param input - Attribute update input
   */
  updateVariantAttribute(
    companyId: number,
    attributeId: number,
    input: UpdateVariantAttributeRequest
  ): Promise<VariantAttribute>;

  /**
   * Delete a variant attribute.
   * @param companyId - The company ID (required)
   * @param attributeId - The attribute ID
   */
  deleteVariantAttribute(companyId: number, attributeId: number): Promise<void>;

  /**
   * Get item by ID (for variant creation).
   * @param companyId - The company ID (required)
   * @param itemId - The item ID
   */
  getItemById(companyId: number, itemId: number): Promise<{ sku: string; price: number } | null>;

  /**
   * Get variants for an item.
   * @param companyId - The company ID (required)
   * @param itemId - The item ID
   */
  getItemVariants(companyId: number, itemId: number): Promise<ItemVariantResponse[]>;

  /**
   * Get a variant by ID.
   * @param companyId - The company ID (required)
   * @param variantId - The variant ID
   */
  getVariantById(companyId: number, variantId: number): Promise<ItemVariantResponse | null>;

  /**
   * Update a variant.
   * @param companyId - The company ID (required)
   * @param variantId - The variant ID
   * @param input - Variant update input
   */
  updateVariant(
    companyId: number,
    variantId: number,
    input: UpdateVariantRequest
  ): Promise<ItemVariantResponse>;

  /**
   * Get effective price for a variant.
   * @param companyId - The company ID (required)
   * @param variantId - The variant ID
   * @param outletId - Optional outlet ID
   */
  getVariantEffectivePrice(companyId: number, variantId: number, outletId?: number): Promise<number>;

  /**
   * Adjust variant stock.
   * @param companyId - The company ID (required)
   * @param variantId - The variant ID
   * @param adjustment - Stock adjustment amount
   * @param reason - Reason for adjustment
   */
  adjustVariantStock(
    companyId: number,
    variantId: number,
    adjustment: number,
    reason: string
  ): Promise<number>;

  /**
   * Validate SKU uniqueness.
   * @param companyId - The company ID (required)
   * @param sku - The SKU to validate
   * @param excludeVariantId - Optional variant ID to exclude
   */
  validateVariantSku(
    companyId: number,
    sku: string,
    excludeVariantId?: number
  ): Promise<{ valid: boolean; error?: string }>;

  /**
   * Get variants for sync.
   * @param companyId - The company ID (required)
   * @param outletId - Optional outlet ID
   */
  getVariantsForSync(companyId: number, outletId?: number): Promise<SyncPullVariant[]>;
}