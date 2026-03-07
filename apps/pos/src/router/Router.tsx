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
import type { RuntimeOutletScope, RuntimeOutletTable, RuntimeReservation } from "../services/runtime-service.js";
import { routes, mobileTabs, type RouterContextValue, type ProtectedRouteProps } from "./routes.js";
import { TabBar } from "../shared/components/TabBar.js";
import { LoginPage } from "../pages/LoginPage.js";
import { CheckoutPage } from "../pages/CheckoutPage.js";
import { ProductsPage } from "../pages/ProductsPage.js";
import { TablesPage } from "../pages/TablesPage.js";
import { ReservationsPage } from "../pages/ReservationsPage.js";
import { CartPage } from "../pages/CartPage.js";
import { SettingsPage } from "../pages/SettingsPage.js";
import { SyncBadge } from "../features/sync/SyncBadge.js";
import { OutletContextSwitcher } from "../features/outlet/OutletContextSwitcher.js";
import { readAccessToken, clearAccessToken } from "../offline/auth-session.js";
import { useCart } from "../features/cart/useCart.js";
import { API_CONFIG, POLL_INTERVAL_MS } from "../shared/utils/constants.js";
import { PosAppStateContext, usePosAppState } from "./pos-app-state.js";

const PLACEHOLDER_OUTLETS = [{ outlet_id: 1, label: "Outlet 1 (placeholder)" }];
const AUTO_REFRESH_STORAGE_KEY = "jurnapod_pos_auto_refresh_enabled";
const AUTO_PULL_ENABLED_STORAGE_KEY = "jurnapod_pos_auto_pull_enabled";
const AUTO_PULL_INTERVAL_STORAGE_KEY = "jurnapod_pos_auto_pull_interval_ms";
const AUTO_PULL_INTERVAL_OPTIONS_MS = [30000, 60000, 300000] as const;

function readAutoRefreshEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  const raw = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
  if (raw === null) {
    return true;
  }

  return raw === "true";
}

function readAutoPullEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  const raw = window.localStorage.getItem(AUTO_PULL_ENABLED_STORAGE_KEY);
  if (raw === null) {
    return true;
  }

  return raw === "true";
}

function readAutoPullIntervalMs(): number {
  if (typeof window === "undefined") {
    return 60000;
  }

  const raw = window.localStorage.getItem(AUTO_PULL_INTERVAL_STORAGE_KEY);
  const parsed = raw ? Number(raw) : 60000;
  if (!AUTO_PULL_INTERVAL_OPTIONS_MS.includes(parsed as (typeof AUTO_PULL_INTERVAL_OPTIONS_MS)[number])) {
    return 60000;
  }

  return parsed;
}

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
  cartItemCount: number;
}

