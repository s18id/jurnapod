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
  pushSendConcurrency?: number;
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
      // Verify network connectivity with healthcheck
      const isConnected = await this.network.verifyConnectivity({
        baseUrl: this.config.apiOrigin,
        timeoutMs: 3000
      });

      if (!isConnected) {
        return {
          success: false,
          data_version: 0,
          upserted_product_count: 0,
          message: "Pull sync skipped: backend unreachable"
        };
      }

      // Get current sync metadata
      const currentMetadata = await this.storage.getSyncMetadata(scope);
      const sinceVersion = currentMetadata?.last_data_version;
      const ordersCursor = currentMetadata?.orders_cursor;

      // Self-heal for stale metadata: if local active catalog is empty, force full pull.
      const currentActiveProducts = await this.storage.getProductsByOutlet({
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        is_active: true
      });
      const requestedSinceVersion = currentActiveProducts.length === 0 ? 0 : sinceVersion;

      // Pull from server
      const response = await this.transport.pull(
        {
          company_id: scope.company_id,
          outlet_id: scope.outlet_id,
          since_version: requestedSinceVersion,
          orders_cursor: ordersCursor
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
      const previousDataVersion = currentMetadata?.last_data_version ?? 0;
      const catalogAdvanced = dataVersion > previousDataVersion;

      const items = response.data.items;
      const itemGroups = response.data.item_groups;
      const prices = response.data.prices;
      const config = response.data.config;
      const openOrders = response.data.open_orders ?? [];
      const openOrderLines = response.data.open_order_lines ?? [];
      const orderUpdates = response.data.order_updates ?? [];
      const nextOrdersCursor = response.data.orders_cursor ?? ordersCursor ?? 0;
      const tables = response.data.tables ?? [];
      const reservations = response.data.reservations ?? [];

      // Build lookup maps
      const now = new Date().toISOString();
      const itemsById = new Map(items.map((item) => [item.id, item]));
      const groupsById = new Map(itemGroups.map((group) => [group.id, group]));

      let productRows: Array<{
        pk: string;
        company_id: number;
        outlet_id: number;
        item_id: number;
        sku: string | null;
        name: string;
        item_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
        item_group_id: number | null;
        item_group_name: string | null;
        price_snapshot: number;
        is_active: boolean;
        item_updated_at: string;
        price_updated_at: string;
        data_version: number;
        pulled_at: string;
        track_stock: boolean;
        low_stock_threshold: number | null;
      }> = [];

      if (catalogAdvanced) {
        // Join items with prices for this outlet
        productRows = prices
          .filter((price) => price.outlet_id === scope.outlet_id)
          .map((price) => {
            const item = itemsById.get(price.item_id);
            if (!item) {
              return null;
            }

            const groupId = item.item_group_id ?? null;
            const group = groupId ? groupsById.get(groupId) : null;

            return {
              pk: `${scope.company_id}:${scope.outlet_id}:${item.id}`,
              company_id: scope.company_id,
              outlet_id: scope.outlet_id,
              item_id: item.id,
              sku: item.sku,
              name: item.name,
              item_type: item.type,
              item_group_id: groupId,
              item_group_name: group?.name ?? null,
              price_snapshot: price.price,
              is_active: item.is_active && price.is_active,
              item_updated_at: item.updated_at,
              price_updated_at: price.updated_at,
              data_version: dataVersion,
              pulled_at: now,
              track_stock: item.track_stock ?? false,
              low_stock_threshold: item.low_stock_threshold ?? 0
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null);

        // Reconcile stale products: mark previously cached items as inactive
        // if they don't appear in the new payload
        const incomingItemIds = new Set(productRows.map((row) => row.item_id));
        const staleProducts = currentActiveProducts
          .filter((row) => !incomingItemIds.has(row.item_id))
          .map((row) => ({
            ...row,
            is_active: false,
            data_version: dataVersion,
            pulled_at: now
          }));

        // Upsert both new/updated products and stale products
        await this.storage.upsertProducts([...productRows, ...staleProducts]);
      }

      const effectiveDataVersion = catalogAdvanced ? dataVersion : previousDataVersion;

      // Update sync metadata
      await this.storage.upsertSyncMetadata({
        pk: `${scope.company_id}:${scope.outlet_id}`,
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        last_data_version: effectiveDataVersion,
        orders_cursor: nextOrdersCursor,
        last_pulled_at: now,
        updated_at: now
      });

      // Update sync scope config
      await this.storage.upsertSyncScopeConfig({
        pk: `${scope.company_id}:${scope.outlet_id}`,
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        data_version: effectiveDataVersion,
        tax_rate: config.tax.rate,
        tax_inclusive: config.tax.inclusive,
        payment_methods: config.payment_methods,
        updated_at: now
      });

      if (openOrders.length > 0) {
        await this.storage.upsertActiveOrders(
          openOrders.map((order) => ({
            pk: order.order_id,
            order_id: order.order_id,
            company_id: order.company_id,
            outlet_id: order.outlet_id,
            service_type: order.service_type,
            table_id: order.table_id,
            reservation_id: order.reservation_id,
            guest_count: order.guest_count,
            is_finalized: order.is_finalized,
            order_status: order.order_status,
            order_state: order.order_state,
            paid_amount: order.paid_amount,
            opened_at: order.opened_at,
            closed_at: order.closed_at,
            notes: order.notes,
            discount_percent: 0,
            discount_fixed: 0,
            discount_code: null,
            updated_at: order.updated_at
          }))
        );

        const orderLineMap = new Map<string, typeof openOrderLines>();
        for (const line of openOrderLines) {
          const list = orderLineMap.get(line.order_id) ?? [];
          list.push(line);
          orderLineMap.set(line.order_id, list);
        }

        for (const order of openOrders) {
          const lines = (orderLineMap.get(order.order_id) ?? []).map((line) => ({
            pk: `${line.order_id}:${line.item_id}`,
            order_id: line.order_id,
            company_id: line.company_id,
            outlet_id: line.outlet_id,
            item_id: line.item_id,
            sku_snapshot: line.sku_snapshot,
            name_snapshot: line.name_snapshot,
            item_type_snapshot: line.item_type_snapshot,
            unit_price_snapshot: line.unit_price_snapshot,
            qty: line.qty,
            discount_amount: line.discount_amount,
            updated_at: line.updated_at
          }));
          await this.storage.replaceActiveOrderLines(order.order_id, lines);
        }
      }

      for (const update of orderUpdates) {
        await this.storage.putActiveOrderUpdate({
          pk: `active_order_update:${update.update_id}`,
          update_id: update.update_id,
          order_id: update.order_id,
          company_id: update.company_id,
          outlet_id: update.outlet_id,
          base_order_updated_at: update.base_order_updated_at,
          event_type: update.event_type as
            | "SNAPSHOT_FINALIZED"
            | "ITEM_ADDED"
            | "ITEM_REMOVED"
            | "QTY_CHANGED"
            | "ITEM_CANCELLED"
            | "NOTES_CHANGED"
            | "ORDER_RESUMED"
            | "ORDER_CLOSED",
          delta_json: update.delta_json,
          actor_user_id: update.actor_user_id,
          device_id: update.device_id,
          event_at: update.event_at,
          created_at: update.created_at,
          sync_status: "SENT",
          sync_error: null
        });
      }

      // Upsert outlet tables
      if (tables.length > 0) {
        const tableRows = tables.map((table) => ({
          pk: `${scope.company_id}:${scope.outlet_id}:${table.table_id}`,
          company_id: scope.company_id,
          outlet_id: scope.outlet_id,
          table_id: table.table_id,
          code: table.code,
          name: table.name,
          zone: table.zone,
          capacity: table.capacity,
          status: table.status,
          updated_at: table.updated_at
        }));
        await this.storage.upsertOutletTables(tableRows);
      }

      // Upsert reservations
      if (reservations.length > 0) {
        const reservationRows = reservations.map((reservation) => ({
          pk: `${scope.company_id}:${scope.outlet_id}:${reservation.reservation_id}`,
          reservation_id: reservation.reservation_id,
          company_id: scope.company_id,
          outlet_id: scope.outlet_id,
          table_id: reservation.table_id,
          customer_name: reservation.customer_name,
          customer_phone: reservation.customer_phone,
          guest_count: reservation.guest_count,
          reservation_at: reservation.reservation_at,
          duration_minutes: reservation.duration_minutes,
          status: reservation.status,
          notes: reservation.notes,
          linked_order_id: reservation.linked_order_id,
          created_at: reservation.updated_at,
          updated_at: reservation.updated_at,
          arrived_at: reservation.arrived_at,
          seated_at: reservation.seated_at,
          cancelled_at: reservation.cancelled_at
        }));
        await this.storage.upsertReservations(reservationRows);
      }

      return {
        success: true,
        data_version: effectiveDataVersion,
        upserted_product_count: productRows.length,
        message: `Pull sync completed: version ${effectiveDataVersion}, ${productRows.length} products cached`
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
      // Verify network connectivity with healthcheck
      const isConnected = await this.network.verifyConnectivity({
        baseUrl: this.config.apiOrigin,
        timeoutMs: 3000
      });

      if (!isConnected) {
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
          send_concurrency: this.config.pushSendConcurrency,
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
