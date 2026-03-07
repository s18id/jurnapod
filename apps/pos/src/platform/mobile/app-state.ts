// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Mobile App State Adapter
 * 
 * Implements AppStatePort using Capacitor App plugin for native lifecycle events.
 * This adapter is for use with Capacitor on Android/iOS.
 */

import type { AppStatePort } from "../../ports/app-state-port.js";

export { type AppStatePort } from "../../ports/app-state-port.js";

/**
 * Mobile implementation using @capacitor/app plugin.
 * 
 * Note: This implementation expects @capacitor/app to be installed.
 * The actual import is done dynamically to avoid breaking web builds.
 */
export function createMobileAppStateAdapter(): AppStatePort {
  // Dynamic import of Capacitor App plugin to avoid breaking web builds
  // In production, this should be handled by the build system
  const App = (globalThis as any).Capacitor?.Plugins?.App;

  if (!App) {
    // Fallback to web implementation if Capacitor is not available
    console.warn("Capacitor App plugin not found, falling back to web visibilitychange");
    return createFallbackAppStateAdapter();
  }

  return {
    onActive: (callback) => {
      const listenerHandle = App.addListener("appStateChange", (state: { isActive: boolean }) => {
        if (state.isActive) {
          callback();
        }
      });
      
      // Return cleanup function
      return () => {
        if (listenerHandle && typeof listenerHandle.remove === "function") {
          void listenerHandle.remove();
        }
      };
    },

    onInactive: (callback) => {
      const listenerHandle = App.addListener("appStateChange", (state: { isActive: boolean }) => {
        if (!state.isActive) {
          callback();
        }
      });
      
      return () => {
        if (listenerHandle && typeof listenerHandle.remove === "function") {
          void listenerHandle.remove();
        }
      };
    },

    onBackground: (callback) => {
      // For native apps, background is essentially the same as inactive
      const listenerHandle = App.addListener("appStateChange", (state: { isActive: boolean }) => {
        if (!state.isActive) {
          callback();
        }
      });
      
      return () => {
        if (listenerHandle && typeof listenerHandle.remove === "function") {
          void listenerHandle.remove();
        }
      };
    }
  };
}

/**
 * Fallback to web implementation if Capacitor is not available.
 */
function createFallbackAppStateAdapter(): AppStatePort {
  return {
    onActive: (callback) => {
      const handler = () => {
        if (document.visibilityState === "visible") {
          callback();
        }
      };
      document.addEventListener("visibilitychange", handler);
      return () => document.removeEventListener("visibilitychange", handler);
    },

    onInactive: (callback) => {
      const handler = () => {
        if (document.visibilityState === "hidden") {
          callback();
        }
      };
      document.addEventListener("visibilitychange", handler);
      return () => document.removeEventListener("visibilitychange", handler);
    },

    onBackground: (callback) => {
      const handler = () => {
        if (document.visibilityState === "hidden") {
          callback();
        }
      };
      document.addEventListener("visibilitychange", handler);
      return () => document.removeEventListener("visibilitychange", handler);
    }
  };
}
