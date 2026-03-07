// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Mobile Platform Bootstrap
 * 
 * Platform-specific bootstrapping for mobile (Capacitor on Android/iOS).
 * Composes the POS app with mobile platform adapters using Capacitor plugins.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { PosOfflineDb } from "@jurnapod/offline-db/dexie";
import {
  createMobileNetworkAdapter,
  createMobileDeviceIdentityAdapter,
  createMobileAppStateAdapter
} from "../platform/mobile/index.js";
// Reuse web adapters for storage, sync transport, and printer (for now)
import {
  createWebStorageAdapter,
  createWebSyncTransportAdapter,
  createWebPrinterAdapter
} from "../platform/web/index.js";
import { RuntimeService } from "../services/runtime-service.js";
import { SyncService } from "../services/sync-service.js";
import { PrintService } from "../services/print-service.js";
import { SyncOrchestrator, type SyncOrchestratorConfig } from "../services/sync-orchestrator.js";
import { OutboxService } from "../services/outbox-service.js";

import { AppStatePort } from "../ports/app-state-port.js";

export interface MobileBootstrapContext {
  db: PosOfflineDb;
  runtime: RuntimeService;
  sync: SyncService;
  print: PrintService;
  orchestrator: SyncOrchestrator;
  outbox: OutboxService;
  appState: AppStatePort;
}

export interface MobileBootstrapConfig {
  apiOrigin: string;
  accessToken?: string;
  onPushError?: (error: Error) => void;
  onPushStatusChange?: (inFlight: boolean) => void;
  onPullStatusChange?: (inFlight: boolean) => void;
}

export function createMobileBootstrapContext(config: MobileBootstrapConfig): MobileBootstrapContext {
  // Initialize database
  const db = new PosOfflineDb();

  // Create platform adapters (mobile-specific)
  const networkAdapter = createMobileNetworkAdapter();
  const deviceIdentityAdapter = createMobileDeviceIdentityAdapter();
  const appStateAdapter = createMobileAppStateAdapter();

  // Create platform adapters (reusing web implementations)
  const storageAdapter = createWebStorageAdapter(db);
  const syncTransportAdapter = createWebSyncTransportAdapter();
  const printerAdapter = createWebPrinterAdapter(); // TODO: Replace with mobile printer adapter

  // Create services
  const runtime = new RuntimeService(storageAdapter, networkAdapter);
  const sync = new SyncService(storageAdapter, syncTransportAdapter);
  const print = new PrintService(printerAdapter, storageAdapter);
  const outbox = new OutboxService(storageAdapter);

  // Create sync orchestrator with config
  const orchestratorConfig: SyncOrchestratorConfig = {
    apiOrigin: config.apiOrigin,
    accessToken: config.accessToken,
    onPushError: config.onPushError,
    onPushStatusChange: config.onPushStatusChange,
    onPullStatusChange: config.onPullStatusChange
  };

  const orchestrator = new SyncOrchestrator(
    storageAdapter,
    networkAdapter,
    syncTransportAdapter,
    orchestratorConfig
  );

  return {
    db,
    runtime,
    sync,
    print,
    orchestrator,
    outbox,
    appState: appStateAdapter
  };
}

export interface BootstrapMobileAppOptions {
  rootElement: HTMLElement;
  AppComponent: React.ComponentType<{ context: MobileBootstrapContext }>;
  config: MobileBootstrapConfig;
}

export function bootstrapMobileApp(options: BootstrapMobileAppOptions): void {
  const context = createMobileBootstrapContext(options.config);

  // Note: Service worker is typically not needed for Capacitor apps
  // as the app runs from local files. But we can optionally register it
  // for offline caching of remote assets.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.log("Service worker registration skipped on mobile:", err);
      });
    });
  }

  // Render app
  const root = createRoot(options.rootElement);
  root.render(
    <React.StrictMode>
      <options.AppComponent context={context} />
    </React.StrictMode>
  );
}
