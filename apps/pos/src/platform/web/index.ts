// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Web Platform Adapters
 * 
 * This module exports platform adapter implementations for the web platform.
 * These adapters implement the port interfaces using browser APIs.
 */

export { createWebNetworkAdapter } from "./network.js";
export { createWebStorageAdapter } from "./storage.js";
export { createWebSyncTransportAdapter } from "./sync-transport.js";
export { createWebPrinterAdapter } from "./printer.js";
export { createWebDeviceIdentityAdapter } from "./device-identity.js";
