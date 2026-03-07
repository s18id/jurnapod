// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { useBreakpoint } from "../hooks/useBreakpoint.js";

export interface ContainerProps {
  children: React.ReactNode;
  maxWidth?: "mobile" | "tablet" | "desktop" | "full";
  padding?: boolean;
  style?: React.CSSProperties;
}

/**
 * Responsive container component with adaptive max-width
 */
export function Container({
  children,
  maxWidth = "desktop",
  padding = true,
  style
}: ContainerProps): JSX.Element {
  const { isMobile, isTablet } = useBreakpoint();

  const maxWidthValues = {
    mobile: "100%",
    tablet: "768px",
    desktop: "1280px",
    full: "100%"
  };

  const baseStyles: React.CSSProperties = {
    width: "100%",
    maxWidth: maxWidthValues[maxWidth],
    margin: "0 auto",
    padding: padding
      ? isMobile
        ? "16px"
        : isTablet
          ? "24px"
          : "32px"
      : 0,
    boxSizing: "border-box",
    ...style
  };

  return <div style={baseStyles}>{children}</div>;
}

export interface FlexContainerProps {
  children: React.ReactNode;
  direction?: "row" | "column";
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between" | "around";
  wrap?: boolean;
  style?: React.CSSProperties;
}

/**
 * Flexible container for responsive layouts
 */
export function FlexContainer({
  children,
  direction = "row",
  gap = 16,
  align = "start",
  justify = "start",
  wrap = false,
  style
}: FlexContainerProps): JSX.Element {
  const alignMap = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    stretch: "stretch"
  };

  const justifyMap = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    between: "space-between",
    around: "space-around"
  };

  const baseStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: direction,
    gap: `${gap}px`,
    alignItems: alignMap[align],
    justifyContent: justifyMap[justify],
    flexWrap: wrap ? "wrap" : "nowrap",
    ...style
  };

  return <div style={baseStyles}>{children}</div>;
}

export interface GridContainerProps {
  children: React.ReactNode;
  columns?: { mobile: number; tablet?: number; desktop?: number };
  gap?: number;
  style?: React.CSSProperties;
}

/**
 * Responsive grid container
 */
export function GridContainer({
  children,
  columns = { mobile: 1, tablet: 2, desktop: 3 },
  gap = 16,
  style
}: GridContainerProps): JSX.Element {
  const { isMobile, isTablet } = useBreakpoint();

  const columnCount = isMobile
    ? columns.mobile
    : isTablet
      ? columns.tablet ?? columns.mobile
      : columns.desktop ?? columns.tablet ?? columns.mobile;

  const baseStyles: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
    gap: `${gap}px`,
    ...style
  };

  return <div style={baseStyles}>{children}</div>;
}
