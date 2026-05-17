// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// React Router v6 compatibility bridge — transitional component
// for the eventual cutover from the hash-based AppRouter.
//
// Batch C: This bridge provides the BrowserRouter wrapper, route
// definitions with lazy-loaded chunks, and guard integration.
// The existing AppRouter (../router.tsx) remains the active routing
// implementation. This bridge is the foundation for the v6 cutover
// in a future batch.

import { Suspense, lazy, useEffect, type ComponentType } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  Outlet,
} from "react-router-dom";

import { resolveLegacyHash } from "./hash-redirect";
import { ROUTE_PATHS } from "./routes";

// ---------------------------------------------------------------------------
// Lazy-loaded domain page modules (aligned with route tree)
// ---------------------------------------------------------------------------

function lazyNamed<T extends Record<string, unknown>>(
  loader: () => Promise<T>,
  exportName: keyof T & string,
) {
  return lazy(async () => {
    const mod = await loader();
    return { default: mod[exportName] as ComponentType<Record<string, unknown>> };
  });
}

const loadPages = () => import("@/features/pages");

// Public pages (not lazy for quick load)
// LoginPage etc. will be imported directly from the AppRouter

// Domain page chunks — lazily loaded for code splitting
const ItemsPage = lazyNamed(loadPages, "ItemsPage");
const UsersPage = lazyNamed(loadPages, "UsersPage");
const CompaniesPage = lazyNamed(loadPages, "CompaniesPage");
const OutletsPage = lazyNamed(loadPages, "OutletsPage");
const RolesPage = lazyNamed(loadPages, "RolesPage");
const JournalsPage = lazyNamed(loadPages, "JournalsPage");
const GeneralLedgerPage = lazyNamed(loadPages, "GeneralLedgerPage");
const ProfitLossPage = lazyNamed(loadPages, "ProfitLossPage");
const SalesInvoicesPage = lazyNamed(loadPages, "SalesInvoicesPage");
const DashboardPage = lazyNamed(loadPages, "DailySalesPage");

// ---------------------------------------------------------------------------
// Loading fallback
// ---------------------------------------------------------------------------

function RouteLoadingFallback() {
  return <div style={{ padding: "1rem", fontFamily: "ui-sans-serif" }}>Loading…</div>;
}

