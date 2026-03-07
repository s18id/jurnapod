// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Shared Hooks
 * 
 * Exports reusable React hooks for the POS application.
 */

export { useAppState, type UseAppStateOptions } from "./useAppState.js";

// Responsive hooks
export {
  useBreakpoint,
  useDeviceType,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useResponsiveValue
} from "./useBreakpoint.js";
export type { ResponsiveConfig, DeviceType } from "../utils/responsive.js";

// Touch and swipe hooks
export { useSwipe, useSwipeToDelete } from "./useSwipe.js";
export type {
  SwipeDirection,
  SwipeConfig,
  SwipeToDeleteConfig
} from "./useSwipe.js";

// Keyboard hooks
export {
  useKeyboard,
  useAutoFocus,
  useDismissKeyboard,
  useEnterKeySubmit,
  useScrollToInput,
  getInputMode,
  PAYMENT_KEYBOARD_CONFIG,
  SEARCH_KEYBOARD_CONFIG,
  EMAIL_KEYBOARD_CONFIG
} from "./useKeyboard.js";
export type { KeyboardState, InputModeType } from "./useKeyboard.js";

// Performance hooks
export {
  useDebounce,
  useDebouncedCallback,
  useThrottledCallback
} from "./useDebounce.js";

export { useVirtualScroll, useInfiniteScroll } from "./useVirtualScroll.js";
export type {
  VirtualScrollConfig,
  VirtualScrollResult,
  InfiniteScrollConfig
} from "./useVirtualScroll.js";

export {
  useLazyImage,
  useImagePreload,
  useProgressiveImage
} from "./useLazyImage.js";
export type {
  LazyImageConfig,
  LazyImageResult,
  ProgressiveImageConfig
} from "./useLazyImage.js";
