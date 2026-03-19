// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "./layout";
import {
  APP_ROUTES,
  DEFAULT_ROUTE_PATH,
  findRoute,
  normalizeHashPath,
  userCanAccessRoute,
  filterRoutesByModules
} from "./routes";
import { useModules } from "../hooks/use-modules";
import { useHeaderAlerts } from "../hooks/use-header-alerts";
import { ApiError, getApiBaseUrl } from "../lib/api-client";
import { setupMasterDataRefresh } from "../lib/cache-service";
import { setupAutoSync } from "../lib/auto-sync";
import { SyncNotification } from "../components/sync-notification";
import { ModuleConfigWarning } from "../components/module-config-warning";
import {
  clearAccessToken,
  fetchCurrentUser,
  getStoredAccessToken,
  login,
  loginWithGoogle,
  refreshAccessToken,
  type SessionUser
} from "../lib/session";
import { LoginPage } from "../features/auth/login-page";
import {
  AccountsPage,
  AccountTypesPage,
  AccountingWorksheetPage,
  TransactionsPage,
  TransactionTemplatesPage,
  DailySalesPage,
  ForbiddenPage,
  ItemGroupsPage,
  ItemsPage,
  PricesPage,
  JournalsPage,
  GeneralLedgerPage,
  ProfitLossPage,
  FixedAssetsPage,
  PosPaymentsPage,
  PosTransactionsPage,
  SalesInvoicesPage,
  SalesPaymentsPage,
  SuppliesPage,
  AccountMappingsPage,
  FeatureSettingsPage,
  ModulesPage,
  TaxRatesPage,
  InventorySettingsPage,
  StaticPagesPage,
  UsersPage,
  RolesPage,
  ModuleRolesPage,
  CompaniesPage,
  OutletsPage,
  PlatformSettingsPage,
  FiscalYearsPage,
  AuditLogsPage,
  CashBankPage
} from "../features/pages";
import { PublicStaticPage } from "../features/privacy-page";
import { SyncQueuePage } from "../features/sync-queue-page";
import { SyncHistoryPage } from "../features/sync-history-page";
import { PWASettingsPage } from "../features/pwa-settings-page";
import { OutletTablesPage } from "../features/outlet-tables-page";
import { ReservationsPage } from "../features/reservations-page";
import { TableBoardPage } from "../features/table-board-page";
import { ResetPasswordPage } from "../features/reset-password-page";
import { InvitePage } from "../features/invite-page";
import { VerifyEmailPage } from "../features/verify-email-page";
import { ForgotPasswordPage } from "../features/forgot-password-page";

type SessionStatus = "loading" | "anonymous" | "authenticated";

const OAUTH_STATE_KEY = "jurnapod.backoffice.oauth.state";
const OAUTH_COMPANY_KEY = "jurnapod.backoffice.oauth.company";
const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const STATIC_SLUG_PATTERN = /^[a-z0-9-]+$/;

function ensureHash(path: string): void {
  const publicSlug = getPublicStaticSlugFromLocation(globalThis.location);
  if (publicSlug && globalThis.location.pathname === `/${publicSlug}`) {
    return;
  }

  if (globalThis.location.hash !== `#${path}`) {
    globalThis.location.hash = `#${path}`;
  }
}

function resolvePathFromLocation(): string {
  if (globalThis.location.hash.length > 0) {
    return normalizeHashPath(globalThis.location.hash);
  }

  const publicSlug = getPublicStaticSlugFromLocation(globalThis.location);
  if (publicSlug) {
    return `/${publicSlug}`;
  }

  return DEFAULT_ROUTE_PATH;
}

function getPublicStaticSlugFromLocation(location: Location): string | null {
  if (location.hash.length > 0) {
    return null;
  }

  const trimmedPath = location.pathname.replace(/\/+$/, "");
  if (trimmedPath.length === 0 || trimmedPath === "/") {
    return null;
  }

  if (trimmedPath === "/auth/callback") {
    return null;
  }

  const slug = trimmedPath.replace(/^\/+/, "");
  if (!STATIC_SLUG_PATTERN.test(slug)) {
    return null;
  }

  return slug;
}

function toTitleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
    .join(" ");
}

function RouteScreen(props: { path: string; user: SessionUser; accessToken: string }) {
  if (props.path === "/users") {
    return <UsersPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/roles") {
    return <RolesPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/module-roles") {
    return <ModuleRolesPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/companies") {
    return <CompaniesPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/outlets") {
    return <OutletsPage user={props.user} accessToken={props.accessToken} />;
  }
  // Handle legacy route redirect
  if (props.path === "/items-prices") {
    // Redirect to new /items page
    window.location.hash = "#/items";
    return <ItemsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/items") {
    return <ItemsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/prices") {
    return <PricesPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/item-groups") {
    return <ItemGroupsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/supplies") {
    return <SuppliesPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/fixed-assets") {
    return <FixedAssetsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/sales-invoices") {
    return <SalesInvoicesPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/sales-payments") {
    return <SalesPaymentsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/pos-transactions") {
    return <PosTransactionsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/pos-payments") {
    return <PosPaymentsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/outlet-tables") {
    return <OutletTablesPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/reservations") {
    return <ReservationsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/table-board") {
    return <TableBoardPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/daily-sales") {
    return <DailySalesPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/profit-loss") {
    return <ProfitLossPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/general-ledger") {
    return <GeneralLedgerPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/chart-of-accounts") {
    return <AccountsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/fiscal-years") {
    return <FiscalYearsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/account-types") {
    return <AccountTypesPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/transactions") {
    return <TransactionsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/transaction-templates") {
    return <TransactionTemplatesPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/sync-queue") {
    return <SyncQueuePage user={props.user} />;
  }
  if (props.path === "/sync-history") {
    return <SyncHistoryPage user={props.user} />;
  }
  if (props.path === "/pwa-settings") {
    return <PWASettingsPage />;
  }
  if (props.path === "/account-mappings") {
    return <AccountMappingsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/outlet-settings" || props.path === "/feature-settings") {
    return <FeatureSettingsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/modules" || props.path === "/feature-flags") {
    return <ModulesPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/tax-rates") {
    return <TaxRatesPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/inventory-settings") {
    return <InventorySettingsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/static-pages") {
    return <StaticPagesPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/platform-settings") {
    return <PlatformSettingsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/journals") {
    return <JournalsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/accounting-worksheet") {
    return <AccountingWorksheetPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/audit-logs") {
    return <AuditLogsPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/cash-bank") {
    return <CashBankPage user={props.user} accessToken={props.accessToken} />;
  }
  // Fallback: redirect to items page
  window.location.hash = "#/items";
  return <ItemsPage user={props.user} accessToken={props.accessToken} />;
}

