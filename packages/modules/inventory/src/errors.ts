// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Module - Error Classes
 *
 * Error classes for inventory operations.
 */

export class InventoryConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class InventoryReferenceError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class InventoryForbiddenError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class ItemNotFoundError extends Error {
  constructor(itemId: number) {
    super(`Item ${itemId} not found`);
  }
}

export class ItemGroupNotFoundError extends Error {
  constructor(groupId: number) {
    super(`Item group ${groupId} not found`);
  }
}

export class ItemPriceNotFoundError extends Error {
  constructor(priceId: number) {
    super(`Item price ${priceId} not found`);
  }
}

export class VariantNotFoundError extends Error {
  constructor(variantId: number) {
    super(`Variant ${variantId} not found`);
  }
}

export class DuplicateSkuError extends Error {
  constructor(sku: string) {
    super(`SKU '${sku}' already exists`);
  }
}

export class AttributeNotFoundError extends Error {
  constructor(attributeId: number) {
    super(`Attribute ${attributeId} not found`);
  }
}