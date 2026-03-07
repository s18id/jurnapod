// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { createContext, useContext, useMemo, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation
} from "react-router-dom";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import type { RuntimeOutletScope } from "../services/runtime-service.js";
import { routes, mobileTabs, type RouterContextValue, type ProtectedRouteProps } from "./routes.js";
import { TabBar } from "../shared/components/TabBar.js";
import { LoginPage } from "../pages/LoginPage.js";
import { CheckoutPage } from "../pages/CheckoutPage.js";
import { ProductsPage } from "../pages/ProductsPage.js";
import { CartPage } from "../pages/CartPage.js";
import { SettingsPage } from "../pages/SettingsPage.js";
import { readAccessToken, clearAccessToken } from "../offline/auth-session.js";
import { useCart } from "../features/cart/useCart.js";
import { API_CONFIG, POLL_INTERVAL_MS } from "../shared/utils/constants.js";
import { PosAppStateContext } from "./pos-app-state.js";

const PLACEHOLDER_OUTLETS = [{ outlet_id: 1, label: "Outlet 1 (placeholder)" }];

interface MeResponse {
  success: boolean;
  data?: {
    company_id: number;
    outlets: Array<{ id: number; code: string; name: string }>;
  };
}

const RouterContext = createContext<RouterContextValue | null>(null);

export function useRouterContext(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error("useRouterContext must be used within RouterProvider");
  }
  return ctx;
}

