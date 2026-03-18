// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useMemo, useState, useCallback, useRef } from "react";
import type { RuntimeProductCatalogItem, RuntimeProductCatalogItemVariant } from "../../services/runtime-service.js";
import { API_CONFIG } from "../../shared/utils/constants.js";

export interface UseProductsOptions {
  catalog: RuntimeProductCatalogItem[];
  onBarcodeMatch?: (product: RuntimeProductCatalogItem, variantId?: number) => void;
}

// Minimal type for API response (mirrors BarcodeLookupResponse from @jurnapod/shared)
interface BarcodeLookupApiItem {
  id: number;
  name: string;
  sku: string;
  barcode: string;
  base_price: number;
  image_thumbnail_url: string | null;
  variants?: Array<{
    id: number;
    sku: string;
    variant_name: string;
    barcode: string;
    price: number;
  }>;
}

interface BarcodeLookupApiResponse {
  items: BarcodeLookupApiItem[];
}

export interface BarcodeMatch {
  product: RuntimeProductCatalogItem;
  variant?: RuntimeProductCatalogItemVariant;
}

export interface BarcodeLookupResult {
  product: RuntimeProductCatalogItem | null;
  matches: RuntimeProductCatalogItem[];
  error: string | null;
  isLoading: boolean;
}

export interface UseProductsReturn {
  visibleProducts: RuntimeProductCatalogItem[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  barcodeLookup: BarcodeLookupResult;
  performBarcodeLookup: (barcode: string, accessToken: string | null, isOnline: boolean) => Promise<void>;
  clearBarcodeLookup: () => void;
  localBarcodeMatch: BarcodeMatch | null;
  localBarcodeMatches: BarcodeMatch[];
  clearLocalBarcodeMatches: () => void;
}

/**
 * Check if a search term looks like a barcode.
 *
 * HEURISTIC RULES:
 * - Numeric-only strings (6-20 chars): Likely EAN-13 (13 digits) or UPC (12 digits)
 * - Long alphanumeric strings (20+ chars): Likely Code 128 or other 1D/2D barcodes
 * - Short alphanumeric with letters (6-19 chars): Likely SKU search, NOT barcode
 *
 * This prevents alphanumeric SKU queries (e.g., "ABC123", "SHIRT-L") from being
 * incorrectly treated as barcode scans, ensuring they follow the text search path.
 */
function looksLikeBarcode(term: string): boolean {
  const trimmed = term.trim();
  if (trimmed.length < 6 || trimmed.length > 50) return false;

  // Must be alphanumeric (allow underscore/hyphen as some barcode formats include them)
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return false;

  // Numeric-only: treat as barcode (EAN-13, UPC-A, etc.)
  if (/^\d+$/.test(trimmed)) return true;

  // Contains letters: only treat as barcode if very long (Code 128 style)
  // Short alphanumeric strings are likely SKU searches
  return trimmed.length >= 20;
}

/**
 * Find exact barcode matches in local catalog.
 * Searches product barcodes first, then variant barcodes.
 * Returns all matches (could be multiple variant matches for same product).
 */
function findLocalBarcodeMatches(
  catalog: RuntimeProductCatalogItem[],
  barcode: string
): BarcodeMatch[] {
  const matches: BarcodeMatch[] = [];
  const normalizedBarcode = barcode.trim();

  for (const product of catalog) {
    // Check product-level barcode (exact match)
    if (product.barcode && product.barcode === normalizedBarcode) {
      matches.push({ product });
      continue;
    }

    // Check variant barcodes
    if (product.variants && product.variants.length > 0) {
      for (const variant of product.variants) {
        if (variant.barcode && variant.barcode === normalizedBarcode) {
          matches.push({ product, variant });
        }
      }
    }
  }

  return matches;
}

/**
 * Map BarcodeLookupResponse item to RuntimeProductCatalogItem.
 */
function mapApiItemToCatalogItem(item: BarcodeLookupApiItem): RuntimeProductCatalogItem {
  return {
    item_id: item.id,
    sku: item.sku,
    barcode: item.barcode ?? null,
    thumbnail_url: item.image_thumbnail_url ?? null,
    name: item.name,
    item_type: "PRODUCT",
    price_snapshot: item.base_price,
    has_variants: item.variants && item.variants.length > 0,
    variants: item.variants?.map((v: { id: number; variant_name: string; price: number; barcode: string }) => ({
      variant_id: v.id,
      variant_name: v.variant_name,
      price: v.price,
      stock_quantity: 0, // Stock not available in lookup response
      barcode: v.barcode ?? null
    }))
  };
}

export function useProducts({
  catalog,
  onBarcodeMatch
}: UseProductsOptions): UseProductsReturn {
  const [searchTerm, setSearchTermState] = useState<string>("");
  const [barcodeLookup, setBarcodeLookup] = useState<BarcodeLookupResult>({
    product: null,
    matches: [],
    error: null,
    isLoading: false
  });
  const [localBarcodeMatch, setLocalBarcodeMatch] = useState<BarcodeMatch | null>(null);
  const [localBarcodeMatches, setLocalBarcodeMatches] = useState<BarcodeMatch[]>([]);

  // Ref-based deduplication guard for barcode scans
  const lastProcessedBarcodeRef = useRef<{ barcode: string; timestamp: number } | null>(null);
  const BARCODE_DEDUPE_WINDOW_MS = 500;

  const clearLocalBarcodeMatches = useCallback(() => {
    setLocalBarcodeMatches([]);
    setLocalBarcodeMatch(null);
  }, []);

  const setSearchTerm = useCallback((term: string) => {
    setSearchTermState(term);

    // Clear previous barcode matches
    setLocalBarcodeMatch(null);
    setLocalBarcodeMatches([]);
    setBarcodeLookup({ product: null, matches: [], error: null, isLoading: false });

    // Check for local barcode matches on exact input (trimmed)
    const trimmedTerm = term.trim();
    if (looksLikeBarcode(trimmedTerm)) {
      const matches = findLocalBarcodeMatches(catalog, trimmedTerm);

      // Auto-add on single unique match (no confirmation per requirements)
      if (matches.length === 1) {
        const match = matches[0];
        const now = Date.now();
        const lastProcessed = lastProcessedBarcodeRef.current;

        // Deduplication guard: prevent duplicate scans within 500ms window
        if (lastProcessed &&
            lastProcessed.barcode === trimmedTerm &&
            now - lastProcessed.timestamp < BARCODE_DEDUPE_WINDOW_MS) {
          // Skip duplicate scan
          return;
        }

        // Update deduplication guard
        lastProcessedBarcodeRef.current = { barcode: trimmedTerm, timestamp: now };

        setLocalBarcodeMatch(match);
        // Trigger auto-add via callback
        onBarcodeMatch?.(match.product, match.variant?.variant_id);
      } else if (matches.length > 1) {
        // Multiple matches - store them for selection modal
        setLocalBarcodeMatches(matches);
      }
      // If no matches, API lookup will be triggered by parent component
    }
  }, [catalog, onBarcodeMatch]);

  const visibleProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return catalog;
    }

