// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { bootstrapWebApp, type WebBootstrapContext } from "./bootstrap/web.js";
import type {
  RuntimeProductCatalogItem,
  RuntimeOutletScope,
  RuntimeSyncBadgeState
} from "./services/runtime-service.js";
import { clearAccessToken, readAccessToken, writeAccessToken } from "./offline/auth-session.js";
import { completeSale, createSaleDraft } from "./offline/sales.js";
import { normalizeMoney, formatMoney, computeCartTotals } from "./shared/utils/money.js";
import { 
  POLL_INTERVAL_MS, 
  CASHIER_USER_ID, 
  API_CONFIG,
  buildGoogleAuthUrl,
  OAUTH_STATE_KEY,
  OAUTH_COMPANY_KEY
} from "./shared/utils/constants.js";
import { badgeColors } from "./shared/utils/ui-helpers.js";

const PLACEHOLDER_OUTLETS = [{ outlet_id: 1, label: "Outlet 1 (placeholder)" }];

const API_ORIGIN = API_CONFIG.baseUrl;
const GOOGLE_CLIENT_ID = API_CONFIG.googleClientId;

interface CartLine {
  product: RuntimeProductCatalogItem;
  qty: number;
  discount_amount: number;
}

type CartState = Record<number, CartLine>;

function cartToList(cart: CartState): CartLine[] {
  return Object.values(cart).filter((line) => line.qty > 0);
}

function SyncBadge({ status, pendingCount }: { status: RuntimeSyncBadgeState; pendingCount: number }) {
  const palette = badgeColors(status);

  return (
    <span
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        padding: "4px 10px",
        fontSize: 13,
        fontWeight: 700,
        border: `1px solid ${palette.border}`,
        color: palette.text,
        background: palette.background
      }}
    >
      <span>Sync: {status}</span>
      {status === "Pending" ? <span>({pendingCount})</span> : null}
    </span>
  );
}

