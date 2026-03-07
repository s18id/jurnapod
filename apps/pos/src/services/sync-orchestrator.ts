// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Orchestrator Service
 * 
 * Coordinates all sync operations (push and pull) outside of UI components.
 * Handles retry logic, backoff, reconnection, and multi-tab coordination.
 * 
 * This service implements ADR-0003 Rule 3: Keep sync orchestration outside UI.
 */

import type { NetworkPort } from "../ports/network-port.js";
import type { PosStoragePort } from "../ports/storage-port.js";
import type { SyncTransport } from "../ports/sync-transport.js";
import type { RuntimeOutletScope } from "./runtime-service.js";
import { createOutboxDrainScheduler } from "../offline/outbox-drain-scheduler.js";
import { drainOutboxJobs } from "../offline/outbox-drainer.js";
import { runOutboxDrainAsLeader } from "../offline/outbox-leader.js";
import { sendOutboxJobToSyncPush } from "../offline/outbox-sender.js";

export type SyncPushReason = "MANUAL_PUSH" | "AUTO_REFRESH" | "NETWORK_ONLINE" | "BACKGROUND_SYNC";

export interface SyncPushResult {
  success: boolean;
  sent_count: number;
  failed_count: number;
  stale_count: number;
  message: string;
}

export interface SyncPullResult {
  success: boolean;
  data_version: number;
  upserted_product_count: number;
  message: string;
}

export interface SyncOrchestratorConfig {
  apiOrigin: string;
  accessToken?: string;
  onPushError?: (error: Error) => void;
  onPushStatusChange?: (inFlight: boolean) => void;
  onPullStatusChange?: (inFlight: boolean) => void;
}

/**
 * SyncOrchestrator
 * 
 * Coordinates push and pull sync operations independently from UI.
 * 
 * Responsibilities:
 * - Reading pending outbox entries
 * - Pushing transactions to server
 * - Marking transactions as sent/failed
 * - Retry policy and backoff
 * - Version/cursor management
 * - Reconnection handling
 * - Multi-tab coordination via leader election
 */
export class SyncOrchestrator {
  private scheduler: ReturnType<typeof createOutboxDrainScheduler> | null = null;
  private pushInFlight = false;
  private pullInFlight = false;

  constructor(
    private storage: PosStoragePort,
    private network: NetworkPort,
    private transport: SyncTransport,
    private config: SyncOrchestratorConfig
  ) {}

  /**
   * Update orchestrator configuration (e.g. access token).
   */
  updateConfig(partial: Partial<SyncOrchestratorConfig>): void {
    this.config = {
      ...this.config,
      ...partial
    };
  }

  /**
   * Initialize the sync orchestrator.
   * Sets up outbox drain scheduler and background sync.
   */
  initialize(): void {
    if (this.scheduler) {
      return; // Already initialized
    }

    this.scheduler = createOutboxDrainScheduler({
      on_error: (error) => {
        const err = error instanceof Error ? error : new Error(String(error));
        this.config.onPushError?.(err);
      },
      drain: async ({ reasons }) => {
        await this.executePushCycle(reasons);
      }
    });
  }

  /**
   * Dispose the orchestrator and clean up resources.
   */
  dispose(): void {
    if (this.scheduler) {
      this.scheduler.dispose();
      this.scheduler = null;
    }
  }

  /**
   * Request a sync push operation.
   * Returns immediately; actual push happens asynchronously via scheduler.
   */
  async requestPush(reason: SyncPushReason): Promise<void> {
    if (!this.scheduler) {
      throw new Error("SyncOrchestrator not initialized");
    }

    await this.scheduler.requestDrain(reason);
  }

