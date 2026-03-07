// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Shared Utilities
 * 
 * Exports reusable utility functions for the POS application.
 */

// Responsive utilities
export {
  getDeviceType,
  isMobileViewport,
  isTabletViewport,
  isDesktopViewport,
  getResponsiveConfig,
  isTouchDevice,
  isCapacitor,
  getSafeAreaInsets,
  responsive,
  BREAKPOINTS,
  mediaQueries
} from "./responsive.js";
export type { DeviceType, ResponsiveConfig } from "./responsive.js";

// Touch utilities
export {
  ensureTouchTarget,
  getTouchOptimizedStyles,
  getActiveTouchStyles,
  hapticFeedback,
  preventDoubleTapZoom,
  dismissKeyboard,
  isWithinSafeTouchArea,
  calculatePullProgress,
  applyPullResistance
} from "./touch.js";
export type {
  TouchOptimizedStyles,
  TouchFeedbackStyles,
  PullToRefreshConfig
} from "./touch.js";

// Style utilities
export {
  colors,
  spacing,
  borderRadius,
  shadows,
  typography,
  animations,
  getInteractiveStyles,
  getElevation,
  responsiveSpacing,
  cardStyles,
  dividerStyles,
  spinnerStyles
} from "./styles.js";