function AppLayout({ children, cartItemCount }: AppLayoutProps): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { context } = useRouterContext();
  const [isCompactHeader, setIsCompactHeader] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth < 420;
  });
  const {
    scope,
    setScope,
    outletOptions,
    syncBadgeState,
    pendingOutboxCount,
    clearCart,
    setPaidAmount,
    activeOrderContext,
    outletReservations,
    activeReservationId,
    setActiveReservationId,
    setOutletTables,
    setOutletReservations
  } = usePosAppState();

  const activeReservation = useMemo(
    () => outletReservations.find((row) => row.reservation_id === activeReservationId) ?? null,
    [activeReservationId, outletReservations]
  );

  const activePageLabel = useMemo(() => {
    const activeTab = mobileTabs.find((tab) => tab.path === location.pathname);
    if (activeTab) {
      return activeTab.label;
    }
    if (location.pathname === routes.login.path) {
      return routes.login.label;
    }
    return "POS";
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setIsCompactHeader(window.innerWidth < 420);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

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
    return current?.id ?? "";
  }, [location.pathname]);

  return (
    <div style={{ 
      minHeight: "100vh", 
      paddingBottom: "60px",
      display: "flex",
      flexDirection: "column"
    }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e2e8f0",
            background: "#ffffff",
            position: "sticky",
            top: 0,
            zIndex: 20
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: isCompactHeader ? "flex-start" : "center",
              gap: 10,
              flexDirection: isCompactHeader ? "column" : "row"
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Jurnapod POS</div>
              <div style={{ fontSize: 16, color: "#0f172a", fontWeight: 700 }}>{activePageLabel}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: isCompactHeader ? "100%" : "auto", flexWrap: "wrap" }}>
              <SyncBadge status={syncBadgeState} pendingCount={pendingOutboxCount} />
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: activeOrderContext.service_type === "DINE_IN" ? "#1d4ed8" : "#0f172a",
                  background: activeOrderContext.service_type === "DINE_IN" ? "#eff6ff" : "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: 999,
                  padding: "4px 8px"
                }}
              >
                {activeOrderContext.service_type === "DINE_IN"
                  ? `Dine-in${activeOrderContext.table_id ? ` • T${activeOrderContext.table_id}` : " • No table"}`
                  : "Takeaway"}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#0f172a",
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: 999,
                  padding: "4px 8px"
                }}
              >
                Cart: {cartItemCount}
              </div>
              {activeReservation ? (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#1e3a8a",
                    background: "#dbeafe",
                    border: "1px solid #93c5fd",
                    borderRadius: 999,
                    padding: "4px 8px"
                  }}
                >
                  Resv: {activeReservation.customer_name} ({activeReservation.status})
                </div>
              ) : null}
              {cartItemCount > 0 ? (
                <button
                  type="button"
                  onClick={() => navigate(routes.checkout.path)}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#ffffff",
                    background: "#2563eb",
                    border: "1px solid #1d4ed8",
                    borderRadius: 999,
                    padding: "4px 10px",
                    cursor: "pointer"
                  }}
                >
                  Pay now
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => navigate(routes.settings.path)}
                aria-label="Open settings"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#0f172a",
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: 999,
                  padding: "4px 10px",
                  cursor: "pointer"
                }}
              >
                Settings
              </button>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <OutletContextSwitcher
              outletOptions={outletOptions}
              activeOutletId={scope.outlet_id}
              compact={isCompactHeader}
              onConfirmSwitch={(nextOutletId) => {
                void (async () => {
                  if (activeOrderContext.service_type === "DINE_IN" && activeOrderContext.table_id) {
                    await context.runtime.setOutletTableStatus(scope, activeOrderContext.table_id, "AVAILABLE");
                  }

                  setScope({
                    ...scope,
                    outlet_id: nextOutletId
                  });
                  clearCart();
                  setPaidAmount(0);
                  setOutletTables([]);
                  setOutletReservations([]);
                  setActiveReservationId(null);
                  navigate(routes.products.path);
                })();
              }}
            />
          </div>
        </header>
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
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(() => readAutoRefreshEnabled());
  const [autoPullEnabled, setAutoPullEnabled] = useState<boolean>(() => readAutoPullEnabled());
  const [autoPullIntervalMs, setAutoPullIntervalMs] = useState<number>(() => readAutoPullIntervalMs());
  const [hasProductCache, setHasProductCache] = useState<boolean>(false);
  const [lastDataVersion, setLastDataVersion] = useState<number>(0);
  const [pullSyncInFlight, setPullSyncInFlight] = useState<boolean>(false);
  const [pushSyncInFlight, setPushSyncInFlight] = useState<boolean>(false);
  const [pullSyncMessage, setPullSyncMessage] = useState<string | null>(null);
  const [pushSyncMessage, setPushSyncMessage] = useState<string | null>(null);
  const [outletTables, setOutletTables] = useState<RuntimeOutletTable[]>([]);
  const [outletReservations, setOutletReservations] = useState<RuntimeReservation[]>([]);
  const [activeReservationId, setActiveReservationId] = useState<number | null>(null);
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
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, autoRefreshEnabled ? "true" : "false");
  }, [autoRefreshEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(AUTO_PULL_ENABLED_STORAGE_KEY, autoPullEnabled ? "true" : "false");
  }, [autoPullEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(AUTO_PULL_INTERVAL_STORAGE_KEY, String(autoPullIntervalMs));
  }, [autoPullIntervalMs]);

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

    const runAutoPullIfNeeded = async () => {
      if (!authToken) {
        return;
      }

      const snapshot = await context.runtime.getOfflineSnapshot(scope);
      if (snapshot.has_product_cache) {
        return;
      }

      const result = await context.orchestrator.executePull(scope);
      if (disposed) {
        return;
      }

      if (result.success) {
        setPullSyncMessage(
          `Auto sync pull applied (version ${result.data_version}, ${result.upserted_product_count} cached rows).`
        );
        setLastDataVersion(result.data_version);
      } else {
        setPullSyncMessage(result.message ?? "Auto sync pull failed.");
      }

      scheduleRefresh();
    };

    const runAutoPull = async () => {
      if (!authToken || !autoPullEnabled) {
        return;
      }

      const result = await context.orchestrator.executePull(scope);
      if (disposed) {
        return;
      }

      if (result.success) {
        setLastDataVersion(result.data_version);
        if (result.upserted_product_count > 0) {
          setPullSyncMessage(
            `Auto pull applied (version ${result.data_version}, ${result.upserted_product_count} cached rows).`
          );
        }
      }
      scheduleRefresh();
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
    void runAutoPullIfNeeded();
    const intervalId = autoRefreshEnabled ? window.setInterval(scheduleRefresh, POLL_INTERVAL_MS) : null;
    const autoPullIntervalId =
      autoPullEnabled && authToken ? window.setInterval(() => { void runAutoPull(); }, autoPullIntervalMs) : null;

    return () => {
      disposed = true;
      context.orchestrator.dispose();
      unsubscribeNetwork();
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      if (autoPullIntervalId !== null) {
        window.clearInterval(autoPullIntervalId);
      }
    };
  }, [authToken, autoPullEnabled, autoPullIntervalMs, autoRefreshEnabled, context, scope]);

  const appStateValue = useMemo(
    () => ({
      scope,
      setScope,
      outletOptions,
      syncBadgeState,
      pendingOutboxCount,
      autoRefreshEnabled,
      setAutoRefreshEnabled,
      autoPullEnabled,
      setAutoPullEnabled,
      autoPullIntervalMs,
      setAutoPullIntervalMs,
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
      clearCart: cartState.clearCart,
      activeOrderContext: cartState.activeOrderContext,
      setServiceType: cartState.setServiceType,
      setActiveTableId: cartState.setActiveTableId,
      setOrderReservationId: cartState.setOrderReservationId,
      setGuestCount: cartState.setGuestCount,
      setOrderStatus: cartState.setOrderStatus,
      setOrderNotes: cartState.setOrderNotes,
      outletTables,
      setOutletTables,
      outletReservations,
      setOutletReservations,
      activeReservationId,
      setActiveReservationId
    }),
    [
      scope,
      outletOptions,
      syncBadgeState,
      pendingOutboxCount,
      autoRefreshEnabled,
      autoPullEnabled,
      autoPullIntervalMs,
      hasProductCache,
      lastDataVersion,
      pullSyncInFlight,
      pushSyncInFlight,
      pullSyncMessage,
      pushSyncMessage,
      runSyncPullNow,
      runSyncPushNow,
      cartState,
      outletTables,
      outletReservations,
      activeReservationId
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
                <Navigate to={routes.products.path} replace />
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
                <Navigate to={routes.products.path} replace />
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
                <AppLayout cartItemCount={effectiveCartItemCount}>
                  <CheckoutPage context={context} />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={routes.tables.path}
            element={
              <ProtectedRoute context={context} authToken={authToken}>
                <AppLayout cartItemCount={effectiveCartItemCount}>
                  <TablesPage context={context} />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={routes.reservations.path}
            element={
              <ProtectedRoute context={context} authToken={authToken}>
                <AppLayout cartItemCount={effectiveCartItemCount}>
                  <ReservationsPage context={context} />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={routes.products.path}
            element={
              <ProtectedRoute context={context} authToken={authToken}>
                <AppLayout cartItemCount={effectiveCartItemCount}>
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
                <AppLayout cartItemCount={effectiveCartItemCount}>
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
                <AppLayout cartItemCount={effectiveCartItemCount}>
                  <SettingsPage context={context} onLogout={handleLogout} />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to={routes.products.path} replace />} />
        </Routes>
      </BrowserRouter>
      </PosAppStateContext.Provider>
    </RouterContext.Provider>
  );
}
