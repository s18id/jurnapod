// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Items module adapter.
 * 
 * This adapter wires the @jurnapod/modules-inventory package interfaces
 * to the existing API lib implementations.
 * 
 * Story 23-3-5: Now delegates to the modules-inventory service implementation.
 */

import { itemService } from "@jurnapod/modules-inventory";
import type { ItemService } from "@jurnapod/modules-inventory";

/**
 * Adapter implementing ItemService interface using modules-inventory.
 * 
 * This maintains backward compatibility while delegating to the
 * extracted modules-inventory package.
 */
export const itemsAdapter: ItemService = itemService;