// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Mobile-first styling utilities and theme system
 */

import type { CSSProperties } from "react";

/**
 * Color palette for consistent theming
 */
export const colors = {
  // Primary colors
  primary: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6", // Main primary
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a"
  },
  
  // Gray scale
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827"
  },

  // Semantic colors
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",

  // Status colors for sync
  online: "#10b981",
  offline: "#6b7280",
  syncing: "#f59e0b",
  syncError: "#ef4444"
};

/**
 * Spacing scale (px)
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48
};

/**
 * Border radius scale (px)
 */
export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999
};

/**
 * Shadow presets
 */
export const shadows = {
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
};

/**
 * Typography scale
 */
export const typography = {
  xs: { fontSize: "12px", lineHeight: "16px" },
  sm: { fontSize: "14px", lineHeight: "20px" },
  base: { fontSize: "16px", lineHeight: "24px" }, // Prevents iOS zoom
  lg: { fontSize: "18px", lineHeight: "28px" },
  xl: { fontSize: "20px", lineHeight: "28px" },
  "2xl": { fontSize: "24px", lineHeight: "32px" },
  "3xl": { fontSize: "30px", lineHeight: "36px" }
};

/**
 * Mobile-first animation presets
 */
export const animations = {
  // Fast touch feedback
  touchFeedback: {
    transition: "all 0.1s ease",
    transformOrigin: "center"
  },
  
  // Standard UI transitions
  standard: {
    transition: "all 0.2s ease"
  },
  
  // Smooth slide animations
  slide: {
    transition: "transform 0.3s ease-out"
  },
  
  // Fade animations
  fade: {
    transition: "opacity 0.2s ease"
  }
};

/**
 * Get styles for interactive element states
 */
export function getInteractiveStyles(
  state: "normal" | "hover" | "active" | "disabled"
): CSSProperties {
  switch (state) {
    case "hover":
      return {
        opacity: 0.9,
        transform: "scale(1.02)"
      };
    case "active":
      return {
        opacity: 0.8,
        transform: "scale(0.95)"
      };
    case "disabled":
      return {
        opacity: 0.5,
        cursor: "not-allowed",
        pointerEvents: "none"
      };
    default:
      return {
        opacity: 1,
        transform: "scale(1)"
      };
  }
}

/**
 * Get shadow for elevation level
 */
export function getElevation(level: 0 | 1 | 2 | 3): string {
  switch (level) {
    case 0:
      return "none";
    case 1:
      return shadows.sm;
    case 2:
      return shadows.md;
    case 3:
      return shadows.lg;
  }
}

/**
 * Utility to create responsive padding/margin
 */
export function responsiveSpacing(
  mobile: number,
  tablet?: number,
  desktop?: number
): string {
  // This is simplified; in practice you'd use media queries or JS
  return `${mobile}px`;
}

/**
 * Card component base styles
 */
export const cardStyles: CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: `${borderRadius.md}px`,
  boxShadow: shadows.sm,
  padding: `${spacing.md}px`,
  border: `1px solid ${colors.gray[200]}`
};

/**
 * Divider styles
 */
export const dividerStyles: CSSProperties = {
  height: "1px",
  backgroundColor: colors.gray[200],
  border: "none",
  margin: `${spacing.md}px 0`
};

/**
 * Loading spinner animation
 */
export const spinnerStyles: CSSProperties = {
  border: "2px solid transparent",
  borderTopColor: colors.primary[500],
  borderRadius: "50%",
  animation: "spin 0.6s linear infinite"
};
