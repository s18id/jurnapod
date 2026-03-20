// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useMemo, useState } from "react";

export type FilterState = {
  search: string;
  status: "all" | "active" | "inactive";
  role: string;
  outlet: string;
  companyId: number | null;
};

const DEFAULT_FILTER_STATE: FilterState = {
  search: "",
  status: "active",
  role: "all",
  outlet: "all",
  companyId: null,
};

const STORAGE_KEY = "users-page-filters";

/**
 * Hook to manage filter state with sessionStorage persistence.
 * Serializes/deserializes filter state to URL-compatible format.
 */
export function useUrlFilterState(initialState: FilterState = DEFAULT_FILTER_STATE) {
  // Load initial state from sessionStorage
  const loadFromStorage = useCallback((): FilterState => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate and merge with defaults
        return {
          search: typeof parsed.search === "string" ? parsed.search : initialState.search,
          status: ["all", "active", "inactive"].includes(parsed.status) 
            ? parsed.status as FilterState["status"] 
            : initialState.status,
          role: typeof parsed.role === "string" ? parsed.role : initialState.role,
          outlet: typeof parsed.outlet === "string" ? parsed.outlet : initialState.outlet,
          companyId: typeof parsed.companyId === "number" ? parsed.companyId : initialState.companyId,
        };
      }
    } catch {
      // Ignore parse errors, use default
    }
    return initialState;
  }, [initialState]);

  const [filterState, setFilterState] = useState<FilterState>(loadFromStorage);

  // Serialize filter state to sessionStorage on change
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filterState));
    } catch {
      // Ignore storage errors
    }
  }, [filterState]);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setFilterState(DEFAULT_FILTER_STATE);
  }, []);

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return (
      filterState.search !== "" ||
      filterState.status !== "active" ||
      filterState.role !== "all" ||
      filterState.outlet !== "all" ||
      filterState.companyId !== null
    );
  }, [filterState]);

  // Update individual filter
  const updateFilter = useCallback(<K extends keyof FilterState>(
    key: K,
    value: FilterState[K]
  ) => {
    setFilterState((prev: FilterState) => ({ ...prev, [key]: value }));
  }, []);

  return {
    filterState,
    setFilterState,
    clearAllFilters,
    hasActiveFilters,
    updateFilter,
    DEFAULT_FILTER_STATE,
  };
}
