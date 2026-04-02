// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Feature Flags Adapter for API
 *
 * Thin adapter that re-exports from @jurnapod/modules-platform.
 * No business logic here - all logic lives in the platform package.
 */

// Re-export everything from the platform package
export {
  getPushSyncMode,
  shouldUseNewPushSync,
  getPushSyncModeDescription,
  type PushSyncMode
} from "@jurnapod/modules-platform";
