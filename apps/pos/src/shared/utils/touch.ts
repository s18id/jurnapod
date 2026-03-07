// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Touch optimization utilities for mobile-first design.
 * Provides helpers for touch targets, feedback, and interactions.
 */

import { MIN_TOUCH_TARGET } from "./constants.js";

/**
 * Ensure element meets minimum touch target size
 */
export function ensureTouchTarget(size: number): string {
  return `${Math.max(size, MIN_TOUCH_TARGET)}px`;
}

/**
 * CSS properties for touch-optimized elements
 */
export interface TouchOptimizedStyles {
  minHeight: string;
  minWidth: string;
  touchAction: React.CSSProperties["touchAction"];
  userSelect: React.CSSProperties["userSelect"];
  WebkitTapHighlightColor: string;
  cursor: React.CSSProperties["cursor"];
}

/**
 * Get base styles for touch-optimized interactive elements
 */
export function getTouchOptimizedStyles(
  disabled = false
): TouchOptimizedStyles {
  return {
    minHeight: ensureTouchTarget(MIN_TOUCH_TARGET),
    minWidth: ensureTouchTarget(MIN_TOUCH_TARGET),
    touchAction: "manipulation" as const, // Prevent double-tap zoom
    userSelect: "none" as const,
    WebkitTapHighlightColor: "transparent",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

/**
 * Touch feedback animation styles
 */
export interface TouchFeedbackStyles {
  transition: string;
  transform: string;
  opacity: number;
}

/**
 * Get styles for active touch state (pressed)
 */
export function getActiveTouchStyles(): TouchFeedbackStyles {
  return {
    transition: "all 0.1s ease",
    transform: "scale(0.95)",
    opacity: 0.8,
  };
}

/**
 * Haptic feedback (requires Capacitor Haptics plugin)
 * Provides fallback for web
 */
export async function hapticFeedback(
  type: "light" | "medium" | "heavy" = "light"
): Promise<void> {
  // Check if Capacitor Haptics is available
  const capacitor = (window as any).Capacitor;
  if (capacitor?.Plugins?.Haptics) {
    try {
      const { Haptics, ImpactStyle } = capacitor.Plugins;
      const style =
        type === "light"
          ? ImpactStyle.Light
          : type === "medium"
            ? ImpactStyle.Medium
            : ImpactStyle.Heavy;

      await Haptics.impact({ style });
    } catch (error) {
      console.warn("Haptic feedback failed:", error);
    }
  } else if ("vibrate" in navigator) {
    // Fallback to Vibration API
    const duration = type === "light" ? 10 : type === "medium" ? 20 : 30;
    navigator.vibrate(duration);
  }
}

/**
 * Prevent iOS double-tap zoom on specific element
 */
export function preventDoubleTapZoom(element: HTMLElement): void {
  let lastTouchEnd = 0;

  element.addEventListener(
    "touchend",
    (event) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );
}

/**
 * Dismiss keyboard on mobile
 */
export function dismissKeyboard(): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

/**
 * Check if element is within safe touch area (considering finger size)
 */
export function isWithinSafeTouchArea(
  x: number,
  y: number,
  element: HTMLElement,
  padding = 8
): boolean {
  const rect = element.getBoundingClientRect();
  return (
    x >= rect.left - padding &&
    x <= rect.right + padding &&
    y >= rect.top - padding &&
    y <= rect.bottom + padding
  );
}

/**
 * Pull-to-refresh configuration
 */
export interface PullToRefreshConfig {
  threshold?: number; // Distance to pull before triggering refresh
  maxPull?: number; // Maximum pull distance
  resistance?: number; // Pull resistance (0-1)
}

/**
 * Calculate pull-to-refresh progress
 */
export function calculatePullProgress(
  pullDistance: number,
  threshold: number,
  maxPull: number
): number {
  return Math.min(pullDistance / threshold, maxPull / threshold);
}

/**
 * Apply pull resistance (makes pull feel more natural)
 */
export function applyPullResistance(
  pullDistance: number,
  resistance: number
): number {
  return pullDistance * (1 - resistance * (pullDistance / 300));
}