export function AppRouter() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string>(DEFAULT_ROUTE_PATH);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const googleClientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "";
  const googleEnabled = googleClientId.length > 0;

  const {
    enabledByCode: enabledModules,
    loading: modulesLoading,
    source: modulesSource
  } = useModules(accessToken, user?.company_id ?? null);

  const {
    count: alertCount,
    items: alertItems,
    readItems: alertReadItems,
    loading: alertsLoading,
    refreshing: alertsRefreshing,
    refresh: refreshAlerts,
    markAllAsRead: markAllAlertsRead
  } = useHeaderAlerts(user?.id ?? null);

  useEffect(() => {
    const nextPath = resolvePathFromLocation();
    setActivePath(nextPath);
    ensureHash(nextPath);

    function handleHashChange() {
      const routePath = normalizeHashPath(globalThis.location.hash);
      setActivePath(routePath);
      ensureHash(routePath);
    }

    globalThis.addEventListener("hashchange", handleHashChange);
    return () => {
      globalThis.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function applySession(session: { token: string; user: SessionUser }) {
      if (disposed) {
        return;
      }

      setAccessToken(session.token);
      setUser(session.user);
      setSessionStatus("authenticated");

      const publicSlug = getPublicStaticSlugFromLocation(globalThis.location);
      if (!publicSlug) {
        const firstPath = APP_ROUTES.find((item) =>
          userCanAccessRoute(session.user.roles, item, session.user.global_roles)
        )?.path;
        ensureHash(firstPath ?? DEFAULT_ROUTE_PATH);
        globalThis.history.replaceState({}, "", `/${globalThis.location.hash}`);
      }
    }

    async function handleGoogleCallback(): Promise<boolean> {
      const url = new URL(globalThis.location.href);
      if (url.pathname !== "/auth/callback") {
        return false;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const storedState = globalThis.sessionStorage.getItem(OAUTH_STATE_KEY);
      const companyCode = globalThis.sessionStorage.getItem(OAUTH_COMPANY_KEY);
      globalThis.sessionStorage.removeItem(OAUTH_STATE_KEY);
      globalThis.sessionStorage.removeItem(OAUTH_COMPANY_KEY);

      setAuthError(null);
      setAuthLoading(true);
      setSessionStatus("loading");

      if (!code || !state || !storedState || storedState !== state || !companyCode) {
        setAuthError("Google sign-in failed. Please try again.");
        setSessionStatus("anonymous");
        setAuthLoading(false);
        globalThis.history.replaceState({}, "", "/");
        return true;
      }

      try {
        const redirectUri = `${globalThis.location.origin}/auth/callback`;
        const session = await loginWithGoogle({
          companyCode,
          code,
          redirectUri
        });
        await applySession(session);
      } catch (error) {
        if (error instanceof ApiError) {
          setAuthError(error.message);
        } else {
          setAuthError("Google sign-in failed");
        }
        setSessionStatus("anonymous");
        globalThis.history.replaceState({}, "", "/");
      } finally {
        setAuthLoading(false);
      }

      return true;
    }

    async function bootstrap() {
      const handledCallback = await handleGoogleCallback();
      if (handledCallback || disposed) {
        return;
      }

      // Try to get token from memory first
      let token = getStoredAccessToken();
      
      // If no token in memory, try refresh with httpOnly cookie
      if (!token) {
        token = await refreshAccessToken();
      }
      
      if (!token) {
        setSessionStatus("anonymous");
        return;
      }

      try {
        const currentUser = await fetchCurrentUser(token);
        await applySession({ token, user: currentUser });
      } catch {
        // If fetch fails, try refresh once more
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          try {
            const currentUser = await fetchCurrentUser(refreshed);
            await applySession({ token: refreshed, user: currentUser });
            return;
          } catch {
            // Fall through to clear
          }
        }
        clearAccessToken();
        setSessionStatus("anonymous");
      }
    }

    bootstrap().catch(() => {
      clearAccessToken();
      setSessionStatus("anonymous");
    });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!user || !accessToken) {
      return;
    }

    const outletId = user.outlets[0]?.id ?? 0;
    const cleanup = setupMasterDataRefresh({
      companyId: user.company_id,
      outletId,
      accessToken
    });

    return cleanup;
  }, [user, accessToken]);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    return setupAutoSync(accessToken, user.id);
  }, [accessToken, user]);

  const availableRoutes = useMemo(() => {
    if (!user) {
      return APP_ROUTES;
    }
    const roleFiltered = APP_ROUTES.filter((route) =>
      userCanAccessRoute(user.roles, route, user.global_roles)
    );
    const moduleFiltered = filterRoutesByModules(roleFiltered, enabledModules);
    return moduleFiltered;
  }, [user, enabledModules]);

  const publicSlug =
    typeof window !== "undefined" ? getPublicStaticSlugFromLocation(globalThis.location) : null;

  if (publicSlug) {
    const fallbackTitle = toTitleCaseSlug(publicSlug) || "Page";
    return <PublicStaticPage slug={publicSlug} fallbackTitle={fallbackTitle} />;
  }

  // Public unauthenticated routes
  const urlParams = typeof window !== "undefined" ? new URLSearchParams(globalThis.location.search) : null;
  const token = urlParams?.get("token") ?? "";

  if (activePath === "/reset-password" && token) {
    return <ResetPasswordPage token={token} />;
  }

  if (activePath === "/forgot-password") {
    return <ForgotPasswordPage />;
  }

  if (activePath === "/invite" && token) {
    return <InvitePage token={token} />;
  }

  if (activePath === "/verify-email") {
    return <VerifyEmailPage token={token} />;
  }

  const route = findRoute(activePath);
  const canAccess = !!(
    user &&
    route &&
    userCanAccessRoute(user.roles, route, user.global_roles) &&
    (!route.requiredModule || enabledModules[route.requiredModule] === true)
  );

  async function handleSignIn(input: { companyCode: string; email: string; password: string }) {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const session = await login(input);
      setAccessToken(session.token);
      setUser(session.user);
      setSessionStatus("authenticated");

      const firstPath = APP_ROUTES.find((item) =>
        userCanAccessRoute(session.user.roles, item, session.user.global_roles)
      )?.path;
      ensureHash(firstPath ?? DEFAULT_ROUTE_PATH);
    } catch (error) {
      if (error instanceof ApiError) {
        setAuthError(error.message);
      } else {
        setAuthError("Login failed");
      }
      setSessionStatus("anonymous");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleGoogleSignIn(companyCode: string) {
    if (!googleEnabled) {
      setAuthError("Google sign-in is not configured");
      return;
    }

    const trimmedCompanyCode = companyCode.trim();
    if (trimmedCompanyCode.length === 0) {
      setAuthError("Company code is required");
      return;
    }

    const state = crypto.randomUUID();
    globalThis.sessionStorage.setItem(OAUTH_STATE_KEY, state);
    globalThis.sessionStorage.setItem(OAUTH_COMPANY_KEY, trimmedCompanyCode);

    const redirectUri = `${globalThis.location.origin}/auth/callback`;
    const authUrl = new URL(GOOGLE_OAUTH_URL);
    authUrl.searchParams.set("client_id", googleClientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("prompt", "select_account");
    authUrl.searchParams.set("state", state);

    globalThis.location.assign(authUrl.toString());
  }

  function handleSignOut() {
    void fetch(`${getApiBaseUrl()}/auth/logout`, {
      method: "POST",
      credentials: "include"
    }).catch(() => null);
    clearAccessToken();
    setAccessToken(null);
    setUser(null);
    setSessionStatus("anonymous");
    setAuthError(null);
  }

  if (sessionStatus === "loading") {
    return <main style={{ padding: "24px", fontFamily: "ui-sans-serif" }}>Loading backoffice...</main>;
  }

  if (sessionStatus !== "authenticated" || !user || !accessToken) {
    return (
      <LoginPage
        isLoading={authLoading}
        error={authError}
        onSubmit={handleSignIn}
        onGoogleSignIn={handleGoogleSignIn}
        googleEnabled={googleEnabled}
      />
    );
  }

  const warningSource: "cached" | "empty" | null =
    !modulesLoading && modulesSource !== "live" ? modulesSource : null;

  return (
    <>
      <AppLayout
        user={user}
        routes={availableRoutes}
        activePath={route?.path ?? DEFAULT_ROUTE_PATH}
        onNavigate={ensureHash}
        onSignOut={handleSignOut}
        alertCount={alertCount}
        alertItems={alertItems}
        alertReadItems={alertReadItems}
        alertsLoading={alertsLoading}
        alertsRefreshing={alertsRefreshing}
        onRefreshAlerts={refreshAlerts}
        onMarkAllAlertsRead={markAllAlertsRead}
      >
        {warningSource ? <ModuleConfigWarning source={warningSource} /> : null}
        {canAccess && route ? (
          <RouteScreen path={route.path} user={user} accessToken={accessToken} />
        ) : (
          <ForbiddenPage />
        )}
      </AppLayout>
      <SyncNotification accessToken={accessToken} userId={user.id} />
    </>
  );
}