    // If this is a barcode search, don't filter visible products
    // The barcode match handler will take care of adding to cart
    if (looksLikeBarcode(searchTerm.trim())) {
      return catalog;
    }

    // Regular text search (name, SKU, or barcode partial match)
    return catalog.filter((product) => {
      const haystack = `${product.name} ${product.sku ?? ""} ${product.barcode ?? ""}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [catalog, searchTerm]);

  const performBarcodeLookup = useCallback(async (
    barcode: string,
    accessToken: string | null,
    isOnline: boolean
  ): Promise<void> => {
    // Reset state
    setBarcodeLookup({ product: null, matches: [], error: null, isLoading: true });

    // Validate prerequisites
    if (!looksLikeBarcode(barcode)) {
      setBarcodeLookup({ product: null, matches: [], error: null, isLoading: false });
      return;
    }

    if (!isOnline) {
      setBarcodeLookup({ product: null, matches: [], error: null, isLoading: false });
      return;
    }

    if (!accessToken) {
      setBarcodeLookup({
        product: null,
        matches: [],
        error: "Authentication required for barcode lookup. Please sign in again.",
        isLoading: false
      });
      return;
    }

    try {
      const response = await fetch(
        `${API_CONFIG.baseUrl}/api/inventory/items/lookup/barcode/${encodeURIComponent(barcode.trim())}`,
        {
          method: "GET",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${accessToken}`
          }
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          setBarcodeLookup({
            product: null,
            matches: [],
            error: `Product not found for barcode: ${barcode}`,
            isLoading: false
          });
          return;
        }
        throw new Error(`API returned ${response.status}`);
      }

      const payload = await response.json() as { success: boolean; data?: BarcodeLookupApiResponse };

      if (!payload.success || !payload.data || payload.data.items.length === 0) {
        setBarcodeLookup({
          product: null,
          matches: [],
          error: `Product not found for barcode: ${barcode}`,
          isLoading: false
        });
        return;
      }

      // Map all matching items to catalog items
      const catalogItems = payload.data.items.map(mapApiItemToCatalogItem);

      // Return all matches - let parent component decide how to handle them
      setBarcodeLookup({
        product: null,
        matches: catalogItems,
        error: null,
        isLoading: false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error during barcode lookup";
      setBarcodeLookup({
        product: null,
        matches: [],
        error: `Barcode lookup failed: ${message}`,
        isLoading: false
      });
    }
  }, []);

  const clearBarcodeLookup = useCallback(() => {
    setBarcodeLookup({ product: null, matches: [], error: null, isLoading: false });
  }, []);

  return {
    visibleProducts,
    searchTerm,
    setSearchTerm,
    barcodeLookup,
    performBarcodeLookup,
    clearBarcodeLookup,
    localBarcodeMatch,
    localBarcodeMatches,
    clearLocalBarcodeMatches
  };
}