/** Wrap a lazy component with Suspense */
function Lazy({ component: Component }: { component: ComponentType<Record<string, unknown>> }) {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Component />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Legacy hash handler — redirects old hash URLs to v6 paths on mount
// ---------------------------------------------------------------------------

function LegacyHashRedirector() {
  const location = useLocation();

  useEffect(() => {
    const hash = globalThis.location?.hash;
    if (!hash || hash.length <= 1) return;

    const target = resolveLegacyHash(hash);
    if (target && target !== location.pathname) {
      globalThis.location.hash = "";
      // Replace current history entry so back button works correctly
      globalThis.history.replaceState({}, "", target);
    }
  }, [location.pathname]);

  return <Outlet />;
}

// ---------------------------------------------------------------------------
// 404 page
// ---------------------------------------------------------------------------

function NotFoundPage() {
  return (
    <div style={{ padding: "2rem", textAlign: "center", fontFamily: "ui-sans-serif" }}>
      <h1>404</h1>
      <p>The page you are looking for does not exist.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forbidden page
// ---------------------------------------------------------------------------

function ForbiddenPage() {
  return (
    <div style={{ padding: "2rem", textAlign: "center", fontFamily: "ui-sans-serif" }}>
      <h1>403</h1>
      <p>You do not have permission to access this page.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route tree definition
// ---------------------------------------------------------------------------

/**
 * Canonical route tree with lazy-loaded domain chunks.
 *
 * NOTE (Batch C): Route guards (auth + permission) are not applied
 * in this bridge yet — the existing AppRouter handles them. When the
 * full cutover happens, guards will be wired here using the helpers
 * from ./guards.tsx.
 */
function AppRoutes() {
  return (
    <Routes>
      {/* Legacy hash handler — intercepts before any route */}
      <Route element={<LegacyHashRedirector />}>
        {/* Public routes */}
        <Route path={ROUTE_PATHS.LOGIN} element={<div>Login page (redirected by AppRouter)</div>} />
        <Route path={ROUTE_PATHS.FORGOT_PASSWORD} element={<div>Forgot Password</div>} />
        <Route path={ROUTE_PATHS.RESET_PASSWORD} element={<div>Reset Password</div>} />
        <Route path={ROUTE_PATHS.INVITE} element={<div>Invite</div>} />
        <Route path={ROUTE_PATHS.VERIFY_EMAIL} element={<div>Verify Email</div>} />

        {/* Authenticated root (shell wrapper) */}
        <Route path={ROUTE_PATHS.ROOT} element={<Outlet />}>
          {/* Redirect root to dashboard */}
          <Route index element={<Navigate to={ROUTE_PATHS.DAILY_SALES} replace />} />

          {/* Core */}
          <Route path={ROUTE_PATHS.DAILY_SALES} element={<Lazy component={DashboardPage} />} />
          <Route path={ROUTE_PATHS.GENERAL_LEDGER} element={<Lazy component={GeneralLedgerPage} />} />
          <Route path={ROUTE_PATHS.JOURNALS} element={<Lazy component={JournalsPage} />} />
          <Route path={ROUTE_PATHS.PROFIT_LOSS} element={<Lazy component={ProfitLossPage} />} />

          {/* Inventory */}
          <Route path={ROUTE_PATHS.ITEMS} element={<Lazy component={ItemsPage} />} />

          {/* Platform */}
          <Route path={ROUTE_PATHS.USERS} element={<Lazy component={UsersPage} />} />
          <Route path={ROUTE_PATHS.COMPANIES} element={<Lazy component={CompaniesPage} />} />
          <Route path={ROUTE_PATHS.OUTLETS} element={<Lazy component={OutletsPage} />} />
          <Route path={ROUTE_PATHS.ROLES} element={<Lazy component={RolesPage} />} />

          {/* Sales */}
          <Route path={ROUTE_PATHS.SALES_INVOICES} element={<Lazy component={SalesInvoicesPage} />} />

          {/* Forbidden */}
          <Route path="/403" element={<ForbiddenPage />} />
        </Route>

        {/* Catch-all 404 */}
        <Route path={ROUTE_PATHS.NOT_FOUND} element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

// ---------------------------------------------------------------------------
// RouterBridge — the v6-compatible router wrapper
// ---------------------------------------------------------------------------

export interface RouterBridgeProps {
  /** Children rendered inside the BrowserRouter (typically the app shell) */
  children?: React.ReactNode;
}

/**
 * RouterBridge — React Router v6 BrowserRouter wrapper with route definitions.
 *
 * Usage (future cutover):
 *   <RouterBridge>
 *     <AppLayout>...</AppLayout>
 *   </RouterBridge>
 *
 * NOTE (Batch C): The existing AppRouter (hash-based) remains the active
 * routing implementation. This bridge is not yet active in the app tree.
 * When the full cutover happens, the main.tsx entry will use this component
 * instead of AppRouter.
 */
export function RouterBridge({ children }: RouterBridgeProps) {
  return (
    <BrowserRouter>
      <AppRoutes />
      {children}
    </BrowserRouter>
  );
}

/**
 * HashedRouterBridge — a variant that preserves hash URL behavior during
 * the transition period. Uses HashRouter instead of BrowserRouter.
 */
export function HashedRouterBridge({ children }: RouterBridgeProps) {
  // We intentionally re-use BrowserRouter because the existing AppRouter
  // handles hash-to-path normalization. The LegacyHashRedirector handles
  // incoming hash-based URLs.
  return (
    <BrowserRouter>
      <LegacyHashRedirector />
      <AppRoutes />
      {children}
    </BrowserRouter>
  );
}
