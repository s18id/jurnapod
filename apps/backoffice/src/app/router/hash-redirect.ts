// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Legacy hash URL compatibility bridge.
//
// Maps old hash-based URLs (#/inventory/items, #/admin/users, etc.) to the
// new v6-style paths. This bridge ensures that existing bookmarks and
// external links continue to work after the React Router v6 cutover.
//
// NOTE (Batch C): The full React Router switch is deferred. This bridge
// is invoked by the existing AppRouter during hash resolution to map legacy
// paths that changed. The mapping table is kept in sync with the
// v6 route tree in routes.tsx.

import { getV6RedirectForHash, HASH_TO_V6_ROUTE, APP_ROUTES } from "./routes";

// ---------------------------------------------------------------------------
// Redirect mapping
// ---------------------------------------------------------------------------

export { getV6RedirectForHash, HASH_TO_V6_ROUTE };

/**
 * Map of ALL legacy hash paths to their current (or v6 target) paths.
 * Includes deprecated paths that redirect to their replacement.
 */
export const LEGACY_HASH_REDIRECTS: Record<string, string> = {
  "#/admin/dashboard": "/dashboard",
  "#/admin/dashboard/financial": "/dashboard",
  "#/admin/dashboard/sync": "/dashboard",
  "#/items-prices": "/items",
  "#/feature-flags": "/modules",
  "#/feature-settings": "/outlet-settings",
  "#/403": "/items",
};

/**
 * Resolve a legacy hash path to its current target.
 *
 * Uses the following priority:
 * 1. Exact match in LEGACY_HASH_REDIRECTS
 * 2. Direct path match (hash path exists in APP_ROUTES)
 * 3. v6 redirect mapping
 * 4. Returns null if no target found
 */
export function resolveLegacyHash(hash: string): string | null {
  // Strip # prefix and normalize
  const normalized = hash.startsWith("#") ? hash : `#${hash}`;

  // 1. Check legacy redirects
  if (LEGACY_HASH_REDIRECTS[normalized]) {
    return LEGACY_HASH_REDIRECTS[normalized];
  }

  // 2. Check if path exists directly
  const path = hash.replace(/^#/, "");
  if (APP_ROUTES.some((r) => r.path === path)) {
    return path;
  }

  // 3. Check v6 redirect mapping
  return getV6RedirectForHash(normalized);
}

/**
 * Check whether a given hash path is a known legacy redirect.
 * Useful for showing a brief transition notice to the user.
 */
export function isLegacyHash(hash: string): boolean {
  const normalized = hash.startsWith("#") ? hash : `#${hash}`;
  return normalized in LEGACY_HASH_REDIRECTS;
}

// ---------------------------------------------------------------------------
// React Router v6 integration note
// ---------------------------------------------------------------------------

/**
 * When the full React Router switch activates (future batch), the following
 * component/HOC will be used to wrap the main App:
 *
 * ```tsx
 * import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
 *
 * function LegacyHashHandler() {
 *   useEffect(() => {
 *     const hash = window.location.hash;
 *     if (hash) {
 *       const target = resolveLegacyHash(hash);
 *       if (target) {
 *         window.location.hash = "";
 *         navigate(target, { replace: true });
 *       }
 *     }
 *   }, []);
 *   return <Outlet />;
 * }
 * ```
 */

/**
 * Build a hash-based redirect URL for the compatibility bridge.
 * Used during the transition period when hash URLs still need to work.
 */
export function buildHashRedirect(v6Path: string): string {
  return `#${v6Path}`;
}
