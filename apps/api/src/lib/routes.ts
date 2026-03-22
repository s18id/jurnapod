// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Route Utilities
 *
 * Helper functions for route introspection and debugging.
 */

import type { Hono } from "hono";

interface RouteInfo {
  method: string;
  path: string;
}

/**
 * Get all registered routes from a Hono app
 * 
 * @example
 * const routes = listRoutes(app);
 * console.table(routes);
 */
export function listRoutes(app: Hono): RouteInfo[] {
  const routes: RouteInfo[] = [];
  
  // Access internal route tree
  const routesMap = (app as any)._routes;
  if (!routesMap) {
    return routes;
  }

  // Traverse the route tree
  for (const [path, methods] of Object.entries(routesMap)) {
    if (typeof methods === 'object' && methods !== null) {
      for (const [method, handler] of Object.entries(methods as Record<string, any>)) {
        if (typeof handler === 'function' && method !== 'middlewares') {
          routes.push({
            method: method.toUpperCase(),
            path: path === '/' ? '/' : path.replace(/^\//, '')
          });
        }
      }
    }
  }

  return routes.sort((a, b) => {
    const pathCompare = a.path.localeCompare(b.path);
    if (pathCompare !== 0) return pathCompare;
    return a.method.localeCompare(b.method);
  });
}

/**
 * Print routes to console in a formatted table
 */
export function printRoutes(app: Hono): void {
  const routes = listRoutes(app);
  
  console.log('\n=== Registered Routes ===');
  console.log(`Total: ${routes.length} routes\n`);
  
  // Group by path
  const grouped = routes.reduce((acc, route) => {
    if (!acc[route.path]) {
      acc[route.path] = [];
    }
    acc[route.path].push(route.method);
    return acc;
  }, {} as Record<string, string[]>);

  for (const [path, methods] of Object.entries(grouped).sort()) {
    console.log(`  ${path.padEnd(60)} ${methods.join(', ')}`);
  }
  
  console.log('\n========================\n');
}
