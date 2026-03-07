// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Mobile Platform Adapters
 * 
 * This module exports platform adapter implementations for the mobile platform (Capacitor).
 * These adapters implement the port interfaces using Capacitor plugins for native functionality.
 */

export { createMobileAppStateAdapter } from "./app-state.js";
export { createMobileNetworkAdapter } from "./network.js";
export { createMobileDeviceIdentityAdapter } from "./device-identity.js";