  /**
   * Execute a pull sync operation.
   * Downloads master data from server and updates local cache.
   */
  async executePull(scope: RuntimeOutletScope): Promise<SyncPullResult> {
    if (this.pullInFlight) {
      return {
        success: false,
        data_version: 0,
        upserted_product_count: 0,
        message: "Pull sync already in progress"
      };
    }

    this.pullInFlight = true;
    this.config.onPullStatusChange?.(true);

    try {
      // Check network connectivity
      if (!this.network.isOnline()) {
        return {
          success: false,
          data_version: 0,
          upserted_product_count: 0,
          message: "Pull sync skipped: offline"
        };
      }

      // Get current sync metadata
      const currentMetadata = await this.storage.getSyncMetadata(scope);
      const sinceVersion = currentMetadata?.last_data_version;

      // Pull from server
      const response = await this.transport.pull(
        {
          company_id: scope.company_id,
          outlet_id: scope.outlet_id,
          since_version: sinceVersion
        },
        {
          baseUrl: this.config.apiOrigin,
          accessToken: this.config.accessToken
        }
      );

      if (!response.success) {
        return {
          success: false,
          data_version: 0,
          upserted_product_count: 0,
          message: "Pull sync failed: server returned error"
        };
      }

      const dataVersion = response.data.data_version;
      const products = response.data.products;
      const config = response.data.config;

      // Upsert products into cache
      const now = new Date().toISOString();
      const productRows = products.map((product) => ({
        pk: `${scope.company_id}:${scope.outlet_id}:${product.item_id}`,
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        item_id: product.item_id,
        sku: product.sku,
        name: product.name,
        item_type: "PRODUCT" as const,
        price_snapshot: product.price,
        is_active: product.is_active,
        item_updated_at: now,
        price_updated_at: now,
        data_version: dataVersion,
        pulled_at: now
      }));

      await this.storage.upsertProducts(productRows);

      // Update sync metadata
      await this.storage.upsertSyncMetadata({
        pk: `${scope.company_id}:${scope.outlet_id}`,
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        last_data_version: dataVersion,
        last_pulled_at: now,
        updated_at: now
      });

      // Update sync scope config if present
      if (config && typeof config === "object") {
        const configObj = config as { tax?: { rate: number; inclusive: boolean }; payment_methods?: string[] };
        await this.storage.upsertSyncScopeConfig({
          pk: `${scope.company_id}:${scope.outlet_id}`,
          company_id: scope.company_id,
          outlet_id: scope.outlet_id,
          data_version: dataVersion,
          tax_rate: configObj.tax?.rate ?? 0,
          tax_inclusive: configObj.tax?.inclusive ?? false,
          payment_methods: configObj.payment_methods ?? ["CASH"],
          updated_at: now
        });
      }

      return {
        success: true,
        data_version: dataVersion,
        upserted_product_count: productRows.length,
        message: `Pull sync completed: version ${dataVersion}, ${productRows.length} products cached`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        data_version: 0,
        upserted_product_count: 0,
        message: `Pull sync failed: ${message}`
      };
    } finally {
      this.pullInFlight = false;
      this.config.onPullStatusChange?.(false);
    }
  }

  /**
   * Execute a push sync cycle (internal, called by scheduler).
   */
  private async executePushCycle(reasons: readonly string[]): Promise<void> {
    if (this.pushInFlight) {
      return;
    }

    this.pushInFlight = true;
    this.config.onPushStatusChange?.(true);

    try {
      // Check network connectivity
      if (!this.network.isOnline()) {
        return;
      }

      // Check if there are due outbox jobs
      const dueCount = await this.storage.countGlobalDueOutboxJobs(new Date());
      if (dueCount <= 0) {
        return;
      }

      // Run outbox drain with leader election
      await runOutboxDrainAsLeader(async () => {
        const drainReason = reasons.slice().sort().join(",");
        return drainOutboxJobs({
          drain_reason: drainReason,
          sender: async ({ job, db }) => {
            return sendOutboxJobToSyncPush(
              {
                job,
                endpoint: `${this.config.apiOrigin}/api/sync/push`,
                access_token: this.config.accessToken
              },
              db
            );
          }
        });
      });
    } finally {
      this.pushInFlight = false;
      this.config.onPushStatusChange?.(false);
    }
  }

  /**
   * Get current push sync status.
   */
  isPushInFlight(): boolean {
    return this.pushInFlight;
  }

  /**
   * Get current pull sync status.
   */
  isPullInFlight(): boolean {
    return this.pullInFlight;
  }
}
