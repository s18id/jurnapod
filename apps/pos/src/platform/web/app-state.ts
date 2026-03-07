// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Web App State Adapter
 * 
 * Implements AppStatePort using document.visibilitychange for web/PWA.
 */

import type { AppStatePort } from "../../ports/app-state-port.js";

export { type AppStatePort } from "../../ports/app-state-port.js";

/**
 * Web implementation using document.visibilitychange
 */
export function createWebAppStateAdapter(): AppStatePort {
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
      // Same as inactive for web (browser doesn't distinguish inactive vs background)
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
