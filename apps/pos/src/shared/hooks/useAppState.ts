// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * useAppState Hook
 * 
 * React hook for subscribing to application lifecycle events via AppStatePort.
 * Provides a clean abstraction for components to react to app becoming active/inactive/background.
 */

import { useEffect } from "react";
import type { AppStatePort } from "../../ports/app-state-port.js";

export interface UseAppStateOptions {
  /**
   * Callback when app becomes active/visible
   */
  onActive?: () => void;

  /**
   * Callback when app becomes inactive/hidden
   */
  onInactive?: () => void;

  /**
   * Callback when app moves to background
   */
  onBackground?: () => void;
}

/**
 * Hook to subscribe to app lifecycle events.
 * 
 * @param appState - AppStatePort instance from bootstrap context
 * @param options - Lifecycle event callbacks
 * 
 * @example
 * ```tsx
 * function CheckoutPage({ context }: { context: WebBootstrapContext }) {
 *   useAppState(context.appState, {
 *     onActive: () => {
 *       console.log('App resumed, refresh data');
 *     },
 *     onInactive: () => {
 *       console.log('App backgrounded, save state');
 *     }
 *   });
 *   
 *   return <div>...</div>;
 * }
 * ```
 */
export function useAppState(
  appState: AppStatePort,
  options: UseAppStateOptions
): void {
  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    if (options.onActive) {
      const unsubscribe = appState.onActive(options.onActive);
      unsubscribers.push(unsubscribe);
    }

    if (options.onInactive) {
      const unsubscribe = appState.onInactive(options.onInactive);
      unsubscribers.push(unsubscribe);
    }

    if (options.onBackground) {
      const unsubscribe = appState.onBackground(options.onBackground);
      unsubscribers.push(unsubscribe);
    }

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [appState, options.onActive, options.onInactive, options.onBackground]);
}
