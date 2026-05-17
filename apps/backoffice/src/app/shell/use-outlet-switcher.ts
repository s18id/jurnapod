// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Outlet switcher model.
//
// Provides logic for:
//   - Selecting an outlet from the list of available outlets
//   - Persisting the selection to sessionStorage
//   - Deriving the current outlet from user + persisted state

import { useCallback, useMemo, useState } from "react";
import type { UserOutlet } from "@/lib/session";

const OUTLET_STORAGE_KEY = "jurnapod.backoffice.selectedOutletId";

/**
 * Read the persisted outlet ID from sessionStorage, or null if not set.
 */
export function getStoredOutletId(): number | null {
  try {
    const raw = sessionStorage.getItem(OUTLET_STORAGE_KEY);
    if (raw) {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist the selected outlet ID to sessionStorage.
 */
export function setStoredOutletId(outletId: number): void {
  try {
    sessionStorage.setItem(OUTLET_STORAGE_KEY, String(outletId));
  } catch {
    // sessionStorage may be unavailable in some environments
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface OutletSwitcherResult {
  /** Currently selected outlet */
  currentOutlet: UserOutlet | null;
  /** All outlets the user can switch to */
  availableOutlets: UserOutlet[];
  /** Switch to a different outlet */
  switchOutlet: (outlet: UserOutlet) => void;
}

/**
 * Hook that manages outlet selection state.
 *
 * On first render, it checks sessionStorage for a persisted outlet ID.
 * If found and valid, it selects that outlet. Otherwise it defaults to
 * the first outlet in the user's list.
 *
 * Switching persists to sessionStorage and updates the local state.
 */
export function useOutletSwitcher(
  availableOutlets: UserOutlet[],
): OutletSwitcherResult {
  const resolveOutlet = useCallback(() => {
    if (availableOutlets.length === 0) {
      return null;
    }
    const storedId = getStoredOutletId();
    if (storedId !== null) {
      const match = availableOutlets.find((o) => o.id === storedId);
      if (match) {
        return match;
      }
    }
    return availableOutlets[0] ?? null;
  }, [availableOutlets]);

  const [currentOutlet, setCurrentOutlet] = useState<UserOutlet | null>(() => resolveOutlet());

  // When availableOutlets changes (e.g., after login), re-resolve
  const resolvedCurrent = useMemo(() => {
    if (!currentOutlet) {
      return resolveOutlet();
    }
    // If current outlet is no longer in available outlets, pick first
    if (!availableOutlets.find((o) => o.id === currentOutlet.id)) {
      return availableOutlets[0] ?? null;
    }
    return currentOutlet;
  }, [currentOutlet, availableOutlets, resolveOutlet]);

  const switchOutlet = useCallback((outlet: UserOutlet) => {
    setStoredOutletId(outlet.id);
    setCurrentOutlet(outlet);
  }, []);

  return {
    currentOutlet: resolvedCurrent,
    availableOutlets,
    switchOutlet,
  };
}
