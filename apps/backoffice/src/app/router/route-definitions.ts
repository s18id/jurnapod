// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { LazyExoticComponent, ComponentType } from "react";
import type { RouteObject } from "react-router-dom";

import type { ModuleCode, PermissionName, ResourcePermission } from "@/app/shell";

export type BackofficeRouteDefinition = {
  path: string;
  label: string;
  module: ModuleCode;
  resource: string;
  permission: PermissionName;
  legacyHashPaths?: readonly string[];
  lazyComponent?: LazyExoticComponent<ComponentType<unknown>>;
};

export type RouteGuardContext = {
  authenticated: boolean;
  permissions: ReadonlySet<ResourcePermission>;
};

export const BACKOFFICE_ROUTE_DEFINITIONS: readonly BackofficeRouteDefinition[] = [
  { path: "/users", label: "Users", module: "platform", resource: "users", permission: "READ" },
  { path: "/roles", label: "Roles", module: "platform", resource: "roles", permission: "READ" },
  { path: "/companies", label: "Companies", module: "platform", resource: "companies", permission: "READ" },
  { path: "/outlets", label: "Outlets", module: "platform", resource: "outlets", permission: "READ" },
  {
    path: "/items",
    label: "Items",
    module: "inventory",
    resource: "items",
    permission: "READ",
    legacyHashPaths: ["#/items-prices", "/items-prices"],
  },
  { path: "/prices", label: "Prices", module: "inventory", resource: "items", permission: "READ" },
  { path: "/sync-queue", label: "Operations", module: "pos", resource: "transactions", permission: "READ" },
];

export function getRoutePermission(route: BackofficeRouteDefinition): ResourcePermission {
  return `${route.module}.${route.resource}` as ResourcePermission;
}

export function normalizeLegacyHashPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) {
    return normalizeLegacyHashPath(trimmed.slice(1));
  }
  if (trimmed.length === 0 || trimmed === "/") {
    return "/";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function resolveLegacyRoutePath(path: string): string {
  const normalized = normalizeLegacyHashPath(path);
  for (const route of BACKOFFICE_ROUTE_DEFINITIONS) {
    if (route.path === normalized) {
      return route.path;
    }
    if (route.legacyHashPaths?.some((legacyPath) => normalizeLegacyHashPath(legacyPath) === normalized)) {
      return route.path;
    }
  }
  return normalized;
}

export function canAccessRouteDefinition(
  route: BackofficeRouteDefinition,
  context: RouteGuardContext,
): boolean {
  if (!context.authenticated) {
    return false;
  }
  return context.permissions.has(getRoutePermission(route));
}

export function createRouteObjects(
  routes: readonly BackofficeRouteDefinition[],
): RouteObject[] {
  return routes.map((route) => ({
    path: route.path.replace(/^\//, ""),
    id: route.path,
  }));
}
