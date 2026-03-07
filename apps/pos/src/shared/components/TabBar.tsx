// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { MOBILE_BREAKPOINT, MIN_TOUCH_TARGET } from "../utils/constants.js";

export interface Tab {
  id: string;
  label: string;
  icon: string;
  badge?: number;
}

export interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function TabBar({
  tabs,
  activeTab,
  onTabChange
}: TabBarProps): JSX.Element {
  const isMobile = typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;

  if (!isMobile) {
    return <></>;
  }

  const containerStyles: React.CSSProperties = {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderTop: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-around",
    paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
    zIndex: 9998,
    boxShadow: "0 -2px 10px rgba(0, 0, 0, 0.05)"
  };

  const tabButtonStyles = (isActive: boolean): React.CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    background: "none",
    border: "none",
    padding: "8px 16px",
    cursor: "pointer",
    color: isActive ? "#3b82f6" : "#6b7280",
    fontSize: "12px",
    fontWeight: isActive ? 600 : 500,
    minWidth: `${MIN_TOUCH_TARGET}px`,
    minHeight: `${MIN_TOUCH_TARGET}px`,
    position: "relative"
  });

  const iconStyles: React.CSSProperties = {
    fontSize: "20px",
    lineHeight: 1
  };

  const badgeStyles: React.CSSProperties = {
    position: "absolute",
    top: "2px",
    right: "calc(50% - 16px)",
    backgroundColor: "#ef4444",
    color: "#ffffff",
    fontSize: "10px",
    fontWeight: 600,
    minWidth: "16px",
    height: "16px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px"
  };

  return (
    <nav style={containerStyles} role="navigation" aria-label="Main navigation">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            style={tabButtonStyles(isActive)}
            aria-current={isActive ? "page" : undefined}
          >
            <span style={iconStyles}>{tab.icon}</span>
            <span>{tab.label}</span>
            {typeof tab.badge === "number" && tab.badge > 0 && (
              <span style={badgeStyles}>{tab.badge > 99 ? "99+" : tab.badge}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
