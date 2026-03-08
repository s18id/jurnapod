// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useCallback, useRef } from "react";
import { useNavigate, useBlocker } from "react-router-dom";
import type { Blocker } from "react-router-dom";

export interface NavigationGuardOptions {
  /**
   * Determines if navigation should be blocked
   */
  shouldBlock: () => boolean;

  /**
   * Called when user confirms they want to save before navigating
   */
  onSave: () => Promise<void>;

  /**
   * Called when user confirms they want to discard changes
   */
  onDiscard?: () => void;

  /**
   * Optional callback when navigation is blocked
   */
  onBlocked?: () => void;
}

export interface NavigationGuardReturn {
  /**
   * Whether navigation is currently blocked
   */
  isBlocked: boolean;

  /**
   * Proceed with the blocked navigation (after saving or discarding)
   */
  proceed: () => void;

  /**
   * Cancel the blocked navigation and stay on current page
   */
  cancel: () => void;

  /**
   * Save changes and then proceed with navigation
   */
  saveAndProceed: () => Promise<void>;

  /**
   * Discard changes and proceed with navigation
   */
  discardAndProceed: () => void;
}

/**
 * Hook to guard navigation when there are unsaved changes
 * 
 * Usage:
 * ```tsx
 * const { isBlocked, proceed, cancel, saveAndProceed, discardAndProceed } = useNavigationGuard({
 *   shouldBlock: () => cartLines.length > 0,
 *   onSave: async () => { await saveOrder(); },
 *   onDiscard: () => { clearCart(); }
 * });
 * 
 * // Show confirmation modal when isBlocked is true
 * ```
 */
export function useNavigationGuard({
  shouldBlock,
  onSave,
  onDiscard,
  onBlocked
}: NavigationGuardOptions): NavigationGuardReturn {
  const blockerRef = useRef<Blocker | null>(null);

  // Use React Router's useBlocker to intercept navigation
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    blockerRef.current = blocker;
  }, [blocker]);

  useEffect(() => {
    if (blocker.state === "blocked" && onBlocked) {
      onBlocked();
    }
  }, [blocker.state, onBlocked]);

  const proceed = useCallback(() => {
    if (blocker.state === "blocked") {
      blocker.proceed();
    }
  }, [blocker]);

  const cancel = useCallback(() => {
    if (blocker.state === "blocked") {
      blocker.reset();
    }
  }, [blocker]);

  const saveAndProceed = useCallback(async () => {
    try {
      await onSave();
      proceed();
    } catch (error) {
      console.error("Failed to save before navigation:", error);
      // Don't proceed if save failed
    }
  }, [onSave, proceed]);

  const discardAndProceed = useCallback(() => {
    if (onDiscard) {
      onDiscard();
    }
    proceed();
  }, [onDiscard, proceed]);

  return {
    isBlocked: blocker.state === "blocked",
    proceed,
    cancel,
    saveAndProceed,
    discardAndProceed
  };
}

/**
 * Hook to warn user before closing/refreshing browser tab with unsaved changes
 */
export function useBeforeUnload(shouldWarn: () => boolean): void {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (shouldWarn()) {
        event.preventDefault();
        // Modern browsers require returnValue to be set
        event.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [shouldWarn]);
}
