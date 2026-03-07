// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { useBreakpoint } from "../hooks/useBreakpoint.js";
import { getSafeAreaInsets } from "../utils/responsive.js";

export interface ResponsiveLayoutProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  sidebar?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Main responsive layout for the POS app.
 * Adapts to mobile (stacked), tablet (side-by-side), and desktop layouts.
 */
export function ResponsiveLayout({
  children,
  header,
  footer,
  sidebar,
  style
}: ResponsiveLayoutProps): JSX.Element {
  const { isMobile, isTablet } = useBreakpoint();
  const safeArea = getSafeAreaInsets();

  const containerStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    minHeight: "100vh",
    backgroundColor: "#f9fafb",
    paddingTop: safeArea.top,
    paddingBottom: safeArea.bottom,
    paddingLeft: safeArea.left,
    paddingRight: safeArea.right,
    ...style
  };

  const mainStyles: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "auto",
    width: "100%"
  };

  const sidebarStyles: React.CSSProperties = {
    width: isMobile ? "100%" : isTablet ? "300px" : "360px",
    borderRight: isMobile ? "none" : "1px solid #e5e7eb",
    backgroundColor: "#ffffff",
    overflow: "auto"
  };

  const headerStyles: React.CSSProperties = {
    position: isMobile ? "sticky" : "relative",
    top: isMobile ? 0 : "auto",
    zIndex: 10,
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e5e7eb",
    padding: "12px 16px"
  };

  const footerStyles: React.CSSProperties = {
    position: isMobile ? "sticky" : "relative",
    bottom: isMobile ? 0 : "auto",
    zIndex: 10,
    backgroundColor: "#ffffff",
    borderTop: "1px solid #e5e7eb",
    padding: "12px 16px"
  };

  return (
    <div style={containerStyles}>
      {sidebar && <aside style={sidebarStyles}>{sidebar}</aside>}
      <main style={mainStyles}>
        {header && <header style={headerStyles}>{header}</header>}
        <div style={{ flex: 1, overflow: "auto" }}>{children}</div>
        {footer && <footer style={footerStyles}>{footer}</footer>}
      </main>
    </div>
  );
}

export interface StickyFooterProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Sticky footer component for mobile checkouts
 */
export function StickyFooter({
  children,
  style
}: StickyFooterProps): JSX.Element {
  const { isMobile } = useBreakpoint();
  const safeArea = getSafeAreaInsets();

  const footerStyles: React.CSSProperties = {
    position: isMobile ? "sticky" : "relative",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderTop: "2px solid #e5e7eb",
    padding: "16px",
    paddingBottom: isMobile ? `${16 + safeArea.bottom}px` : "16px",
    boxShadow: isMobile ? "0 -4px 6px -1px rgba(0, 0, 0, 0.1)" : "none",
    zIndex: 100,
    ...style
  };

  return <div style={footerStyles}>{children}</div>;
}

export interface ScrollableContentProps {
  children: React.ReactNode;
  maxHeight?: string;
  style?: React.CSSProperties;
}

/**
 * Scrollable content area with momentum scrolling
 */
export function ScrollableContent({
  children,
  maxHeight = "100%",
  style
}: ScrollableContentProps): JSX.Element {
  const contentStyles: React.CSSProperties = {
    overflowY: "auto",
    overflowX: "hidden",
    maxHeight,
    WebkitOverflowScrolling: "touch", // iOS momentum scrolling
    ...style
  };

  return <div style={contentStyles}>{children}</div>;
}

export interface SplitViewProps {
  left: React.ReactNode;
  right: React.ReactNode;
  leftWidth?: string;
  style?: React.CSSProperties;
}

/**
 * Split view layout (products on left, cart on right)
 * Stacks vertically on mobile
 */
export function SplitView({
  left,
  right,
  leftWidth = "60%",
  style
}: SplitViewProps): JSX.Element {
  const { isMobile } = useBreakpoint();

  const containerStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    height: "100%",
    gap: isMobile ? 0 : "16px",
    ...style
  };

  const leftStyles: React.CSSProperties = {
    flex: isMobile ? "1" : "none",
    width: isMobile ? "100%" : leftWidth,
    overflow: "auto"
  };

  const rightStyles: React.CSSProperties = {
    flex: isMobile ? "0 0 auto" : "1",
    width: isMobile ? "100%" : "auto",
    overflow: "auto"
  };

  return (
    <div style={containerStyles}>
      <div style={leftStyles}>{left}</div>
      <div style={rightStyles}>{right}</div>
    </div>
  );
}
