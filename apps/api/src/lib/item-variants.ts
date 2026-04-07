// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Item variants module adapter.
 * 
 * This adapter wires the @jurnapod/modules-inventory package interfaces
 * to the existing API lib implementations.
 * 
 * Story 23-3-5: Now delegates to the modules-inventory service implementation.
 * 
 * Note: This file maintains backward compatibility by re-exporting error classes
 * and delegating function calls to the inventory module.
 */

import { itemVariantService } from "@jurnapod/modules-inventory";

// Re-export error classes for backward compatibility
export { DuplicateSkuError, VariantNotFoundError, AttributeNotFoundError, ItemNotFoundError } from "@jurnapod/modules-inventory";

// Re-export types from shared
export type {
  CreateVariantAttributeRequest,
  UpdateVariantAttributeRequest,
  UpdateVariantRequest,
  ItemVariantResponse,
  VariantAttribute,
  SyncPullVariant
} from "@jurnapod/shared";

// Re-export the variant service
export const variantService = itemVariantService;

// Re-export all functions from the service for backward compatibility by delegating to the service instance
export const listVariantAttributes = itemVariantService.listVariantAttributes.bind(itemVariantService);
export const createVariantAttribute = itemVariantService.createVariantAttribute.bind(itemVariantService);
export const updateVariantAttribute = itemVariantService.updateVariantAttribute.bind(itemVariantService);
export const deleteVariantAttribute = itemVariantService.deleteVariantAttribute.bind(itemVariantService);
export const getItemById = itemVariantService.getItemById.bind(itemVariantService);
export const getItemVariants = itemVariantService.getItemVariants.bind(itemVariantService);
export const getVariantById = itemVariantService.getVariantById.bind(itemVariantService);
export const updateVariant = itemVariantService.updateVariant.bind(itemVariantService);
export const getVariantEffectivePrice = itemVariantService.getVariantEffectivePrice.bind(itemVariantService);
export const adjustVariantStock = itemVariantService.adjustVariantStock.bind(itemVariantService);
export const validateVariantSku = itemVariantService.validateVariantSku.bind(itemVariantService);
export const getVariantsForSync = itemVariantService.getVariantsForSync.bind(itemVariantService);