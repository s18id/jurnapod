// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { Suspense, createContext, useContext, useMemo, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation
} from "react-router-dom";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import type { RuntimeOutletScope, RuntimeOutletTable, RuntimeReservation } from "../services/runtime-service.js";
import { routes, type RouterContextValue, type ProtectedRouteProps } from "./routes.js";
import { readAccessToken, clearAccessToken } from "../offline/auth-session.js";
import { useCart, type ActiveOrderContextState, type CartState } from "../features/cart/useCart.js";
import { API_CONFIG, POLL_INTERVAL_MS } from "../shared/utils/constants.js";
import { PosAppStateContext, usePosAppState } from "./pos-app-state.js";

const PLACEHOLDER_OUTLETS = [{ outlet_id: 1, label: "Outlet 1 (placeholder)" }];
const AUTO_REFRESH_STORAGE_KEY = "jurnapod_pos_auto_refresh_enabled";
const AUTO_PULL_ENABLED_STORAGE_KEY = "jurnapod_pos_auto_pull_enabled";
const AUTO_PULL_INTERVAL_STORAGE_KEY = "jurnapod_pos_auto_pull_interval_ms";
const AUTO_PULL_INTERVAL_OPTIONS_MS = [30000, 60000, 300000] as const;

const LoginPage = React.lazy(async () => {
  const module = await import("../pages/LoginPage.js");
  return { default: module.LoginPage };
});
const CheckoutPage = React.lazy(async () => {
  const module = await import("../pages/CheckoutPage.js");
  return { default: module.CheckoutPage };
});
const ProductsPage = React.lazy(async () => {
  const module = await import("../pages/ProductsPage.js");
  return { default: module.ProductsPage };
});
const TablesPage = React.lazy(async () => {
  const module = await import("../pages/TablesPage.js");
  return { default: module.TablesPage };
});
const ReservationsPage = React.lazy(async () => {
  const module = await import("../pages/ReservationsPage.js");
  return { default: module.ReservationsPage };
});
const CartPage = React.lazy(async () => {
  const module = await import("../pages/CartPage.js");
  return { default: module.CartPage };
});
const SettingsPage = React.lazy(async () => {
  const module = await import("../pages/SettingsPage.js");
  return { default: module.SettingsPage };
});
const ServiceModePage = React.lazy(async () => {
  const module = await import("../pages/ServiceModePage.js");
  return { default: module.ServiceModePage };
});
const AppLayout = React.lazy(async () => {
  const module = await import("./AppLayout.js");
  return { default: module.AppLayout };
});

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
  const [activeEditBaseUpdatedAt, setActiveEditBaseUpdatedAt] = useState<string | null>(null);
  const [staleEditWarning, setStaleEditWarning] = useState<string | null>(null);
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
        kitchen_sent_qty: orderIsFinalized ? line.qty : 0,  // Renamed from committed_qty
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
    is_finalized: boolean;  // DB field name
    order_status: ActiveOrderContextState["order_status"];
    opened_at: string;
    closed_at: string | null;
    notes: string | null;
  }): ActiveOrderContextState => ({
    service_type: order.service_type,
    table_id: order.table_id,
    reservation_id: order.reservation_id,
    guest_count: order.guest_count,
    kitchen_sent: order.is_finalized,  // Map DB is_finalized → UI kitchen_sent
    order_status: order.order_status,
    opened_at: order.opened_at,
    closed_at: order.closed_at,
    notes: order.notes
  }), []);

  const hasMeaningfulOrderState = useMemo(() => {
    const hasDineInAnchor =
      cartState.activeOrderContext.service_type === "DINE_IN"
      && (
        !!cartState.activeOrderContext.table_id
        || !!cartState.activeOrderContext.reservation_id
      );

    return (
      cartState.cartLines.length > 0
      || cartState.paidAmount > 0
      || hasDineInAnchor
      || !!cartState.activeOrderContext.table_id
      || !!cartState.activeOrderContext.reservation_id
      || cartState.activeOrderContext.guest_count !== null
      || cartState.activeOrderContext.kitchen_sent  // Renamed from is_finalized
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
      is_finalized: boolean;  // DB field name
      order_status: ActiveOrderContextState["order_status"];
      opened_at: string;
      closed_at: string | null;
      notes: string | null;
      updated_at?: string;
    };
  }) => {
    hydrateInProgressRef.current = true;
    cartState.hydrateOrder({
      cart: toCartState(input.lines, input.order.is_finalized),  // DB field
      paidAmount: input.paid_amount,
      activeOrderContext: toOrderContext(input.order)  // Maps is_finalized → kitchen_sent inside
    });
    setCurrentActiveOrderId(input.order_id);
    setActiveEditBaseUpdatedAt(input.order.updated_at ?? input.order.opened_at ?? null);
    setStaleEditWarning(null);
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

    const hasDineInAnchor =
      cartState.activeOrderContext.service_type === "DINE_IN"
      && (
        !!cartState.activeOrderContext.table_id
        || !!cartState.activeOrderContext.reservation_id
      );

    if (cartState.activeOrderContext.service_type === "DINE_IN" && !hasDineInAnchor) {
      return null;
    }

    const snapshot = await context.runtime.upsertActiveOrderSnapshot(scope, {
      order_id: currentActiveOrderId ?? undefined,
      service_type: cartState.activeOrderContext.service_type,
      table_id: cartState.activeOrderContext.table_id,
      reservation_id: cartState.activeOrderContext.reservation_id,
      guest_count: cartState.activeOrderContext.guest_count,
      kitchen_sent: cartState.activeOrderContext.kitchen_sent,  // Renamed from is_finalized
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
        if (currentActiveOrderId && activeEditBaseUpdatedAt) {
          const latestSnapshot = await context.runtime.getActiveOrderSnapshot(scope, currentActiveOrderId);
          if (latestSnapshot && latestSnapshot.order.updated_at > activeEditBaseUpdatedAt) {
            setStaleEditWarning("Order changed on another terminal");
          }
        }
      } else {
        setPullSyncMessage(result.message ?? "Sync pull failed.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setPullSyncMessage(`Sync pull failed: ${message}`);
    } finally {
      setPullSyncInFlight(false);
    }
  }, [activeEditBaseUpdatedAt, context, currentActiveOrderId, pullSyncInFlight, scope]);

  const reloadLatestActiveOrder = useCallback(async () => {
    if (!currentActiveOrderId) {
      return;
    }

    const snapshot = await context.runtime.getActiveOrderSnapshot(scope, currentActiveOrderId);
    if (!snapshot) {
      return;
    }

    hydrateFromSnapshot({
      order_id: snapshot.order.order_id,
      paid_amount: snapshot.order.paid_amount,
      lines: snapshot.lines,
      order: snapshot.order
    });
  }, [context.runtime, currentActiveOrderId, hydrateFromSnapshot, scope]);

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

  /**
   * Creates order checkpoint by marking all current items as kitchen-sent.
   * Used when sending order to kitchen (dine-in flow).
   */
  const createOrderCheckpoint = useCallback(() => {
    cartState.setOrderFinalized(true);
  }, [cartState]);

  /**
   * Discards only unsent (draft) items, preserving kitchen-sent items.
   * Resets qty to kitchen_sent_qty for each line.
   */
  const discardDraftItems = useCallback(() => {
    const nextCart: CartState = {};
    for (const [key, line] of Object.entries(cartState.cart)) {
      if (line.kitchen_sent_qty > 0) {
        // Keep line, reset qty to kitchen_sent_qty
        nextCart[Number(key)] = {
          ...line,
          qty: line.kitchen_sent_qty
        };
      }
      // Lines with kitchen_sent_qty = 0 are discarded
    }

    // If no items remain, clear entire order
    if (Object.keys(nextCart).length === 0) {
      clearCart();
    } else {
      // Update cart with filtered items
      cartState.hydrateOrder({
        cart: nextCart,
        paidAmount: cartState.paidAmount,
        activeOrderContext: cartState.activeOrderContext
      });
    }
  }, [cartState, clearCart]);

  /**
   * Helper computed value for navigation guard decisions.
   */
  const hasUnsentDineInItems = useMemo(
    () =>
      cartState.activeOrderContext.service_type === "DINE_IN" &&
      !cartState.activeOrderContext.kitchen_sent &&
      cartState.cartLines.length > 0,
    [cartState.activeOrderContext, cartState.cartLines.length]
  );

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
      createOrderCheckpoint,
      discardDraftItems,
      hasUnsentDineInItems,
      currentActiveOrderId,
      outletTables,
      setOutletTables,
      outletReservations,
      setOutletReservations,
      activeReservationId,
      setActiveReservationId,
      staleEditWarning,
      reloadLatestActiveOrder
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
      createOrderCheckpoint,
      discardDraftItems,
      hasUnsentDineInItems,
      currentActiveOrderId,
      outletTables,
      outletReservations,
      activeReservationId,
      staleEditWarning,
      reloadLatestActiveOrder
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
        <Suspense fallback={<div style={{ padding: 16, fontSize: 14, color: "#475569" }}>Loading page...</div>}>
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
                <AppLayout context={context} cartItemCount={effectiveCartItemCount}>
                  <CheckoutPage context={context} />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={routes.tables.path}
            element={
              <ProtectedRoute context={context} authToken={authToken}>
                <AppLayout context={context} cartItemCount={effectiveCartItemCount}>
                  <TablesPage context={context} />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={routes.reservations.path}
            element={
              <ProtectedRoute context={context} authToken={authToken}>
                <AppLayout context={context} cartItemCount={effectiveCartItemCount}>
                  <ReservationsPage context={context} />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={routes.products.path}
            element={
              <ProtectedRoute context={context} authToken={authToken}>
                <AppLayout context={context} cartItemCount={effectiveCartItemCount}>
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
                <AppLayout context={context} cartItemCount={effectiveCartItemCount}>
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
                <AppLayout context={context} cartItemCount={effectiveCartItemCount}>
                  <SettingsPage context={context} onLogout={handleLogout} />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to={routes.products.path} replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </PosAppStateContext.Provider>
    </RouterContext.Provider>
  );
}
