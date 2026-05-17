export type { BackofficeRouteDefinition, RouteGuardContext } from "./route-definitions";
export type { AuthGuardCheck, RouteGuardFn, RoutePermissionCheck } from "./guards";
export type { RouterBridgeProps } from "./router-bridge";

export {
  BACKOFFICE_ROUTE_DEFINITIONS,
  canAccessRouteDefinition,
  createRouteObjects,
  getRoutePermission,
  normalizeLegacyHashPath,
  resolveLegacyRoutePath,
} from "./route-definitions";

export {
  APP_ROUTES,
  HASH_TO_V6_ROUTE,
  ROUTE_PATHS,
  getV6RedirectForHash,
} from "./routes";

export {
  checkAuth,
  checkResourcePermission,
  checkRouteAccess,
  createPermissionGuard,
} from "./guards";

export {
  LEGACY_HASH_REDIRECTS,
  buildHashRedirect,
  isLegacyHash,
  resolveLegacyHash,
} from "./hash-redirect";

export {
  HashedRouterBridge,
  RouterBridge,
} from "./router-bridge";
