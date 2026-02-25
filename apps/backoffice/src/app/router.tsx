import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "./layout";
import {
  APP_ROUTES,
  DEFAULT_ROUTE_PATH,
  findRoute,
  normalizeHashPath,
  userCanAccessRoute
} from "./routes";
import { ApiError } from "../lib/api-client";
import { setupMasterDataRefresh } from "../lib/cache-service";
import { setupAutoSync } from "../lib/auto-sync";
import { SyncNotification } from "../components/sync-notification";
import {
  clearAccessToken,
  fetchCurrentUser,
  getStoredAccessToken,
  login,
  type SessionUser
} from "../lib/session";
import { LoginPage } from "../features/auth/login-page";
import {
  AccountsPage,
  AccountTypesPage,
  TransactionsPage,
  TransactionTemplatesPage,
  DailySalesPage,
  ForbiddenPage,
  ItemsPricesPage,
  JournalsPage,
  PosPaymentsPage,
  PosTransactionsPage,
  SalesInvoicesPage,
  SalesPaymentsPage
} from "../features/pages";
import { SyncQueuePage } from "../features/sync-queue-page";
import { SyncHistoryPage } from "../features/sync-history-page";
import { PWASettingsPage } from "../features/pwa-settings-page";

type SessionStatus = "loading" | "anonymous" | "authenticated";

function ensureHash(path: string): void {
  if (globalThis.location.hash !== `#${path}`) {
    globalThis.location.hash = `#${path}`;
  }
}

function RouteScreen(props: { path: string; user: SessionUser; accessToken: string }) {
  if (props.path === "/items-prices") {
    return <ItemsPricesPage user={props.user} accessToken={props.accessToken} />;
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
  if (props.path === "/daily-sales") {
    return <DailySalesPage user={props.user} accessToken={props.accessToken} />;
  }
  if (props.path === "/chart-of-accounts") {
    return <AccountsPage user={props.user} accessToken={props.accessToken} />;
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
    return <SyncQueuePage />;
  }
  if (props.path === "/sync-history") {
    return <SyncHistoryPage />;
  }
  if (props.path === "/pwa-settings") {
    return <PWASettingsPage />;
  }
  if (props.path === "/journals") {
    return <JournalsPage user={props.user} accessToken={props.accessToken} />;
  }
  return <ItemsPricesPage user={props.user} accessToken={props.accessToken} />;
}

export function AppRouter() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string>(DEFAULT_ROUTE_PATH);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const nextPath = normalizeHashPath(globalThis.location.hash);
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
    async function bootstrap() {
      const token = getStoredAccessToken();
      if (!token) {
        setSessionStatus("anonymous");
        return;
      }

      try {
        const currentUser = await fetchCurrentUser(token);
        setAccessToken(token);
        setUser(currentUser);
        setSessionStatus("authenticated");
      } catch {
        clearAccessToken();
        setSessionStatus("anonymous");
      }
    }

    bootstrap().catch(() => {
      clearAccessToken();
      setSessionStatus("anonymous");
    });
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
    if (!accessToken) {
      return;
    }

    return setupAutoSync(accessToken);
  }, [accessToken]);

  const availableRoutes = useMemo(() => {
    if (!user) {
      return APP_ROUTES;
    }
    return APP_ROUTES.filter((route) => userCanAccessRoute(user.roles, route));
  }, [user]);

  const route = findRoute(activePath);
  const canAccess = !!(user && route && userCanAccessRoute(user.roles, route));

  async function handleSignIn(input: { companyCode: string; email: string; password: string }) {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const session = await login(input);
      setAccessToken(session.token);
      setUser(session.user);
      setSessionStatus("authenticated");

      const firstPath = APP_ROUTES.find((item) => userCanAccessRoute(session.user.roles, item))?.path;
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

  function handleSignOut() {
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
    return <LoginPage isLoading={authLoading} error={authError} onSubmit={handleSignIn} />;
  }

  return (
    <>
      <AppLayout
        user={user}
        routes={availableRoutes}
        activePath={route?.path ?? DEFAULT_ROUTE_PATH}
        onNavigate={ensureHash}
        onSignOut={handleSignOut}
      >
        {canAccess && route ? (
          <RouteScreen path={route.path} user={user} accessToken={accessToken} />
        ) : (
          <ForbiddenPage />
        )}
      </AppLayout>
      <SyncNotification accessToken={accessToken} />
    </>
  );
}
