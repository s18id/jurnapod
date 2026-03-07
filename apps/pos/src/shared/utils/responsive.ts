// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Responsive layout utilities for mobile-first design.
 * Provides breakpoints, device detection, and layout helpers.
 */

export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280,
} as const;

export type DeviceType = "mobile" | "tablet" | "desktop";

export interface ResponsiveConfig {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  deviceType: DeviceType;
  width: number;
}

/**
 * Get current device type based on window width
 */
export function getDeviceType(width: number): DeviceType {
  if (width < BREAKPOINTS.mobile) {
    return "mobile";
  }
  if (width < BREAKPOINTS.tablet) {
    return "tablet";
  }
  return "desktop";
}

/**
 * Check if current viewport is mobile
 */
export function isMobileViewport(): boolean {
  return window.innerWidth < BREAKPOINTS.mobile;
}

/**
 * Check if current viewport is tablet
 */
export function isTabletViewport(): boolean {
  return (
    window.innerWidth >= BREAKPOINTS.mobile &&
    window.innerWidth < BREAKPOINTS.tablet
  );
}

/**
 * Check if current viewport is desktop
 */
export function isDesktopViewport(): boolean {
  return window.innerWidth >= BREAKPOINTS.tablet;
}

/**
 * Get responsive configuration for current viewport
 */
export function getResponsiveConfig(): ResponsiveConfig {
  const width = window.innerWidth;
  const deviceType = getDeviceType(width);

  return {
    isMobile: deviceType === "mobile",
    isTablet: deviceType === "tablet",
    isDesktop: deviceType === "desktop",
    deviceType,
    width,
  };
}

/**
 * Media query helpers
 */
export const mediaQueries = {
  mobile: `(max-width: ${BREAKPOINTS.mobile - 1}px)`,
  tablet: `(min-width: ${BREAKPOINTS.mobile}px) and (max-width: ${BREAKPOINTS.tablet - 1}px)`,
  desktop: `(min-width: ${BREAKPOINTS.tablet}px)`,
  touchDevice: "(hover: none) and (pointer: coarse)",
  mouseDevice: "(hover: hover) and (pointer: fine)",
} as const;

/**
 * Check if device supports touch
 */
export function isTouchDevice(): boolean {
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia(mediaQueries.touchDevice).matches
  );
}

/**
 * Detect if running in Capacitor native app
 */
export function isCapacitor(): boolean {
  return !!(window as any).Capacitor;
}

/**
 * Get safe area insets for mobile devices (notches, etc.)
 */
export function getSafeAreaInsets() {
  const style = getComputedStyle(document.documentElement);
  return {
    top: parseInt(style.getPropertyValue("env(safe-area-inset-top)") || "0"),
    right: parseInt(
      style.getPropertyValue("env(safe-area-inset-right)") || "0"
    ),
    bottom: parseInt(
      style.getPropertyValue("env(safe-area-inset-bottom)") || "0"
    ),
    left: parseInt(style.getPropertyValue("env(safe-area-inset-left)") || "0"),
  };
}

/**
 * Responsive value selector
 * Returns appropriate value based on device type
 */
export function responsive<T>(config: {
  mobile: T;
  tablet?: T;
  desktop?: T;
}): T {
  const deviceType = getDeviceType(window.innerWidth);

  if (deviceType === "mobile") {
    return config.mobile;
  }
  if (deviceType === "tablet") {
    return config.tablet ?? config.mobile;
  }
  return config.desktop ?? config.tablet ?? config.mobile;
}
