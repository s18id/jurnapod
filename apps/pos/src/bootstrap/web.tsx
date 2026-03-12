// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Web Platform Bootstrap
 * 
 * Platform-specific bootstrapping for web/PWA.
 * Composes the POS app with web platform adapters.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { PosOfflineDb } from "@jurnapod/offline-db/dexie";
import {
  createWebNetworkAdapter,
  createWebStorageAdapter,
  createWebSyncTransportAdapter,
  createWebPrinterAdapter,
  createWebDeviceIdentityAdapter,
  createWebAppStateAdapter
} from "../platform/web/index.js";
import { RuntimeService } from "../services/runtime-service.js";
import { SyncService } from "../services/sync-service.js";
import { PrintService } from "../services/print-service.js";
import { SyncOrchestrator, type SyncOrchestratorConfig } from "../services/sync-orchestrator.js";
import { OutboxService } from "../services/outbox-service.js";

import { AppStatePort } from "../ports/app-state-port.js";

export interface WebBootstrapContext {
  db: PosOfflineDb;
  runtime: RuntimeService;
  sync: SyncService;
  print: PrintService;
  orchestrator: SyncOrchestrator;
  outbox: OutboxService;
  appState: AppStatePort;
}

export interface WebBootstrapConfig {
  apiOrigin: string;
  accessToken?: string;
  onPushError?: (error: Error) => void;
  onPushStatusChange?: (inFlight: boolean) => void;
  onPullStatusChange?: (inFlight: boolean) => void;
  pushSendConcurrency?: number;
}

export function createWebBootstrapContext(config: WebBootstrapConfig): WebBootstrapContext {
  // Initialize database
  const db = new PosOfflineDb();

  // Create platform adapters
  const networkAdapter = createWebNetworkAdapter();
  const storageAdapter = createWebStorageAdapter(db);
  const syncTransportAdapter = createWebSyncTransportAdapter();
  const printerAdapter = createWebPrinterAdapter();
  const deviceIdentityAdapter = createWebDeviceIdentityAdapter();
  const appStateAdapter = createWebAppStateAdapter();

  // Create sync orchestrator with config
  const orchestratorConfig: SyncOrchestratorConfig = {
    apiOrigin: config.apiOrigin,
    accessToken: config.accessToken,
    onPushError: config.onPushError,
    onPushStatusChange: config.onPushStatusChange,
    onPullStatusChange: config.onPullStatusChange,
    pushSendConcurrency: config.pushSendConcurrency
  };

  const orchestrator = new SyncOrchestrator(
    storageAdapter,
    networkAdapter,
    syncTransportAdapter,
    orchestratorConfig
  );

  // Create services
  const runtime = new RuntimeService(storageAdapter, networkAdapter, (reason) => orchestrator.requestPush(reason));
  const sync = new SyncService(storageAdapter, syncTransportAdapter);
  const print = new PrintService(printerAdapter, storageAdapter);
  const outbox = new OutboxService(storageAdapter);

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

export interface BootstrapWebAppOptions {
  rootElement: HTMLElement;
  AppComponent: React.ComponentType<{ context: WebBootstrapContext }>;
  config: WebBootstrapConfig;
}

export function bootstrapWebApp(options: BootstrapWebAppOptions): void {
  const context = createWebBootstrapContext(options.config);

  // Register service worker for PWA
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/sw.js");
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
