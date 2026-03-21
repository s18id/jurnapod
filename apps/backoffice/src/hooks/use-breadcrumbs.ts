// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * useBreadcrumbs Hook
 * 
 * Hook for generating breadcrumb navigation items from the current route.
 * Provides automatic breadcrumb trail generation with parent route hierarchy,
 * query parameter preservation, and deep link support.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeHashPath } from "../app/routes";
import type { BreadcrumbItem } from "../components/ui/PageHeader/PageHeader";
import {
  BREADCRUMB_ROUTES,
  type BreadcrumbRoute,
  buildBreadcrumbTrail,
  findBreadcrumbRoute,
  generateHrefWithParams,
  normalizeRoutePath,
} from "./use-breadcrumbs-logic";

// Re-export types from logic file for convenience
export type { BreadcrumbRoute } from "./use-breadcrumbs-logic";

// ============================================================================
// Options
// ============================================================================

/**
 * Options for useBreadcrumbs hook
 */
export interface UseBreadcrumbsOptions {
  /** Custom route configuration (extends BREADCRUMB_ROUTES) */
  routes?: BreadcrumbRoute[];
  /** Whether to include query parameters in breadcrumb links (default: true) */
  preserveQueryParams?: boolean;
  /** Query parameters to preserve when navigating up the hierarchy */
  preservedQueryKeys?: string[];
  /** Fallback label for unknown routes */
  unknownRouteLabel?: string;
  /** Whether the hook is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Return type for useBreadcrumbs hook
 */
export interface UseBreadcrumbsReturn {
  /** Array of breadcrumb items for the current route */
  breadcrumbs: BreadcrumbItem[];
  /** The current route path */
  currentPath: string;
  /** Whether the current route was found in the route config */
  isKnownRoute: boolean;
  /** Function to manually generate breadcrumbs for a given path */
  generateBreadcrumbs: (path: string, queryParams?: URLSearchParams) => BreadcrumbItem[];
  /** Function to generate href with preserved query params */
  generateHref: (path: string, queryParams?: URLSearchParams) => string;
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook to generate breadcrumb navigation items from the current route.
 * 
 * Features:
 * - Automatic breadcrumb trail generation from route hierarchy
 * - Parent route traversal for nested pages
 * - Query parameter preservation across breadcrumbs
 * - Deep link and browser history support
 * - Unknown route handling with fallback
 * 
 * @example
 * ```tsx
 * function MyPage() {
 *   const { breadcrumbs, isKnownRoute } = useBreadcrumbs();
 *   
 *   return (
 *     <PageHeader
 *       title="Item Details"
 *       breadcrumbs={breadcrumbs}
 *     />
 *   );
 * }
 * ```
 * 
 * @example with custom options
 * ```tsx
 * const { breadcrumbs } = useBreadcrumbs({
 *   preserveQueryParams: true,
 *   preservedQueryKeys: ["tab", "view"],
 *   unknownRouteLabel: "Page",
 * });
 * ```
 */
export function useBreadcrumbs(options: UseBreadcrumbsOptions = {}): UseBreadcrumbsReturn {
  const {
    routes = BREADCRUMB_ROUTES,
    preserveQueryParams = true,
    preservedQueryKeys = [],
    unknownRouteLabel = "Page",
    enabled = true,
  } = options;

  // State for current path (synced with hash)
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window === "undefined") {
      return "/items";
    }
    return normalizeHashPath(window.location.hash);
  });

  // State for query params
  const [queryParams, setQueryParams] = useState<URLSearchParams>(() => {
    if (typeof window === "undefined") {
      return new URLSearchParams();
    }
    return new URLSearchParams(window.location.search);
  });

  // Sync with hash changes (handles browser back/forward)
  useEffect(() => {
    if (!enabled) return;

    function handleHashChange() {
      const newPath = normalizeHashPath(window.location.hash);
      const newQueryParams = new URLSearchParams(window.location.search);
      setCurrentPath(newPath);
      setQueryParams(newQueryParams);
    }

    // Listen for hash changes (browser back/forward)
    window.addEventListener("hashchange", handleHashChange);

    // Also watch for popstate events (more reliable for history navigation)
    window.addEventListener("popstate", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
    };
  }, [enabled]);

  /**
   * Generate breadcrumb items for a given path
   */
  const generateBreadcrumbs = useCallback(
    (path: string, searchParams?: URLSearchParams): BreadcrumbItem[] => {
      const normalizedPath = normalizeRoutePath(path);
      const route = findBreadcrumbRoute(normalizedPath, routes);

      // Unknown route - return single item with fallback label
      if (!route) {
        return [
          {
            label: unknownRouteLabel,
            current: true,
          },
        ];
      }

      // Build trail using parent chain
      return buildBreadcrumbTrail(
        route,
        routes,
        preserveQueryParams,
        preservedQueryKeys,
        searchParams
      );
    },
    [routes, preserveQueryParams, preservedQueryKeys, unknownRouteLabel]
  );

  /**
   * Generate href with preserved query params
   */
  const generateHref = useCallback(
    (path: string, searchParams?: URLSearchParams): string => {
      if (!preserveQueryParams || !searchParams) {
        return `#${path}`;
      }
      return generateHrefWithParams(path, searchParams, preservedQueryKeys);
    },
    [preserveQueryParams, preservedQueryKeys]
  );

  // Generate breadcrumbs for current path
  const breadcrumbs = useMemo(() => {
    if (!enabled) {
      return [];
    }
    return generateBreadcrumbs(currentPath, queryParams);
  }, [currentPath, queryParams, generateBreadcrumbs, enabled]);

  // Check if current route is known
  const isKnownRoute = useMemo(() => {
    const normalizedPath = normalizeRoutePath(currentPath);
    return findBreadcrumbRoute(normalizedPath, routes) !== null;
  }, [currentPath, routes]);

  return {
    breadcrumbs,
    currentPath,
    isKnownRoute,
    generateBreadcrumbs,
    generateHref,
  };
}

export default useBreadcrumbs;