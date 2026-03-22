// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

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

const VALID_STATUSES = ["all", "active", "inactive"] as const;

/**
 * Parse filter state from URL search params.
 */
function parseFromUrl(searchParams: URLSearchParams): Partial<FilterState> {
  const parsed: Partial<FilterState> = {};

  const search = searchParams.get("search");
  if (search !== null) {
    parsed.search = search;
  }

  const status = searchParams.get("status");
  if (status !== null && VALID_STATUSES.includes(status as FilterState["status"])) {
    parsed.status = status as FilterState["status"];
  }

  const role = searchParams.get("role");
  if (role !== null) {
    parsed.role = role;
  }

  const outlet = searchParams.get("outlet");
  if (outlet !== null) {
    parsed.outlet = outlet;
  }

  const companyIdStr = searchParams.get("companyId");
  if (companyIdStr !== null) {
    const companyId = parseInt(companyIdStr, 10);
    if (!isNaN(companyId)) {
      parsed.companyId = companyId;
    }
  }

  return parsed;
}

/**
 * Serialize filter state to URL search params.
 */
function serializeToUrl(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.search) {
    params.set("search", state.search);
  }
  if (state.status !== "active") {
    params.set("status", state.status);
  }
  if (state.role !== "all") {
    params.set("role", state.role);
  }
  if (state.outlet !== "all") {
    params.set("outlet", state.outlet);
  }
  if (state.companyId !== null) {
    params.set("companyId", String(state.companyId));
  }

  return params;
}

/**
 * Parse filter state from sessionStorage.
 */
function parseFromStorage(): Partial<FilterState> | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Merge partial state with defaults.
 */
function mergeWithDefaults(partial: Partial<FilterState> | null): FilterState {
  if (!partial) {
    return { ...DEFAULT_FILTER_STATE };
  }
  return {
    search: typeof partial.search === "string" ? partial.search : DEFAULT_FILTER_STATE.search,
    status: VALID_STATUSES.includes(partial.status as FilterState["status"])
      ? (partial.status as FilterState["status"])
      : DEFAULT_FILTER_STATE.status,
    role: typeof partial.role === "string" ? partial.role : DEFAULT_FILTER_STATE.role,
    outlet: typeof partial.outlet === "string" ? partial.outlet : DEFAULT_FILTER_STATE.outlet,
    companyId: typeof partial.companyId === "number" ? partial.companyId : DEFAULT_FILTER_STATE.companyId,
  };
}

/**
 * Hook to manage filter state with URL query parameter persistence.
 * 
 * Priority for initial state:
 * 1. URL query params (enables shareable URLs)
 * 2. sessionStorage (survives page refresh)
 * 3. Default state
 * 
 * On change:
 * - Updates URL query params (for shareable URLs)
 * - Updates sessionStorage (for page refresh fallback)
 */
export function useUrlFilterState(initialState: FilterState = DEFAULT_FILTER_STATE) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Initialize state from URL -> sessionStorage -> defaults
  const getInitialState = useCallback((): FilterState => {
    // Priority 1: URL params (for shared URLs)
    const fromUrl = parseFromUrl(searchParams);
    if (Object.keys(fromUrl).length > 0) {
      return mergeWithDefaults(fromUrl);
    }

    // Priority 2: sessionStorage (for page refresh)
    const fromStorage = parseFromStorage();
    if (fromStorage) {
      return mergeWithDefaults(fromStorage);
    }

    // Priority 3: Default/initial state
    return { ...initialState };
  }, [searchParams, initialState]);

  const [filterState, setFilterState] = useState<FilterState>(getInitialState);

  // Sync to URL and sessionStorage on change
  useEffect(() => {
    // Update URL params
    const newParams = serializeToUrl(filterState);
    const currentParams = searchParams.toString();
    const newParamsStr = newParams.toString();
    
    if (currentParams !== newParamsStr) {
      setSearchParams(newParams, { replace: true });
    }

    // Update sessionStorage
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filterState));
    } catch {
      // Ignore storage errors
    }
  }, [filterState, searchParams, setSearchParams]);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setFilterState({ ...DEFAULT_FILTER_STATE });
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