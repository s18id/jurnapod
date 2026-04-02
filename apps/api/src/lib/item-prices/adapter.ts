// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Item prices module adapter.
 * 
 * This adapter wires the @jurnapod/modules-inventory package interfaces
 * to the existing API lib implementations.
 * 
 * Story 23-3-5: Now delegates to the modules-inventory service implementation.
 */

import { itemPriceService } from "@jurnapod/modules-inventory";
import type { ItemPriceService } from "@jurnapod/modules-inventory";

/**
 * Adapter implementing ItemPriceService interface using modules-inventory.
 */
export const itemPricesAdapter: ItemPriceService = itemPriceService;