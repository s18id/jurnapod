// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * UI helper functions for badge colors and other visual elements.
 */

import type { RuntimeSyncBadgeState } from "../../services/runtime-service.js";

export function badgeColors(status: RuntimeSyncBadgeState): { background: string; border: string; text: string } {
  if (status === "Offline") {
    return {
      background: "#fef2f2",
      border: "#fecaca",
      text: "#b91c1c"
    };
  }

  if (status === "Pending") {
    return {
      background: "#fffbeb",
      border: "#fde68a",
      text: "#92400e"
    };
  }

  return {
    background: "#ecfdf5",
    border: "#bbf7d0",
    text: "#166534"
  };
}
