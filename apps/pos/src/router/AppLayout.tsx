// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IonBadge, IonContent, IonLabel, IonPage, IonTabBar, IonTabButton } from "@ionic/react";
import { useLocation, useNavigate } from "react-router-dom";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { SyncBadge } from "../features/sync/SyncBadge.js";
import { OutletContextSwitcher } from "../features/outlet/OutletContextSwitcher.js";
import { Button, Modal } from "../shared/components/index.js";
import { MOBILE_BREAKPOINT } from "../shared/utils/constants.js";
import { routes, mobileTabs } from "./routes.js";
import { usePosAppState } from "./pos-app-state.js";

interface AppLayoutProps {
  children: ReactNode;
  cartItemCount: number;
  context: WebBootstrapContext;
}

export function AppLayout({ children, cartItemCount, context }: AppLayoutProps): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [navigationGuard, setNavigationGuard] = useState<{ isOpen: boolean; targetPath: string }>({
    isOpen: false,
    targetPath: ""
  });
  const [guardActionInFlight, setGuardActionInFlight] = useState(false);
  // Ref lock for same-tick dedupe (stronger than state for rapid clicks)
  const guardActionLockRef = useRef(false);
  const {
    scope,
    setScope,
    outletOptions,
    syncBadgeState,
    pendingOutboxCount,
    clearCart,
    setPayments,
    activeOrderContext,
    outletReservations,
    activeReservationId,
    setActiveReservationId,
    setOutletTables,
    setOutletReservations,
    staleEditWarning,
    reloadLatestActiveOrder,
    hasUnsentDineInItems,
    createOrderCheckpoint,
    discardDraftItems
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

  const tabs = useMemo(
    () =>
      mobileTabs.map((tab) => ({
        ...tab,
        badge: tab.id === "cart" ? cartItemCount : undefined
      })),
    [cartItemCount]
  );

  const handleTabChange = (tabId: string) => {
    const route = mobileTabs.find((t) => t.id === tabId);
    if (route) {
      handleNavigationAttempt(route.path);
    }
  };

  const currentTabId = useMemo(() => {
    const current = mobileTabs.find((t) => t.path === location.pathname);
    return current?.id ?? "";
  }, [location.pathname]);

  const headerNavItems = useMemo(
    () => [routes.products, routes.tables, routes.reservations, routes.cart, routes.checkout, routes.settings],
    []
  );

  // Navigation guard interceptor
  const handleNavigationAttempt = (targetPath: string) => {
    if (hasUnsentDineInItems && location.pathname === routes.products.path) {
      setNavigationGuard({ isOpen: true, targetPath });
    } else {
      navigate(targetPath);
    }
  };

  // Modal action handlers
  const handleSendToKitchenAndNavigate = () => {
    if (guardActionLockRef.current || guardActionInFlight) return;
    guardActionLockRef.current = true;
    setGuardActionInFlight(true);
    createOrderCheckpoint();
    navigate(navigationGuard.targetPath);
    setNavigationGuard({ isOpen: false, targetPath: "" });
    setGuardActionInFlight(false);
    guardActionLockRef.current = false;
  };

  const handleDiscardAndNavigate = () => {
    if (guardActionLockRef.current || guardActionInFlight) return;
    guardActionLockRef.current = true;
    setGuardActionInFlight(true);
    void (async () => {
      try {
        discardDraftItems();
        navigate(navigationGuard.targetPath);
        setNavigationGuard({ isOpen: false, targetPath: "" });
      } finally {
        setGuardActionInFlight(false);
        guardActionLockRef.current = false;
      }
    })();
  };

  const handleCancelNavigation = () => {
    if (guardActionLockRef.current || guardActionInFlight) return;
    guardActionLockRef.current = true;
    setGuardActionInFlight(true);
    try {
      setNavigationGuard({ isOpen: false, targetPath: "" });
    } finally {
      setGuardActionInFlight(false);
      guardActionLockRef.current = false;
    }
  };

  return (
    <IonPage style={{ minHeight: "100vh", paddingBottom: "60px", display: "flex", flexDirection: "column" }}>
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
                  onClick={() => handleNavigationAttempt(routes.checkout.path)}
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
                onClick={() => handleNavigationAttempt(routes.settings.path)}
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
                  setScope({
                    ...scope,
                    outlet_id: nextOutletId
                  });
                  clearCart();
                  setPayments([]);
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
                    id={`header-nav-${item.id}`}
                    name={`headerNav-${item.id}`}
                    type="button"
                    onClick={() => handleNavigationAttempt(item.path)}
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
          {staleEditWarning ? (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                background: "#fff7ed",
                border: "1px solid #fdba74",
                borderRadius: 8,
                padding: "8px 10px"
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: "#9a3412" }}>{staleEditWarning}</span>
              <button
                type="button"
                onClick={() => {
                  void reloadLatestActiveOrder();
                }}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#7c2d12",
                  background: "#ffedd5",
                  border: "1px solid #fdba74",
                  borderRadius: 999,
                  padding: "4px 10px",
                  cursor: "pointer"
                }}
              >
                Reload latest
              </button>
            </div>
          ) : null}
        </header>
        <IonContent
          style={{
            ["--background" as string]: "#f8fafc"
          }}
        >
          {children}
        </IonContent>
      </div>
      {isMobileNav ? (
        <IonTabBar slot="bottom" selectedTab={currentTabId}>
          {tabs.map((tab) => (
            <IonTabButton key={tab.id} tab={tab.id} onClick={() => handleTabChange(tab.id)}>
              <span style={{ fontSize: "20px", lineHeight: 1 }}>{tab.icon}</span>
              <IonLabel>{tab.label}</IonLabel>
              {typeof tab.badge === "number" && tab.badge > 0 ? (
                <IonBadge color="danger">{tab.badge > 99 ? "99+" : tab.badge}</IonBadge>
              ) : null}
            </IonTabButton>
          ))}
        </IonTabBar>
      ) : null}

      {/* Navigation Guard Modal */}
      <Modal
        isOpen={navigationGuard.isOpen}
        onClose={handleCancelNavigation}
        title="Unsent items in order"
        titleId="guard-modal-title"
      >
        <div style={{ paddingTop: 8 }}>
          <p id="guard-modal-description" style={{ fontSize: 14, color: "#64748b", marginBottom: 20 }}>
            You have unsent items in this order. What would you like to do?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Button
              id="guard-stay-on-page"
              name="guardStayOnPage"
              variant="secondary"
              fullWidth
              disabled={guardActionInFlight}
              onClick={handleCancelNavigation}
            >
              Stay on this page
            </Button>
            <Button
              id="guard-send-to-kitchen"
              name="guardSendToKitchen"
              variant="primary"
              fullWidth
              disabled={guardActionInFlight}
              onClick={handleSendToKitchenAndNavigate}
            >
              {guardActionInFlight ? "Processing..." : "Send to kitchen and continue"}
            </Button>
            <Button
              id="guard-discard-unsent"
              name="guardDiscardUnsent"
              variant="danger"
              fullWidth
              disabled={guardActionInFlight}
              onClick={handleDiscardAndNavigate}
            >
              {guardActionInFlight ? "Processing..." : "Discard unsent items"}
            </Button>
          </div>
        </div>
      </Modal>
    </IonPage>
  );
}
