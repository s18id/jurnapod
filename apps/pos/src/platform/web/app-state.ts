// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Web App State Adapter
 * 
 * Implements AppStatePort using document.visibilitychange for web/PWA.
 */

import { createWebAppStateAdapter as createAdapter, type AppStatePort } from "../../ports/app-state-port.js";

export { type AppStatePort } from "../../ports/app-state-port.js";

export function createWebAppStateAdapter(): AppStatePort {
  return createAdapter();
}
