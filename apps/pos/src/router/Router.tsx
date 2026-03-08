// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
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
import {
  LoginPage,
  CheckoutPage,
  ProductsPage,
  TablesPage,
  ReservationsPage,
  CartPage,
  SettingsPage,
  ServiceModePage
} from "../pages/index.js";
import { SyncBadge } from "../features/sync/SyncBadge.js";
import { OutletContextSwitcher } from "../features/outlet/OutletContextSwitcher.js";
import { readAccessToken, clearAccessToken } from "../offline/auth-session.js";
import { useCart, type ActiveOrderContextState, type CartState } from "../features/cart/useCart.js";
import { API_CONFIG, MOBILE_BREAKPOINT, POLL_INTERVAL_MS } from "../shared/utils/constants.js";
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
  const [isMobileNav, setIsMobileNav] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth < MOBILE_BREAKPOINT;
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
      setIsMobileNav(window.innerWidth < MOBILE_BREAKPOINT);
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

  const headerNavItems = useMemo(
    () => [routes.products, routes.tables, routes.reservations, routes.cart, routes.checkout, routes.settings],
    []
  );

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
              hasActiveTable={activeOrderContext.table_id !== null}
              serviceType={activeOrderContext.service_type}
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
          {!isMobileNav ? (
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {headerNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                const cartBadge = item.id === "cart" && cartItemCount > 0 ? ` (${cartItemCount})` : "";

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.path)}
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: isActive ? "#1d4ed8" : "#334155",
                      background: isActive ? "#dbeafe" : "#f8fafc",
                      border: `1px solid ${isActive ? "#93c5fd" : "#cbd5e1"}`,
                      borderRadius: 999,
                      padding: "6px 10px",
                      cursor: "pointer"
                    }}
                  >
                    {item.icon} {item.label}
                    {cartBadge}
                  </button>
                );
              })}
            </div>
          ) : null}
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
  const [currentActiveOrderId, setCurrentActiveOrderId] = useState<string | null>(null);
  const cartState = useCart();
  const hydrateInProgressRef = useRef(false);
  const [activeOrderHydrated, setActiveOrderHydrated] = useState(false);

  const toCartState = useCallback((snapshotLines: Array<{
    item_id: number;
    sku_snapshot: string | null;
    name_snapshot: string;
    item_type_snapshot: string;
    unit_price_snapshot: number;
    qty: number;
    discount_amount: number;
  }>, orderIsFinalized: boolean): CartState => {
    const next: CartState = {};
    for (const line of snapshotLines) {
      next[line.item_id] = {
        product: {
          item_id: line.item_id,
          sku: line.sku_snapshot,
          name: line.name_snapshot,
          item_type: line.item_type_snapshot as "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE",
          price_snapshot: line.unit_price_snapshot
        },
        qty: line.qty,
        committed_qty: orderIsFinalized ? line.qty : 0,
        discount_amount: line.discount_amount
      };
    }
    return next;
  }, []);

  const toOrderContext = useCallback((order: {
    service_type: ActiveOrderContextState["service_type"];
    table_id: number | null;
    reservation_id: number | null;
    guest_count: number | null;
    is_finalized: boolean;
    order_status: ActiveOrderContextState["order_status"];
    opened_at: string;
    closed_at: string | null;
    notes: string | null;
  }): ActiveOrderContextState => ({
    service_type: order.service_type,
    table_id: order.table_id,
    reservation_id: order.reservation_id,
    guest_count: order.guest_count,
    is_finalized: order.is_finalized,
    order_status: order.order_status,
    opened_at: order.opened_at,
    closed_at: order.closed_at,
    notes: order.notes
  }), []);

  const hasMeaningfulOrderState = useMemo(() => {
    return (
      cartState.cartLines.length > 0
      || cartState.paidAmount > 0
      || cartState.activeOrderContext.service_type === "DINE_IN"
      || !!cartState.activeOrderContext.table_id
      || !!cartState.activeOrderContext.reservation_id
      || cartState.activeOrderContext.guest_count !== null
      || cartState.activeOrderContext.is_finalized
      || cartState.activeOrderContext.notes !== null
    );
  }, [cartState.activeOrderContext, cartState.cartLines.length, cartState.paidAmount]);

  const hydrateFromSnapshot = useCallback((input: {
    order_id: string;
    paid_amount: number;
    lines: Array<{
      item_id: number;
      sku_snapshot: string | null;
      name_snapshot: string;
      item_type_snapshot: string;
      unit_price_snapshot: number;
      qty: number;
      discount_amount: number;
    }>;
    order: {
      service_type: ActiveOrderContextState["service_type"];
      table_id: number | null;
      reservation_id: number | null;
      guest_count: number | null;
      is_finalized: boolean;
      order_status: ActiveOrderContextState["order_status"];
      opened_at: string;
      closed_at: string | null;
      notes: string | null;
    };
  }) => {
    hydrateInProgressRef.current = true;
    cartState.hydrateOrder({
      cart: toCartState(input.lines, input.order.is_finalized),
      paidAmount: input.paid_amount,
      activeOrderContext: toOrderContext(input.order)
    });
    setCurrentActiveOrderId(input.order_id);
    setActiveReservationId(input.order.reservation_id);
    hydrateInProgressRef.current = false;
  }, [cartState.hydrateOrder, toCartState, toOrderContext]);

  const persistCurrentOrderSnapshot = useCallback(async () => {
    if (!activeOrderHydrated || hydrateInProgressRef.current) {
      return null;
    }

    if (!hasMeaningfulOrderState && !currentActiveOrderId) {
      return null;
    }

    const snapshot = await context.runtime.upsertActiveOrderSnapshot(scope, {
      order_id: currentActiveOrderId ?? undefined,
      service_type: cartState.activeOrderContext.service_type,
      table_id: cartState.activeOrderContext.table_id,
      reservation_id: cartState.activeOrderContext.reservation_id,
      guest_count: cartState.activeOrderContext.guest_count,
      is_finalized: cartState.activeOrderContext.is_finalized,
      order_status: cartState.activeOrderContext.order_status,
      paid_amount: cartState.paidAmount,
      opened_at: cartState.activeOrderContext.opened_at,
      closed_at: cartState.activeOrderContext.closed_at,
      notes: cartState.activeOrderContext.notes,
      lines: cartState.cartLines.map((line) => ({
        item_id: line.product.item_id,
        sku_snapshot: line.product.sku,
        name_snapshot: line.product.name,
        item_type_snapshot: line.product.item_type,
        unit_price_snapshot: line.product.price_snapshot,
        qty: line.qty,
        discount_amount: line.discount_amount
      }))
    });

    if (snapshot.order.order_id !== currentActiveOrderId) {
      setCurrentActiveOrderId(snapshot.order.order_id);
    }

    return snapshot.order.order_id;
  }, [
    activeOrderHydrated,
    cartState.activeOrderContext,
    cartState.cartLines,
    cartState.paidAmount,
    context.runtime,
    currentActiveOrderId,
    hasMeaningfulOrderState,
    scope
  ]);

  const resolveAndHydrateActiveOrder = useCallback(async (input: {
    service_type: ActiveOrderContextState["service_type"];
    table_id?: number | null;
    reservation_id?: number | null;
    guest_count?: number | null;
    notes?: string | null;
  }) => {
    await persistCurrentOrderSnapshot();
    const resolved = await context.runtime.resolveActiveOrder(scope, input);
    hydrateFromSnapshot({
      order_id: resolved.order.order_id,
      paid_amount: resolved.order.paid_amount,
      lines: resolved.lines,
      order: resolved.order
    });
  }, [context.runtime, hydrateFromSnapshot, persistCurrentOrderSnapshot, scope]);

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

    void (async () => {
      setActiveOrderHydrated(false);
      const openOrders = await context.runtime.listActiveOrders(scope, "OPEN");

      if (disposed) {
        return;
      }

      if (openOrders.length === 0) {
        hydrateInProgressRef.current = true;
        cartState.clearCart();
        setCurrentActiveOrderId(null);
        setActiveReservationId(null);
        hydrateInProgressRef.current = false;
        setActiveOrderHydrated(true);
        return;
      }

      const latest = openOrders[0];
      const snapshot = await context.runtime.getActiveOrderSnapshot(scope, latest.order_id);
      if (disposed) {
        return;
      }

      if (snapshot) {
        hydrateFromSnapshot({
          order_id: snapshot.order.order_id,
          paid_amount: snapshot.order.paid_amount,
          lines: snapshot.lines,
          order: snapshot.order
        });
      }
      setActiveOrderHydrated(true);
    })().catch((error: unknown) => {
      if (!disposed) {
        console.error("Failed to hydrate active order", error);
        setActiveOrderHydrated(true);
      }
    });

    return () => {
      disposed = true;
    };
  }, [cartState.clearCart, context.runtime, hydrateFromSnapshot, scope]);

  useEffect(() => {
    let disposed = false;

    if (!activeOrderHydrated || hydrateInProgressRef.current) {
      return;
    }

    void (async () => {
      try {
        await persistCurrentOrderSnapshot();
      } catch (error) {
        if (!disposed) {
          console.error("Failed to persist active order snapshot", error);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [
    activeOrderHydrated,
    cartState.activeOrderContext,
    cartState.cartLines,
    cartState.paidAmount,
    persistCurrentOrderSnapshot
  ]);

  const clearCart = useCallback(() => {
    const orderId = currentActiveOrderId;
    setCurrentActiveOrderId(null);
    setActiveReservationId(null);
    cartState.clearCart();

    if (orderId) {
      void context.runtime.closeActiveOrder(scope, orderId, "CANCELLED");
    }
  }, [cartState.clearCart, context.runtime, currentActiveOrderId, scope]);

  const setServiceType = useCallback((serviceType: ActiveOrderContextState["service_type"]) => {
    if (serviceType === "TAKEAWAY") {
      setActiveReservationId(null);
      void resolveAndHydrateActiveOrder({ service_type: "TAKEAWAY" });
      return;
    }

    cartState.setServiceType(serviceType);
  }, [cartState.setServiceType, resolveAndHydrateActiveOrder]);

  const setActiveTableId = useCallback((tableId: number | null) => {
    if (!tableId) {
      cartState.setActiveTableId(null);
      return;
    }

    void resolveAndHydrateActiveOrder({
      service_type: "DINE_IN",
      table_id: tableId
    });
  }, [cartState.setActiveTableId, resolveAndHydrateActiveOrder]);

  const setDineInContext = useCallback((input: {
    tableId: number | null;
    reservationId?: number | null;
    guestCount?: number | null;
    notes?: string | null;
  }) => {
    const hasTable = typeof input.tableId === "number";
    const hasReservation = typeof input.reservationId === "number";

    if (!hasTable && !hasReservation) {
      cartState.setServiceType("DINE_IN");
      cartState.setActiveTableId(null);
      cartState.setOrderReservationId(null);
      setActiveReservationId(null);
      if (input.guestCount !== undefined) {
        cartState.setGuestCount(input.guestCount);
      }
      if (input.notes !== undefined) {
        cartState.setOrderNotes(input.notes);
      }
      return;
    }

    if (hasReservation) {
      setActiveReservationId(input.reservationId ?? null);
    }

    void resolveAndHydrateActiveOrder({
      service_type: "DINE_IN",
      table_id: input.tableId ?? undefined,
      reservation_id: input.reservationId ?? undefined,
      guest_count: input.guestCount,
      notes: input.notes
    });
  }, [
    cartState,
    resolveAndHydrateActiveOrder
  ]);

  const setOrderReservationId = useCallback((reservationId: number | null) => {
    if (!reservationId) {
      setActiveReservationId(null);
      cartState.setOrderReservationId(null);
      return;
    }

    setActiveReservationId(reservationId);
    void resolveAndHydrateActiveOrder({
      service_type: "DINE_IN",
      reservation_id: reservationId
    });
  }, [cartState.setOrderReservationId, resolveAndHydrateActiveOrder]);

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
      clearCart,
      activeOrderContext: cartState.activeOrderContext,
      setServiceType,
      setDineInContext,
      setActiveTableId,
      setOrderReservationId,
      setGuestCount: cartState.setGuestCount,
      setOrderFinalized: cartState.setOrderFinalized,
      setOrderStatus: cartState.setOrderStatus,
      setOrderNotes: cartState.setOrderNotes,
      currentActiveOrderId,
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
      clearCart,
      setServiceType,
      setDineInContext,
      setActiveTableId,
      setOrderReservationId,
      currentActiveOrderId,
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
            path={routes.serviceMode.path}
            element={
              <ProtectedRoute context={context} authToken={authToken}>
                <ServiceModePage context={context} />
              </ProtectedRoute>
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
