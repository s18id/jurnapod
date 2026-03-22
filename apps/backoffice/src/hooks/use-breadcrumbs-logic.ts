// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * useBreadcrumbs Pure Logic Functions
 * 
 * These functions can be tested without React and are used by the useBreadcrumbs hook.
 */

// Re-export BreadcrumbItem type for convenience
export type { default as BreadcrumbItem } from "../components/ui/PageHeader/PageHeader";

// ============================================================================
// Types
// ============================================================================

/**
 * Route configuration for breadcrumb generation.
 * Extends AppRoute with parent relationship for hierarchy.
 */
export interface BreadcrumbRoute {
  /** Route path (e.g., "/items", "/items/:id") */
  path: string;
  /** Display label for the breadcrumb */
  label: string;
  /** Optional parent route path for hierarchy */
  parent?: string;
  /** Whether this route accepts route parameters */
  hasParams?: boolean;
}

// ============================================================================
// Default Route Configuration with Hierarchy
// ============================================================================

/**
 * Extended route configuration with parent relationships for breadcrumb generation.
 * This maps the flat APP_ROUTES into a hierarchy based on URL structure.
 */
export const BREADCRUMB_ROUTES: BreadcrumbRoute[] = [
  // === Root/Base Routes (no parent) ===
  { path: "/daily-sales", label: "Daily Sales" },
  { path: "/profit-loss", label: "Profit & Loss" },
  { path: "/general-ledger", label: "General Ledger" },
  { path: "/journals", label: "Journals & Trial Balance" },
  { path: "/accounting-worksheet", label: "Accounting Worksheet" },
  { path: "/account-types", label: "Account Types" },
  { path: "/chart-of-accounts", label: "Chart of Accounts" },
  { path: "/fiscal-years", label: "Fiscal Years" },
  { path: "/account-mappings", label: "Account Mappings" },
  { path: "/tax-rates", label: "Tax Rates" },
  { path: "/transaction-templates", label: "Transaction Templates" },
  { path: "/transactions", label: "Transaction Input" },
  { path: "/cash-bank", label: "Cash & Bank" },
  { path: "/sales-invoices", label: "Sales Invoices" },
  { path: "/sales-payments", label: "Sales Payments" },
  { path: "/pos-transactions", label: "POS Transactions" },
  { path: "/pos-payments", label: "POS Payments" },
  { path: "/outlet-tables", label: "Outlet Tables" },
  { path: "/reservations", label: "Reservations" },
  { path: "/reservation-calendar", label: "Reservation Calendar" },
  { path: "/table-board", label: "Table Board" },
  { path: "/sync-queue", label: "Sync Queue" },
  { path: "/sync-history", label: "Sync History" },
  { path: "/pwa-settings", label: "PWA Settings" },
  { path: "/item-groups", label: "Item Groups" },
  { path: "/items", label: "Items" },
  { path: "/prices", label: "Prices" },
  { path: "/items-prices", label: "Items & Prices" },
  { path: "/supplies", label: "Supplies" },
  { path: "/fixed-assets", label: "Fixed Assets" },
  { path: "/inventory-settings", label: "Inventory Settings" },
  { path: "/audit-logs", label: "Audit Logs" },
  { path: "/companies", label: "Companies" },
  { path: "/outlets", label: "Outlets (Branches)" },
  { path: "/users", label: "Users" },
  { path: "/roles", label: "Roles" },
  { path: "/module-roles", label: "Module Roles" },
  { path: "/modules", label: "Modules" },
  { path: "/outlet-settings", label: "Outlet Settings" },
  { path: "/static-pages", label: "Static Pages" },
  { path: "/platform-settings", label: "Platform Settings" },

  // === Routes with Parents (Detail Pages) ===
  // Items hierarchy: Items -> Item Details -> Prices
  { path: "/items/:id", label: "Item Details", parent: "/items", hasParams: true },
  { path: "/items/:id/prices", label: "Item Prices", parent: "/items/:id", hasParams: true },

  // Users hierarchy: Users -> User Details
  { path: "/users/:id", label: "User Details", parent: "/users", hasParams: true },

  // Roles hierarchy: Roles -> Role Details
  { path: "/roles/:id", label: "Role Details", parent: "/roles", hasParams: true },

  // Companies hierarchy: Companies -> Company Details
  { path: "/companies/:id", label: "Company Details", parent: "/companies", hasParams: true },

  // Outlets hierarchy: Outlets -> Outlet Details
  { path: "/outlets/:id", label: "Outlet Details", parent: "/outlets", hasParams: true },

  // Reservations hierarchy: Reservations -> Reservation Details
  { path: "/reservations/:id", label: "Reservation Details", parent: "/reservations", hasParams: true },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalizes a route path for comparison.
 * Removes leading/trailing slashes and ensures single leading slash.
 */
export function normalizeRoutePath(path: string): string {
  // Remove all leading and trailing slashes, then ensure single leading slash
  const cleaned = path.replace(/^\/+|\/+$/g, "");
  return "/" + cleaned;
}

/**
 * Checks if a path matches a route pattern.
 * Handles both exact matches and parameterized routes like /items/:id
 */
export function matchRoutePath(pattern: string, path: string): boolean {
  const normalizedPattern = normalizeRoutePath(pattern);
  const normalizedPath = normalizeRoutePath(path);

  // Exact match
  if (normalizedPattern === normalizedPath) {
    return true;
  }

  // Parameterized route match (e.g., /items/:id matches /items/123)
  const patternParts = normalizedPattern.split("/");
  const pathParts = normalizedPath.split("/");

  if (patternParts.length !== pathParts.length) {
    return false;
  }

  return patternParts.every((part, index) => {
    // Skip parameter segments (those starting with :)
    if (part.startsWith(":")) {
      return true;
    }
    return part === pathParts[index];
  });
}

/**
 * Finds a route configuration by path pattern
 */
export function findBreadcrumbRoute(
  path: string,
  routes: BreadcrumbRoute[]
): BreadcrumbRoute | null {
  const normalizedPath = normalizeRoutePath(path);

  // First try exact match
  const exactMatch = routes.find(
    (r) => normalizeRoutePath(r.path) === normalizedPath
  );
  if (exactMatch) {
    return exactMatch;
  }

  // Then try parameterized match
  return (
    routes.find((r) => matchRoutePath(r.path, normalizedPath)) ?? null
  );
}

/**
 * Generates an href with preserved query parameters
 */
export function generateHrefWithParams(
  path: string,
  queryParams: URLSearchParams,
  preservedQueryKeys: string[]
): string {
  const params = new URLSearchParams();

  // Always preserve outlet context if present
  if (queryParams.has("outlet")) {
    params.set("outlet", queryParams.get("outlet")!);
  }

  // Preserve specified keys
  for (const key of preservedQueryKeys) {
    if (queryParams.has(key)) {
      params.set(key, queryParams.get(key)!);
    }
  }

  const paramString = params.toString();
  return `#${path}${paramString ? `?${paramString}` : ""}`;
}

/**
 * Builds the breadcrumb trail by walking up the parent chain
 */
export function buildBreadcrumbTrail(
  route: BreadcrumbRoute,
  routes: BreadcrumbRoute[],
  preserveQueryParams: boolean,
  preservedQueryKeys: string[],
  queryParams?: URLSearchParams
): import("../components/ui/PageHeader/PageHeader").BreadcrumbItem[] {
  const trail: import("../components/ui/PageHeader/PageHeader").BreadcrumbItem[] = [];
  let currentRoute: BreadcrumbRoute | null = route;

  // Walk up the parent chain to build trail in correct order
  const parentChain: BreadcrumbRoute[] = [];
  const visited = new Set<string>();

  while (currentRoute && !visited.has(currentRoute.path)) {
    visited.add(currentRoute.path);
    parentChain.unshift(currentRoute); // Add to beginning to reverse order
    currentRoute = currentRoute.parent
      ? routes.find(
          (r) =>
            normalizeRoutePath(r.path) === normalizeRoutePath(currentRoute!.parent!)
        ) ?? null
      : null;
  }

  // Convert chain to breadcrumb items
  for (let i = 0; i < parentChain.length; i++) {
    const chainRoute = parentChain[i];
    const isLast = i === parentChain.length - 1;

    // Generate href with query params if preserved
    let href: string | undefined;
    if (!isLast && preserveQueryParams && queryParams) {
      href = generateHrefWithParams(chainRoute.path, queryParams, preservedQueryKeys);
    } else if (!isLast) {
      href = `#${chainRoute.path}`;
    }

    trail.push({
      label: chainRoute.label,
      href,
      current: isLast,
    });
  }

  return trail;
}

/**
 * Generate breadcrumb items for a given path
 */
export function generateBreadcrumbsForPath(
  path: string,
  routes: BreadcrumbRoute[],
  preserveQueryParams: boolean,
  preservedQueryKeys: string[],
  unknownRouteLabel: string,
  queryParams?: URLSearchParams
): import("../components/ui/PageHeader/PageHeader").BreadcrumbItem[] {
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
    queryParams
  );
}