function App({ context }: { context: WebBootstrapContext }) {
  const defaultCheckoutConfig = context.runtime.resolveCheckoutConfig(null);
  const [outletOptions, setOutletOptions] = React.useState<{ outlet_id: number; label: string }[]>(PLACEHOLDER_OUTLETS);
  const [scope, setScope] = React.useState<RuntimeOutletScope>({
    company_id: 1,
    outlet_id: PLACEHOLDER_OUTLETS[0].outlet_id
  });
  const [currentFlowId, setCurrentFlowId] = React.useState<string>(() => crypto.randomUUID());
  const [isOnline, setIsOnline] = React.useState<boolean>(() => context.runtime.isOnline());
  const [pendingOutboxCount, setPendingOutboxCount] = React.useState<number>(0);
  const [hasProductCache, setHasProductCache] = React.useState<boolean>(false);
  const [catalog, setCatalog] = React.useState<RuntimeProductCatalogItem[]>([]);
  const [searchTerm, setSearchTerm] = React.useState<string>("");
  const [cart, setCart] = React.useState<CartState>({});
  const [scopedPaymentMethods, setScopedPaymentMethods] = React.useState<string[]>(
    defaultCheckoutConfig.payment_methods
  );
  const [checkoutTaxConfig, setCheckoutTaxConfig] = React.useState<{
    rate: number;
    inclusive: boolean;
  }>(defaultCheckoutConfig.tax);
  const [paymentMethod, setPaymentMethod] = React.useState<string>(defaultCheckoutConfig.payment_methods[0]);
  const [paidAmount, setPaidAmount] = React.useState<number>(0);
  const [companyCode, setCompanyCode] = React.useState<string>("JP");
  const [email, setEmail] = React.useState<string>("");
  const [password, setPassword] = React.useState<string>("");
  const [authToken, setAuthToken] = React.useState<string | null>(() => readAccessToken());
  const [authStatus, setAuthStatus] = React.useState<"loading" | "anonymous" | "authenticated">(
    "loading"
  );
  const [loginInFlight, setLoginInFlight] = React.useState<boolean>(false);
  const [authMessage, setAuthMessage] = React.useState<string | null>(null);
  const [inFlightFlowIds, setInFlightFlowIds] = React.useState<Record<string, true>>({});
  const [pullSyncInFlight, setPullSyncInFlight] = React.useState<boolean>(false);
  const [pullSyncMessage, setPullSyncMessage] = React.useState<string | null>(null);
  const [pushSyncInFlight, setPushSyncInFlight] = React.useState<boolean>(false);
  const [pushSyncMessage, setPushSyncMessage] = React.useState<string | null>(null);
  const [lastDataVersion, setLastDataVersion] = React.useState<number>(0);
  const [lastCompleteMessage, setLastCompleteMessage] = React.useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = React.useState<number>(0);
  const inFlightFlowIdsRef = React.useRef<Set<string>>(new Set());
  const googleEnabled = GOOGLE_CLIENT_ID.length > 0;

  const applyAuthenticatedSession = React.useCallback(
    async (accessToken: string, options?: { message?: string }) => {
      const meResponse = await fetch(`${API_ORIGIN}/api/users/me`, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json"
        }
      });

      if (!meResponse.ok) {
        throw new Error("Login succeeded but failed to load user outlets");
      }

      const mePayload = (await meResponse.json()) as {
        success: true;
        data: {
          company_id: number;
          outlets: Array<{ id: number; code: string; name: string }>;
        };
      };

      if (!mePayload?.success || !Array.isArray(mePayload.data?.outlets) || mePayload.data.outlets.length === 0) {
        throw new Error("No outlet access found for this user");
      }

      const nextOutlets = mePayload.data.outlets.map((outlet) => ({
        outlet_id: Number(outlet.id),
        label: `${outlet.code} - ${outlet.name}`
      }));

      setOutletOptions(nextOutlets);
      setScope({
        company_id: Number(mePayload.data.company_id),
        outlet_id: nextOutlets[0].outlet_id
      });
      setAuthToken(accessToken);
      setAuthStatus("authenticated");
      if (options?.message) {
        setAuthMessage(options.message);
      }
      setRefreshNonce((previous) => previous + 1);
    },
    []
  );

  React.useEffect(() => {
    let disposed = false;

    async function handleGoogleCallback(): Promise<boolean> {
      const url = new URL(globalThis.location.href);
      if (url.pathname !== "/auth/callback") {
        return false;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const storedState = globalThis.sessionStorage.getItem(OAUTH_STATE_KEY);
      const storedCompany = globalThis.sessionStorage.getItem(OAUTH_COMPANY_KEY);
      globalThis.sessionStorage.removeItem(OAUTH_STATE_KEY);
      globalThis.sessionStorage.removeItem(OAUTH_COMPANY_KEY);

      setAuthMessage(null);
      setLoginInFlight(true);
      setAuthStatus("loading");

      if (!code || !state || !storedState || storedState !== state || !storedCompany) {
        setAuthMessage("Google sign-in failed. Please try again.");
        setAuthStatus("anonymous");
        setLoginInFlight(false);
        globalThis.history.replaceState({}, "", "/");
        return true;
      }

      try {
        const redirectUri = `${globalThis.location.origin}/auth/callback`;
        const response = await fetch(`${API_ORIGIN}/api/auth/google`, {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            companyCode: storedCompany,
            code,
            redirect_uri: redirectUri
          })
        });

        const payload = (await response.json()) as
          | { success: true; data: { access_token: string } }
          | { success: false; data?: { message?: string } };

        if (
          !response.ok ||
          !payload ||
          payload.success !== true ||
          typeof payload.data?.access_token !== "string"
        ) {
          const msg = payload && payload.success === false ? payload.data?.message ?? "Login failed" : "Login failed";
          throw new Error(msg);
        }

        writeAccessToken(payload.data.access_token);
        await applyAuthenticatedSession(payload.data.access_token, {
          message: "Authenticated. Sync pull and push are now authorized."
        });
        globalThis.history.replaceState({}, "", "/");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Login failed";
        setAuthMessage(`Auth failed: ${message}`);
        setAuthStatus("anonymous");
        globalThis.history.replaceState({}, "", "/");
      } finally {
        if (!disposed) {
          setLoginInFlight(false);
        }
      }

      return true;
    }

    async function bootstrapAuth() {
      const handledCallback = await handleGoogleCallback();
      if (handledCallback || disposed) {
        return;
      }

      const storedToken = readAccessToken();
      if (!storedToken) {
        setAuthStatus("anonymous");
        return;
      }

      try {
        await applyAuthenticatedSession(storedToken);
      } catch {
        clearAccessToken();
        setAuthToken(null);
        setAuthStatus("anonymous");
      }
    }

    bootstrapAuth().catch(() => {
      clearAccessToken();
      setAuthToken(null);
      setAuthStatus("anonymous");
    });

    return () => {
      disposed = true;
    };
  }, [applyAuthenticatedSession]);

  React.useEffect(() => {
    let disposed = false;
    let refreshQueue = Promise.resolve();

    context.orchestrator.updateConfig({
      apiOrigin: API_ORIGIN,
      accessToken: authToken ?? undefined
    });
    context.orchestrator.initialize();

    const runRefresh = async () => {
      const [snapshot, products, globalDueOutboxCount, scopedConfig, dataVersion] = await Promise.all([
        context.runtime.getOfflineSnapshot(scope),
        context.runtime.getProductCatalog(scope),
        context.runtime.getGlobalDueOutboxCount(),
        context.sync.getSyncConfig(scope),
        context.sync.getSyncDataVersion(scope)
      ]);
      const checkoutConfig = context.runtime.resolveCheckoutConfig(scopedConfig);
      const online = context.runtime.isOnline();

      if (online && globalDueOutboxCount > 0) {
        await context.orchestrator.requestPush("AUTO_REFRESH");
      }

      if (disposed) {
        return;
      }

      setIsOnline(online);
      setPendingOutboxCount(snapshot.pending_outbox_count);
      setHasProductCache(snapshot.has_product_cache);
      setCatalog(products);
      setScopedPaymentMethods(checkoutConfig.payment_methods);
      setCheckoutTaxConfig(checkoutConfig.tax);
      setPaymentMethod((current) => context.runtime.resolvePaymentMethod(current, checkoutConfig.payment_methods));
      setLastDataVersion(dataVersion);
      setPushSyncInFlight(context.orchestrator.isPushInFlight());
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

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleRefresh();
      }
    };

    scheduleRefresh();

    const intervalId = window.setInterval(scheduleRefresh, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      context.orchestrator.dispose();
      unsubscribeNetwork();
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [authToken, context, scope, refreshNonce]);

  const syncBadgeState = context.runtime.resolveSyncBadgeState(isOnline, pendingOutboxCount);
  const offlineCacheMissing = !isOnline && !hasProductCache;
  const completeInFlight = Boolean(inFlightFlowIds[currentFlowId]);
  const cartLines = React.useMemo(() => cartToList(cart), [cart]);
  const cartTotals = React.useMemo(() => computeCartTotals(cartLines, paidAmount), [cartLines, paidAmount]);
  const paymentMethodAllowed = context.runtime.isPaymentMethodAllowed(paymentMethod, scopedPaymentMethods);
  const canAttemptSaleCompletion = !offlineCacheMissing && cartLines.length > 0 && cartTotals.paid_total >= cartTotals.grand_total;
  const canCompleteSale = canAttemptSaleCompletion && paymentMethodAllowed;
  const visibleProducts = React.useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return catalog;
    }

    return catalog.filter((product) => {
      const haystack = `${product.name} ${product.sku ?? ""}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [catalog, searchTerm]);

  const lockSaleCompletion = React.useCallback((flowId: string): boolean => {
    if (inFlightFlowIdsRef.current.has(flowId)) {
      return false;
    }

    inFlightFlowIdsRef.current.add(flowId);
    setInFlightFlowIds((previous) => ({
      ...previous,
      [flowId]: true
    }));
    return true;
  }, []);

  const unlockSaleCompletion = React.useCallback((flowId: string): void => {
    inFlightFlowIdsRef.current.delete(flowId);
    setInFlightFlowIds((previous) => {
      if (!previous[flowId]) {
        return previous;
      }

      const next = { ...previous };
      delete next[flowId];
      return next;
    });
  }, []);

  const upsertCartLine = React.useCallback((product: RuntimeProductCatalogItem, patch: Partial<Pick<CartLine, "qty" | "discount_amount">>) => {
    setCart((previous) => {
      const existing = previous[product.item_id] ?? {
        product,
        qty: 1,
        discount_amount: 0
      };

      const nextQty = Math.max(0, patch.qty ?? existing.qty);
      const rawDiscount = patch.discount_amount ?? existing.discount_amount;
      const maxDiscount = normalizeMoney(nextQty * product.price_snapshot);
      const nextDiscount = Math.max(0, Math.min(normalizeMoney(rawDiscount), maxDiscount));

      if (nextQty === 0) {
        const next = { ...previous };
        delete next[product.item_id];
        return next;
      }

      return {
        ...previous,
        [product.item_id]: {
          product,
          qty: nextQty,
          discount_amount: nextDiscount
        }
      };
    });
  }, []);

  const runCompleteSale = React.useCallback(async () => {
    if (!canAttemptSaleCompletion) {
      return;
    }

    if (!context.runtime.isPaymentMethodAllowed(paymentMethod, scopedPaymentMethods)) {
      const nextPaymentMethod = context.runtime.resolvePaymentMethod(paymentMethod, scopedPaymentMethods);
      setPaymentMethod(nextPaymentMethod);
      setLastCompleteMessage(
        `Payment method ${paymentMethod} is no longer allowed for this outlet. Switched to ${nextPaymentMethod}.`
      );
      return;
    }

    const flowId = currentFlowId;
    if (!lockSaleCompletion(flowId)) {
      return;
    }

    setLastCompleteMessage(null);
    try {
      const draft = await createSaleDraft({
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        cashier_user_id: CASHIER_USER_ID
      });

      const result = await completeSale({
        sale_id: draft.sale_id,
        items: cartLines.map((line) => ({
          item_id: line.product.item_id,
          qty: line.qty,
          discount_amount: line.discount_amount
        })),
        payments: [
          {
            method: paymentMethod,
            amount: cartTotals.paid_total
          }
        ],
        totals: cartTotals
      });

      setLastCompleteMessage(`Sale completed offline (${result.client_tx_id}). Outbox job queued.`);
      setCart({});
      setPaidAmount(0);
      setCurrentFlowId(crypto.randomUUID());
      setRefreshNonce((previous) => previous + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setLastCompleteMessage(`Failed to complete sale: ${message}`);
    } finally {
      unlockSaleCompletion(flowId);
    }
  }, [
    canAttemptSaleCompletion,
    cartLines,
    cartTotals,
    currentFlowId,
    lockSaleCompletion,
    paymentMethod,
    scopedPaymentMethods,
    scope.company_id,
    scope.outlet_id,
    unlockSaleCompletion
  ]);

  const runSyncPullNow = React.useCallback(async () => {
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
      } else {
        setPullSyncMessage(result.message);
      }
      setRefreshNonce((previous) => previous + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setPullSyncMessage(`Sync pull failed: ${message}`);
    } finally {
      setPullSyncInFlight(false);
    }
  }, [context, pullSyncInFlight, scope]);

  const runSyncPushNow = React.useCallback(async () => {
    if (pushSyncInFlight) {
      return;
    }
    setPushSyncMessage("Sync push requested...");
    try {
      await context.orchestrator.requestPush("MANUAL_PUSH");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setPushSyncMessage(`Sync push failed: ${message}`);
    } finally {
      setRefreshNonce((previous) => previous + 1);
    }
  }, [context, pushSyncInFlight]);

  const runLogin = React.useCallback(async () => {
    if (loginInFlight) {
      return;
    }

    setLoginInFlight(true);
    setAuthMessage(null);
    try {
      const response = await fetch(`${API_ORIGIN}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode,
          email,
          password
        })
      });

      const payload = (await response.json()) as
        | { success: true; data: { access_token: string } }
        | { success: false; data?: { message?: string } };

      if (
        !response.ok ||
        !payload ||
        payload.success !== true ||
        typeof payload.data?.access_token !== "string"
      ) {
        const msg = payload && payload.success === false ? payload.data?.message ?? "Login failed" : "Login failed";
        throw new Error(msg);
      }

      writeAccessToken(payload.data.access_token);
      await applyAuthenticatedSession(payload.data.access_token, {
        message: "Authenticated. Sync pull and push are now authorized."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      setAuthMessage(`Auth failed: ${message}`);
      setAuthStatus("anonymous");
    } finally {
      setLoginInFlight(false);
    }
  }, [applyAuthenticatedSession, companyCode, email, loginInFlight, password]);

  const runGoogleLogin = React.useCallback(() => {
    if (loginInFlight) {
      return;
    }

    if (!googleEnabled) {
      setAuthMessage("Google sign-in is not configured.");
      return;
    }

    const trimmedCompany = companyCode.trim();
    if (!trimmedCompany) {
      setAuthMessage("Company code is required.");
      return;
    }

    setAuthMessage(null);
    const state = crypto.randomUUID();
    globalThis.sessionStorage.setItem(OAUTH_STATE_KEY, state);
    globalThis.sessionStorage.setItem(OAUTH_COMPANY_KEY, trimmedCompany);
    const redirectUri = `${globalThis.location.origin}/auth/callback`;
    const authUrl = buildGoogleAuthUrl({
      clientId: GOOGLE_CLIENT_ID,
      redirectUri,
      state
    });
    globalThis.location.assign(authUrl);
  }, [companyCode, googleEnabled, loginInFlight]);

  const runLogout = React.useCallback(() => {
    void fetch(`${API_ORIGIN}/api/auth/logout`, {
      method: "POST",
      credentials: "include"
    }).catch(() => null);
    clearAccessToken();
    setAuthToken(null);
    setOutletOptions(PLACEHOLDER_OUTLETS);
    setScope({ company_id: 1, outlet_id: PLACEHOLDER_OUTLETS[0].outlet_id });
    setAuthMessage("Session cleared.");
    setAuthStatus("anonymous");
  }, []);

  if (authStatus !== "authenticated") {
    return (
      <main
        style={{
          minHeight: "100vh",
          margin: 0,
          padding: 24,
          background: "linear-gradient(135deg, #ecfeff 0%, #fef3c7 100%)",
          color: "#0f172a",
          fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
          display: "grid",
          placeItems: "center"
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: 420,
            padding: 20,
            borderRadius: 14,
            background: "rgba(255, 255, 255, 0.92)",
            border: "1px solid #e2e8f0",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)"
          }}
        >
          <header style={{ marginBottom: 12 }}>
            <h1 style={{ margin: 0, fontSize: 24 }}>Jurnapod POS</h1>
            <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>
              Sign in to access checkout, sync, and offline cache.
            </p>
          </header>

          <div style={{ display: "grid", gap: 10 }}>
            <input
              value={companyCode}
              onChange={(event) => setCompanyCode(event.target.value)}
              placeholder="Company code"
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
            />
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
            />
            <button
              type="button"
              onClick={() => {
                void runLogin();
              }}
              disabled={loginInFlight}
              style={{
                border: "none",
                background: "#0f766e",
                color: "#fff",
                borderRadius: 8,
                padding: "10px 12px",
                fontWeight: 700,
                cursor: loginInFlight ? "not-allowed" : "pointer"
              }}
            >
              {loginInFlight ? "Signing in..." : "Sign in"}
            </button>
            {googleEnabled ? (
              <button
                type="button"
                onClick={runGoogleLogin}
                disabled={loginInFlight || companyCode.trim().length === 0}
                style={{
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  color: "#0f172a",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontWeight: 700,
                  cursor: loginInFlight || companyCode.trim().length === 0 ? "not-allowed" : "pointer"
                }}
              >
                Sign in with Google
              </button>
            ) : null}
            {authStatus === "loading" ? (
              <div style={{ fontSize: 12, color: "#64748b" }}>Checking session...</div>
            ) : null}
            {authMessage ? <div style={{ fontSize: 12, color: "#334155" }}>{authMessage}</div> : null}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        margin: 0,
        padding: 24,
        background: "linear-gradient(135deg, #ecfeff 0%, #fef3c7 100%)",
        color: "#0f172a",
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif'
      }}
    >
      <section
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: 20,
          borderRadius: 14,
          background: "rgba(255, 255, 255, 0.9)",
          border: "1px solid #e2e8f0",
          boxShadow: "0 6px 24px rgba(15, 23, 42, 0.08)"
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Jurnapod POS</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SyncBadge status={syncBadgeState} pendingCount={pendingOutboxCount} />
            <button
              type="button"
              onClick={runLogout}
              style={{
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                color: "#0f172a",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Logout
            </button>
          </div>
        </header>

        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => {
              void runSyncPushNow();
            }}
            disabled={pushSyncInFlight}
            style={{
              border: "none",
              background: pushSyncInFlight ? "#94a3b8" : "#0f766e",
              color: "#ffffff",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 700,
              cursor: pushSyncInFlight ? "not-allowed" : "pointer"
            }}
          >
            {pushSyncInFlight ? "Pushing..." : "Sync push now"}
          </button>
          <button
            type="button"
            onClick={() => {
              void runSyncPullNow();
            }}
            disabled={pullSyncInFlight}
            style={{
              border: "none",
              background: pullSyncInFlight ? "#94a3b8" : "#0369a1",
              color: "#ffffff",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 700,
              cursor: pullSyncInFlight ? "not-allowed" : "pointer"
            }}
          >
            {pullSyncInFlight ? "Syncing..." : "Sync pull now"}
          </button>
          <span style={{ fontSize: 13, color: "#475569" }}>Last data version: {lastDataVersion}</span>
        </div>

        {pullSyncMessage ? <p style={{ marginTop: 10, fontSize: 13, color: "#1f2937" }}>{pullSyncMessage}</p> : null}
        {pushSyncMessage ? <p style={{ marginTop: 8, fontSize: 13, color: "#1f2937" }}>{pushSyncMessage}</p> : null}

        <p style={{ marginTop: 12, marginBottom: 16, color: "#334155" }}>
          PR-09 checkout uses IndexedDB local-first flow and blocks completion when required outlet cache is missing.
        </p>

        <div style={{ marginBottom: 12, fontSize: 14, color: "#475569" }}>Company context (placeholder): {scope.company_id}</div>

        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }} htmlFor="outlet-select">
          Outlet context (placeholder)
        </label>
        <select
          id="outlet-select"
          value={scope.outlet_id}
          onChange={(event) => {
            setScope((previous) => ({
              ...previous,
              outlet_id: Number(event.target.value)
            }));
            setCurrentFlowId(crypto.randomUUID());
            setLastCompleteMessage(null);
            setCart({});
            setPaidAmount(0);
          }}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            fontSize: 14
          }}
        >
          {outletOptions.map((option) => (
            <option key={option.outlet_id} value={option.outlet_id}>
              {option.label}
            </option>
          ))}
        </select>

        <div style={{ marginTop: 14, fontSize: 14, color: "#334155" }}>
          Product cache status for outlet {scope.outlet_id}: {hasProductCache ? "Ready" : "Missing"}
        </div>

        <div style={{ marginTop: 16 }}>
          <label htmlFor="product-search" style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
            Product search
          </label>
          <input
            id="product-search"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
            }}
            placeholder="Search by name or SKU"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              fontSize: 14
            }}
          />
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 8, maxHeight: 160, overflow: "auto" }}>
          {visibleProducts.length === 0 ? (
            <div style={{ fontSize: 13, color: "#64748b" }}>No products in local cache for this outlet.</div>
          ) : (
            visibleProducts.map((product) => {
              const cartLine = cart[product.item_id];
              return (
                <div
                  key={product.item_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: "8px 10px",
                    background: "#ffffff"
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{product.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {(product.sku ?? "NO-SKU")} - {formatMoney(product.price_snapshot)}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        upsertCartLine(product, { qty: (cartLine?.qty ?? 0) + 1 });
                        setPaidAmount((previous) => (previous > 0 ? previous : product.price_snapshot));
                      }}
                      style={{
                        border: "none",
                        background: "#0f766e",
                        color: "#ffffff",
                        borderRadius: 6,
                        padding: "6px 10px",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Cart</div>
          {cartLines.length === 0 ? (
            <div style={{ fontSize: 13, color: "#64748b" }}>Cart is empty.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {cartLines.map((line) => (
                <div key={line.product.item_id} style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{line.product.name}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="number"
                      min={0}
                      value={line.qty}
                      onChange={(event) => {
                        upsertCartLine(line.product, { qty: Number(event.target.value) || 0 });
                      }}
                      style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                    />
                    <input
                      type="number"
                      min={0}
                      value={line.discount_amount}
                      onChange={(event) => {
                        upsertCartLine(line.product, { discount_amount: Number(event.target.value) || 0 });
                      }}
                      style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Payment</div>
          <div style={{ marginBottom: 8, fontSize: 12, color: "#475569" }}>
            Allowed methods: {scopedPaymentMethods.join(", ")} (tax: {checkoutTaxConfig.rate}% /{" "}
            {checkoutTaxConfig.inclusive ? "inclusive" : "exclusive"})
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={paymentMethod}
              onChange={(event) => {
                setPaymentMethod(context.runtime.resolvePaymentMethod(event.target.value, scopedPaymentMethods));
              }}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
            >
              {scopedPaymentMethods.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={paidAmount}
              onChange={(event) => {
                setPaidAmount(normalizeMoney(Number(event.target.value) || 0));
              }}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
            />
          </div>

          <div style={{ marginTop: 10, fontSize: 13, color: "#334155", display: "grid", gap: 4 }}>
            <div>Subtotal: {formatMoney(cartTotals.subtotal)}</div>
            <div>Discount: {formatMoney(cartTotals.discount_total)}</div>
            <div>Grand Total: {formatMoney(cartTotals.grand_total)}</div>
            <div>Paid: {formatMoney(cartTotals.paid_total)}</div>
            <div>Change: {formatMoney(cartTotals.change_total)}</div>
          </div>

          {!paymentMethodAllowed ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>
              Selected payment method is not allowed for this outlet. It will be corrected on next refresh.
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>Current flow id: {currentFlowId}</div>

        {offlineCacheMissing ? (
          <p
            role="alert"
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 10,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontWeight: 600
            }}
          >
            Checkout is blocked: offline product cache for the selected outlet is missing. Connect and run sync pull first.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => {
            void runCompleteSale();
          }}
          disabled={!canCompleteSale || completeInFlight}
          style={{
            marginTop: 18,
            width: "100%",
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            background: !canCompleteSale || completeInFlight ? "#94a3b8" : "#0f766e",
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 700,
            cursor: !canCompleteSale || completeInFlight ? "not-allowed" : "pointer"
          }}
        >
          {completeInFlight ? "Completing sale..." : "Complete sale offline"}
        </button>

        {lastCompleteMessage ? (
          <p style={{ marginTop: 12, color: "#166534", fontSize: 13, fontWeight: 600 }}>{lastCompleteMessage}</p>
        ) : null}
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

bootstrapWebApp({
  rootElement: root,
  AppComponent: App,
  config: {
    apiOrigin: API_ORIGIN,
    accessToken: readAccessToken() ?? undefined,
    onPushError: (error) => {
      console.error("Sync push failed", error);
    }
  }
});