function ProtectedRoute({ children, context, authToken }: ProtectedRouteProps): JSX.Element {
  const location = useLocation();

  if (!authToken) {
    return <Navigate to={routes.login.path} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

interface AppLayoutProps {
  children: ReactNode;
  context: WebBootstrapContext;
  authToken: string | null;
  cartItemCount: number;
}

function AppLayout({ children, context, authToken, cartItemCount }: AppLayoutProps): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = useMemo(() => 
    mobileTabs.map(tab => ({
      ...tab,
      badge: tab.id === "cart" ? cartItemCount : undefined
    })),
    [cartItemCount]
  );

  const handleTabChange = (tabId: string) => {
    const route = mobileTabs.find(t => t.id === tabId);
    if (route) {
      navigate(route.path);
    }
  };

  const currentTabId = useMemo(() => {
    const current = mobileTabs.find(t => t.path === location.pathname);
    return current?.id ?? "checkout";
  }, [location.pathname]);

  return (
    <div style={{ 
      minHeight: "100vh", 
      paddingBottom: "60px",
      display: "flex",
      flexDirection: "column"
    }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
      <TabBar
        tabs={tabs}
        activeTab={currentTabId}
        onTabChange={handleTabChange}
      />
    </div>
  );
}

interface PosRouterProps {
  context: WebBootstrapContext;
  cartItemCount?: number;
}

export function PosRouter({ context, cartItemCount = 0 }: PosRouterProps): JSX.Element {
  const [authToken, setAuthToken] = useState<string | null>(() => readAccessToken());
  const [scope, setScope] = useState<RuntimeOutletScope>({
    company_id: 1,
    outlet_id: PLACEHOLDER_OUTLETS[0].outlet_id
  });
  const [outletOptions, setOutletOptions] = useState(PLACEHOLDER_OUTLETS);
  const [isOnline, setIsOnline] = useState<boolean>(() => context.runtime.isOnline());
  const [pendingOutboxCount, setPendingOutboxCount] = useState<number>(0);
  const [hasProductCache, setHasProductCache] = useState<boolean>(false);
  const [lastDataVersion, setLastDataVersion] = useState<number>(0);
  const [pullSyncInFlight, setPullSyncInFlight] = useState<boolean>(false);
  const [pushSyncInFlight, setPushSyncInFlight] = useState<boolean>(false);
  const [pullSyncMessage, setPullSyncMessage] = useState<string | null>(null);
  const [pushSyncMessage, setPushSyncMessage] = useState<string | null>(null);
  const cartState = useCart();

  const routerValue = useMemo(() => ({
    context,
    authToken
  }), [context, authToken]);

  const syncBadgeState = context.runtime.resolveSyncBadgeState(isOnline, pendingOutboxCount);

  const effectiveCartItemCount =
    cartItemCount > 0
      ? cartItemCount
      : Object.values(cartState.cart).reduce((sum, line) => sum + line.qty, 0);

  const runSyncPullNow = useCallback(async () => {
    if (pullSyncInFlight) {
      return;
    }
    setPullSyncInFlight(true);
    setPullSyncMessage(null);
    try {
      const result = await context.orchestrator.executePull(scope);
      if (result.success) {
        setPullSyncMessage(
          `Sync pull applied (version ${result.data_version}, ${result.upserted_product_count} cached rows).`
        );
        setLastDataVersion(result.data_version);
      } else {
        setPullSyncMessage(result.message ?? "Sync pull failed.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setPullSyncMessage(`Sync pull failed: ${message}`);
    } finally {
      setPullSyncInFlight(false);
    }
  }, [context, pullSyncInFlight, scope]);

  const runSyncPushNow = useCallback(async () => {
    if (pushSyncInFlight) {
      return;
    }
    setPushSyncInFlight(true);
    setPushSyncMessage("Sync push requested...");
    try {
      await context.orchestrator.requestPush("MANUAL_PUSH");
      setPushSyncMessage("Sync push completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setPushSyncMessage(`Sync push failed: ${message}`);
    } finally {
      setPushSyncInFlight(false);
    }
  }, [context, pushSyncInFlight]);

  useEffect(() => {
    let disposed = false;
    let refreshQueue = Promise.resolve();

    context.orchestrator.updateConfig({
      apiOrigin: API_CONFIG.baseUrl,
      accessToken: authToken ?? undefined
    });
    context.orchestrator.initialize();

    const runRefresh = async () => {
      const [snapshot, dataVersion] = await Promise.all([
        context.runtime.getOfflineSnapshot(scope),
        context.sync.getSyncDataVersion(scope)
      ]);

      if (disposed) {
        return;
      }

      setIsOnline(context.runtime.isOnline());
      setPendingOutboxCount(snapshot.pending_outbox_count);
      setHasProductCache(snapshot.has_product_cache);
      setLastDataVersion(dataVersion);
    };

    const scheduleRefresh = () => {
      refreshQueue = refreshQueue.then(runRefresh).catch((error: unknown) => {
        if (!disposed) {
          console.error("Failed to refresh offline runtime state", error);
        }
      });
    };

    const unsubscribeNetwork = context.runtime.onNetworkStatusChange((online) => {
      if (disposed) {
        return;
      }
      setIsOnline(online);
      scheduleRefresh();
    });

    scheduleRefresh();
    const intervalId = window.setInterval(scheduleRefresh, POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      context.orchestrator.dispose();
      unsubscribeNetwork();
      window.clearInterval(intervalId);
    };
  }, [authToken, context, scope]);

  const appStateValue = useMemo(
    () => ({
      scope,
      setScope,
      outletOptions,
      syncBadgeState,
      pendingOutboxCount,
      hasProductCache,
      lastDataVersion,
      pullSyncInFlight,
      pushSyncInFlight,
      pullSyncMessage,
      pushSyncMessage,
      runSyncPullNow,
      runSyncPushNow,
      cart: cartState.cart,
      cartLines: cartState.cartLines,
      cartTotals: cartState.cartTotals,
      paidAmount: cartState.paidAmount,
      setPaidAmount: cartState.setPaidAmount,
      upsertCartLine: cartState.upsertCartLine,
      clearCart: cartState.clearCart
    }),
    [
      scope,
      outletOptions,
      syncBadgeState,
      pendingOutboxCount,
      hasProductCache,
      lastDataVersion,
      pullSyncInFlight,
      pushSyncInFlight,
      pullSyncMessage,
      pushSyncMessage,
      runSyncPullNow,
      runSyncPushNow,
      cartState
    ]
  );

  const hydrateSessionScope = useCallback(
    async (token: string): Promise<void> => {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/users/me`, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error("Failed to load user outlets");
      }

      const payload = (await response.json()) as MeResponse;
      if (!payload.success || !payload.data || payload.data.outlets.length === 0) {
        throw new Error("No outlet access found for this user");
      }

      const nextOutlets = payload.data.outlets.map((outlet) => ({
        outlet_id: Number(outlet.id),
        label: `${outlet.code} - ${outlet.name}`
      }));

      setOutletOptions(nextOutlets);
      setScope((previous) => {
        const stillAvailable = nextOutlets.some((outlet) => outlet.outlet_id === previous.outlet_id);
        return {
          company_id: Number(payload.data?.company_id),
          outlet_id: stillAvailable ? previous.outlet_id : nextOutlets[0].outlet_id
        };
      });
    },
    []
  );

  useEffect(() => {
    let disposed = false;

    async function bootstrapSession() {
      if (!authToken) {
        setOutletOptions(PLACEHOLDER_OUTLETS);
        setScope({ company_id: 1, outlet_id: PLACEHOLDER_OUTLETS[0].outlet_id });
        return;
      }

      try {
        await hydrateSessionScope(authToken);
      } catch {
        if (disposed) {
          return;
        }
        clearAccessToken();
        setAuthToken(null);
        setOutletOptions(PLACEHOLDER_OUTLETS);
        setScope({ company_id: 1, outlet_id: PLACEHOLDER_OUTLETS[0].outlet_id });
      }
    }

    void bootstrapSession();

    return () => {
      disposed = true;
    };
  }, [authToken, hydrateSessionScope]);

  const handleAuthChange = async (newToken: string | null): Promise<void> => {
    if (!newToken) {
      setAuthToken(null);
      setOutletOptions(PLACEHOLDER_OUTLETS);
      setScope({ company_id: 1, outlet_id: PLACEHOLDER_OUTLETS[0].outlet_id });
      return;
    }

    await hydrateSessionScope(newToken);
    setAuthToken(newToken);
  };

  const handleLogout = () => {
    clearAccessToken();
    setAuthToken(null);
  };

  return (
    <RouterContext.Provider value={routerValue}>
      <PosAppStateContext.Provider value={appStateValue}>
      <BrowserRouter>
        <Routes>
          <Route
            path={routes.login.path}
            element={
              authToken ? (
                <Navigate to={routes.checkout.path} replace />
              ) : (
                <LoginPage
                  context={context}
                  onAuthSuccess={handleAuthChange}
                />
              )
            }
          />
          <Route
            path="/auth/callback"
            element={
              authToken ? (
                <Navigate to={routes.checkout.path} replace />
              ) : (
                <LoginPage
                  context={context}
                  onAuthSuccess={handleAuthChange}
                />
              )
            }
          />
          <Route
            path={routes.checkout.path}
            element={
              <ProtectedRoute context={context} authToken={authToken}>
                <AppLayout context={context} authToken={authToken} cartItemCount={effectiveCartItemCount}>
                  <CheckoutPage 
                    context={context} 
                    onLogout={handleLogout}
                  />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={routes.products.path}
            element={
              <ProtectedRoute context={context} authToken={authToken}>
                <AppLayout context={context} authToken={authToken} cartItemCount={effectiveCartItemCount}>
                  <ProductsPage 
                    context={context}
                  />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={routes.cart.path}
            element={
              <ProtectedRoute context={context} authToken={authToken}>
                <AppLayout context={context} authToken={authToken} cartItemCount={effectiveCartItemCount}>
                  <CartPage 
                    context={context}
                  />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={routes.settings.path}
            element={
              <ProtectedRoute context={context} authToken={authToken}>
                <AppLayout context={context} authToken={authToken} cartItemCount={effectiveCartItemCount}>
                  <SettingsPage context={context} onLogout={handleLogout} />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to={routes.checkout.path} replace />} />
        </Routes>
      </BrowserRouter>
      </PosAppStateContext.Provider>
    </RouterContext.Provider>
  );
}
