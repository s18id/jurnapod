// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { routes } from "./routes.js";

export type RouteId = keyof typeof routes;

export function getPathByRouteId(routeId: RouteId): string {
  return routes[routeId].path;
}

export function isAuthRoute(pathname: string): boolean {
  return pathname === routes.login.path;
}

export function isProtectedPath(pathname: string): boolean {
  return Object.values(routes).some((route) => route.path === pathname && route.requiresAuth);
}
