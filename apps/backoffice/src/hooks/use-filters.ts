// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * useFilters Hook
 * 
 * Hook for managing filter state with URL synchronization.
 * Provides URL persistence, session storage fallback, and
 * deterministic query serialization.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type {
  FilterSchema,
  FilterValue,
} from "../components/ui/FilterBar/types";
import {
  getFilterDefaults,
  parseFiltersFromUrl,
  serializeFiltersToUrl,
} from "../components/ui/FilterBar/types";

// ============================================================================
// Storage Keys
// ============================================================================

const STORAGE_PREFIX = "filter_state_";

/**
 * Gets the session storage key for a given page/storageId
 */
function getStorageKey(storageId: string): string {
  return `${STORAGE_PREFIX}${storageId}`;
}

// ============================================================================
// Hook Types
// ============================================================================

export interface UseFiltersOptions {
  /** Filter schema definition */
  schema: FilterSchema;
  /** Unique identifier for this filter instance (used for session storage) */
  storageId: string;
  /** Callback when filters change */
  onFilterChange?: (filters: Record<string, FilterValue>) => void;
  /** Debounce delay for URL updates (default: 300ms) */
  urlUpdateDebounceMs?: number;
}

export interface UseFiltersReturn {
  /** Current filter values */
  filters: Record<string, FilterValue>;
  /** Set all filters at once */
  setFilters: (filters: Record<string, FilterValue>) => void;
  /** Update a single filter value */
  updateFilter: <K extends keyof Record<string, FilterValue>>(
    key: K,
    value: FilterValue
  ) => void;
  /** Clear all filters to defaults */
  clearFilters: () => void;
  /** Check if any filters are active (different from defaults) */
  hasActiveFilters: boolean;
  /** Get the default filter values */
  defaultFilters: Record<string, FilterValue>;
  /** Serialize current filters to URL string (without leading ?) */
  serializeToUrl: () => string;
  /** Parse filters from URL and merge with current state */
  parseFromUrl: (urlSearchParams: URLSearchParams) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse filter state from URL search params
 */
function parseFromUrl(
  schema: FilterSchema,
  searchParams: URLSearchParams
): Partial<Record<string, FilterValue>> {
  return parseFiltersFromUrl(schema, searchParams);
}

/**
 * Serialize filter state to URL search params string
 */
function serializeToUrlString(
  filters: Record<string, FilterValue>
): string {
  return serializeFiltersToUrl(filters);
}

/**
 * Parse filter state from sessionStorage
 */
function parseFromStorage(
  storageId: string
): Partial<Record<string, FilterValue>> | null {
  try {
    const stored = sessionStorage.getItem(getStorageKey(storageId));
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Serialize filter state to sessionStorage
 */
function serializeToStorage(
  storageId: string,
  filters: Record<string, FilterValue>
): void {
  try {
    sessionStorage.setItem(
      getStorageKey(storageId),
      JSON.stringify(filters)
    );
  } catch {
    // Ignore storage errors
  }
}

/**
 * Merge partial state with defaults
 */
function mergeWithDefaults(
  partial: Partial<Record<string, FilterValue>> | null,
  defaults: Record<string, FilterValue>
): Record<string, FilterValue> {
  if (!partial) {
    return { ...defaults };
  }

  const result: Record<string, FilterValue> = { ...defaults };

  for (const [key, value] of Object.entries(partial)) {
      if (value !== undefined) {
        result[key] = value;
      }
  }

  return result;
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook to manage filter state with URL and sessionStorage persistence.
 * 
 * Priority for initial state:
 * 1. URL query params (enables shareable URLs)
 * 2. sessionStorage (survives page refresh)
 * 3. Default state from schema
 * 
 * On change:
 * - Updates URL query params (for shareable URLs)
 * - Updates sessionStorage (for page refresh fallback)
 * - Calls onFilterChange callback
 * 
 * @example
 * ```tsx
 * const schema: FilterSchema = {
 *   fields: [
 *     { key: "search", type: "text", label: "Search" },
 *     { key: "status", type: "select", label: "Status", options: [...] },
 *   ],
 * };
 * 
 * const {
 *   filters,
 *   updateFilter,
 *   clearFilters,
 *   hasActiveFilters,
 * } = useFilters({ schema, storageId: "users-page" });
 * ```
 */
export function useFilters({
  schema,
  storageId,
  onFilterChange,
  urlUpdateDebounceMs = 300,
}: UseFiltersOptions): UseFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<Record<string, FilterValue>>(() => {
    const defaults = getFilterDefaults(schema);

    // Priority 1: URL params (for shared URLs)
    const fromUrl = parseFromUrl(schema, searchParams);
    if (Object.keys(fromUrl).length > 0) {
      return mergeWithDefaults(fromUrl, defaults);
    }

    // Priority 2: sessionStorage (for page refresh)
    const fromStorage = parseFromStorage(storageId);
    if (fromStorage) {
      return mergeWithDefaults(fromStorage, defaults);
    }

    // Priority 3: Default/initial state
    return defaults;
  });

  const urlUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUrlParamsRef = useRef<string>("");

  // Sync to URL and sessionStorage on change
  useEffect(() => {
    const newUrlParams = serializeToUrlString(filters);
    const currentUrlParams = lastUrlParamsRef.current;

    // Update sessionStorage immediately
    serializeToStorage(storageId, filters);

    // Debounce URL updates to prevent too many history entries
    if (urlUpdateTimeoutRef.current) {
      clearTimeout(urlUpdateTimeoutRef.current);
    }

    urlUpdateTimeoutRef.current = setTimeout(() => {
      if (currentUrlParams !== newUrlParams) {
        setSearchParams(new URLSearchParams(newUrlParams), {
          replace: true,
        });
        lastUrlParamsRef.current = newUrlParams;
      }
    }, urlUpdateDebounceMs);

    // Cleanup timeout on unmount
    return () => {
      if (urlUpdateTimeoutRef.current) {
        clearTimeout(urlUpdateTimeoutRef.current);
      }
    };
  }, [filters, storageId, setSearchParams, urlUpdateDebounceMs]);

  // Call onFilterChange when filters change
  useEffect(() => {
    if (onFilterChange) {
      onFilterChange(filters);
    }
  }, [filters, onFilterChange]);

  // Get default filters
  const defaultFilters = useMemo(
    () => getFilterDefaults(schema),
    [schema]
  );

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return Object.keys(filters).some(
      (key) => {
        const filterValue = filters[key];
        const defaultValue = defaultFilters[key];
        
        // Handle array comparison
        if (Array.isArray(filterValue) && Array.isArray(defaultValue)) {
          return JSON.stringify(filterValue) !== JSON.stringify(defaultValue);
        }
        
        return filterValue !== defaultValue;
      }
    );
  }, [filters, defaultFilters]);

  // Update single filter
  const updateFilter = useCallback(
    <K extends keyof Record<string, FilterValue>>(
      key: K,
      value: FilterValue
    ) => {
      setFilters((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    []
  );

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters({ ...defaultFilters });
  }, [defaultFilters]);

  // Serialize to URL
  const serializeToUrl = useCallback(() => {
    return serializeToUrlString(filters);
  }, [filters]);

  // Parse from URL
  const parseFromUrlAndMerge = useCallback(
    (urlSearchParams: URLSearchParams) => {
      const fromUrl = parseFromUrl(schema, urlSearchParams);
      setFilters((prev) => mergeWithDefaults(fromUrl, prev));
    },
    [schema]
  );

  return {
    filters,
    setFilters,
    updateFilter,
    clearFilters,
    hasActiveFilters,
    defaultFilters,
    serializeToUrl,
    parseFromUrl: parseFromUrlAndMerge,
  };
}

export default useFilters;
