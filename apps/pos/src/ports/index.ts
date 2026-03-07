// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * POS Platform Ports
 * 
 * This module exports all port interfaces for POS platform abstractions.
 * These interfaces define the contracts between business logic and platform-specific implementations.
 * 
 * Port implementations should be provided by platform adapters (web, capacitor, etc.).
 */

export type { PosStoragePort } from "./storage-port.js";
export type { NetworkPort } from "./network-port.js";
export type {
  SyncTransport,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  SyncPushTransaction,
  SyncPushResponseItem
} from "./sync-transport.js";
export type {
  PrinterPort,
  PrintReceiptInput,
  PrintInvoiceInput,
  PrintReportInput,
  PrintOptions,
  PrintResult,
  PrintFormat,
  PrintOutputMode
} from "./printer-port.js";
export type {
  DeviceIdentityPort,
  DeviceInfo,
  DeviceRegistration,
  DevicePlatform
} from "./device-identity-port.js";
export type { AppStatePort } from "./app-state-port.js";
