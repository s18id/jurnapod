// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Deterministic TanStack Query key factory.
//
// Keys follow the pattern: `[domain, resource, scope, ...params]`
//
// Example keys:
//   ["platform", "users", "list", { page, limit, search }]
//   ["platform", "users", "detail", userId]
//   ["inventory", "items", "list", { page, limit, category }]
//   ["inventory", "items", "detail", itemId]
//
// All key builders are pure functions — no side effects, no DB access.

// ---------------------------------------------------------------------------
// Domain and resource constants (matches the 8 canonical modules)
// ---------------------------------------------------------------------------

export const DOMAINS = [
  "platform",
  "pos",
  "sales",
  "inventory",
  "accounting",
  "treasury",
  "purchasing",
  "reservations",
] as const;

export type QueryDomain = (typeof DOMAINS)[number];

// ---------------------------------------------------------------------------
// Query key types
// ---------------------------------------------------------------------------

export type ListQueryParams = Record<string, string | number | boolean | undefined>;

export type QueryKey = readonly unknown[];

// ---------------------------------------------------------------------------
// Key builders
// ---------------------------------------------------------------------------

/**
 * Build a list query key: [domain, resource, "list", params?]
 *
 * If params is empty or undefined, the key omits the params segment
 * so that all-list and filtered-list can share a base key for invalidation.
 */
export function listQueryKey(
  domain: QueryDomain,
  resource: string,
  params?: ListQueryParams,
): QueryKey {
  const base = [domain, resource, "list"] as const;
  if (!params || Object.keys(params).length === 0) {
    return base;
  }
  return [...base, params] as const;
}

/**
 * Build a detail query key: [domain, resource, "detail", id]
 */
export function detailQueryKey(
  domain: QueryDomain,
  resource: string,
  id: string | number,
): QueryKey {
  return [domain, resource, "detail", id] as const;
}

/**
 * Build a list query key prefix for cache invalidation.
 * Matches ALL list queries for a domain+resource, regardless of params.
 *
 * Example: invalidate all list queries for inventory/items:
 *   queryClient.invalidateQueries({ queryKey: listQueryKeyPrefix("inventory", "items") })
 */
export function listQueryKeyPrefix(domain: QueryDomain, resource: string): QueryKey {
  return [domain, resource, "list"] as const;
}

/**
 * Build a resource-level query key prefix for cache invalidation.
 * Matches ALL queries (list + detail) for a domain+resource.
 *
 * Example: invalidate everything for inventory/items:
 *   queryClient.invalidateQueries({ queryKey: resourceQueryKeyPrefix("inventory", "items") })
 */
export function resourceQueryKeyPrefix(domain: QueryDomain, resource: string): QueryKey {
  return [domain, resource] as const;
}

// ---------------------------------------------------------------------------
// Key validator (useful for debugging and test assertions)
// ---------------------------------------------------------------------------

/**
 * Check whether a query key conforms to the canonical domain.resource pattern.
 * Returns true for keys like ["platform", "users", ...].
 */
export function isCanonicalQueryKey(key: QueryKey): boolean {
  if (!Array.isArray(key) || key.length < 2) {
    return false;
  }
  const [domain, resource] = key as [unknown, unknown];
  return (
    typeof domain === "string" &&
    DOMAINS.includes(domain as QueryDomain) &&
    typeof resource === "string" &&
    resource.length > 0
  );
}
