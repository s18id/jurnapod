// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Runtime Service
 * 
 * Platform-agnostic runtime state management service.
 * Uses port interfaces instead of direct platform dependencies.
 */

import type { PosStoragePort } from "../ports/storage-port.js";
import type { NetworkPort } from "../ports/network-port.js";
import type {
  OutletTableRow,
  ProductCacheRow,
  ReservationRow,
  ActiveOrderRow,
  ActiveOrderLineRow,
  ActiveOrderUpdateRow,
  ItemCancellationRow,
  OrderUpdateEventType,
  OrderStatus,
  OrderServiceType,
  SourceFlow,
  SettlementFlow
} from "@jurnapod/offline-db/dexie";

export type RuntimeSyncBadgeState = "Offline" | "Pending" | "Synced";

export interface RuntimeOutletScope {
  company_id: number;
  outlet_id: number;
}

export interface RuntimeOfflineSnapshot {
  pending_outbox_count: number;
  has_product_cache: boolean;
}

export interface RuntimeCheckoutConfig {
  tax: {
    rate: number;
    inclusive: boolean;
  };
  payment_methods: string[];
}

export interface RuntimeProductCatalogItem {
  item_id: number;
  sku: string | null;
  name: string;
  item_type: ProductCacheRow["item_type"];
  item_group_id?: number | null;
  item_group_name?: string | null;
  price_snapshot: number;
}

export type RuntimeTableStatus = OutletTableRow["status"];

export interface RuntimeOutletTable {
  table_id: number;
  company_id: number;
  outlet_id: number;
  code: string;
  name: string;
  zone: string | null;
  capacity: number | null;
  status: RuntimeTableStatus;
  updated_at: string;
}

export type RuntimeReservationStatus = ReservationRow["status"];

export interface RuntimeReservation {
  reservation_id: number;
  company_id: number;
  outlet_id: number;
  table_id: number | null;
  customer_name: string;
  customer_phone: string | null;
  guest_count: number;
  reservation_at: string;
  duration_minutes: number | null;
  status: RuntimeReservationStatus;
  notes: string | null;
  linked_order_id: string | null;
  created_at: string;
  updated_at: string;
  arrived_at: string | null;
  seated_at: string | null;
  cancelled_at: string | null;
}

export interface RuntimeTableTransferResult {
  from: RuntimeOutletTable;
  to: RuntimeOutletTable;
}

export interface CompleteRuntimeOrderSessionInput {
  order_id: string | null;
  table_id: number | null;
  reservation_id: number | null;
}

export interface CompleteRuntimeOrderSessionResult {
  order: RuntimeActiveOrder | null;
  table: RuntimeOutletTable | null;
  reservation: RuntimeReservation | null;
}

export type RuntimeActiveOrderState = ActiveOrderRow["order_state"];

export interface RuntimeActiveOrder {
  order_id: string;
  company_id: number;
  outlet_id: number;
  service_type: OrderServiceType;
  source_flow: SourceFlow;
  settlement_flow: SettlementFlow;
  table_id: number | null;
  reservation_id: number | null;
  guest_count: number | null;
  is_finalized: boolean;
  order_status: OrderStatus;
  order_state: RuntimeActiveOrderState;
  paid_amount: number;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  updated_at: string;
}

export interface RuntimeActiveOrderLine {
  order_id: string;
  company_id: number;
  outlet_id: number;
  item_id: number;
  sku_snapshot: string | null;
  name_snapshot: string;
  item_type_snapshot: ProductCacheRow["item_type"];
  unit_price_snapshot: number;
  qty: number;
  discount_amount: number;
  updated_at: string;
}

export interface RuntimeActiveOrderSnapshot {
  order: RuntimeActiveOrder;
  lines: RuntimeActiveOrderLine[];
}

export interface RuntimeActiveOrderLineInput {
  item_id: number;
  sku_snapshot: string | null;
  name_snapshot: string;
  item_type_snapshot: ProductCacheRow["item_type"];
  unit_price_snapshot: number;
  qty: number;
  discount_amount: number;
}

export interface UpsertRuntimeActiveOrderInput {
  order_id?: string;
  service_type: OrderServiceType;
  source_flow?: SourceFlow;
  settlement_flow?: SettlementFlow;
  table_id: number | null;
  reservation_id: number | null;
  guest_count: number | null;
  is_finalized: boolean;
  order_status: OrderStatus;
  paid_amount: number;
  opened_at?: string;
  closed_at?: string | null;
  notes?: string | null;
  lines?: RuntimeActiveOrderLineInput[];
}

export interface ResolveRuntimeActiveOrderInput {
  service_type: OrderServiceType;
  source_flow?: SourceFlow;
  settlement_flow?: SettlementFlow;
  table_id?: number | null;
  reservation_id?: number | null;
  guest_count?: number | null;
  is_finalized?: boolean;
  notes?: string | null;
}

export interface ListRuntimeActiveOrdersOptions {
  finalizedOnly?: boolean;
}

export interface CancelRuntimeActiveOrderLineInput {
  order_id: string;
  item_id: number;
  cancel_qty: number;
  reason: string;
  actor_user_id?: number | null;
  device_id?: string;
}

export interface CreateRuntimeReservationInput {
  customer_name: string;
  customer_phone?: string | null;
  guest_count: number;
  reservation_at: string;
  duration_minutes?: number | null;
  table_id?: number | null;
  notes?: string | null;
}

export interface UpdateRuntimeReservationInput {
  customer_name?: string;
  customer_phone?: string | null;
  guest_count?: number;
  reservation_at?: string;
  duration_minutes?: number | null;
  table_id?: number | null;
  notes?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

const DEFAULT_RUNTIME_PAYMENT_METHODS = ["CASH"];
const DEFAULT_RUNTIME_TAX = {
  rate: 0,
  inclusive: false
};

const RESERVATION_FINAL_STATUSES: RuntimeReservationStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW"];

function mapReservationRow(row: ReservationRow): RuntimeReservation {
  return {
    reservation_id: row.reservation_id,
    company_id: row.company_id,
    outlet_id: row.outlet_id,
    table_id: row.table_id,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    guest_count: row.guest_count,
    reservation_at: row.reservation_at,
    duration_minutes: row.duration_minutes,
    status: row.status,
    notes: row.notes,
    linked_order_id: row.linked_order_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    arrived_at: row.arrived_at,
    seated_at: row.seated_at,
    cancelled_at: row.cancelled_at
  };
}

function isReservationFinalStatus(status: RuntimeReservationStatus): boolean {
  return RESERVATION_FINAL_STATUSES.includes(status);
}

function canTransitionReservationStatus(
  fromStatus: RuntimeReservationStatus,
  toStatus: RuntimeReservationStatus
): boolean {
  if (fromStatus === toStatus) {
    return true;
  }

  const transitions: Record<RuntimeReservationStatus, RuntimeReservationStatus[]> = {
    BOOKED: ["CONFIRMED", "ARRIVED", "CANCELLED", "NO_SHOW"],
    CONFIRMED: ["ARRIVED", "CANCELLED", "NO_SHOW"],
    ARRIVED: ["SEATED", "CANCELLED", "NO_SHOW"],
    SEATED: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: [],
    NO_SHOW: []
  };

  return transitions[fromStatus].includes(toStatus);
}

function mapActiveOrderRow(row: ActiveOrderRow): RuntimeActiveOrder {
  const sourceFlow: SourceFlow = row.source_flow ?? "WALK_IN";
  const settlementFlow: SettlementFlow = row.settlement_flow
    ?? (row.service_type === "DINE_IN" ? "DEFERRED" : "IMMEDIATE");

  return {
    order_id: row.order_id,
    company_id: row.company_id,
    outlet_id: row.outlet_id,
    service_type: row.service_type,
    source_flow: sourceFlow,
    settlement_flow: settlementFlow,
    table_id: row.table_id,
    reservation_id: row.reservation_id,
    guest_count: row.guest_count,
    is_finalized: row.is_finalized ?? false,
    order_status: row.order_status,
    order_state: row.order_state,
    paid_amount: row.paid_amount,
    opened_at: row.opened_at,
    closed_at: row.closed_at,
    notes: row.notes,
    updated_at: row.updated_at
  };
}

function mapActiveOrderLineRow(row: ActiveOrderLineRow): RuntimeActiveOrderLine {
  return {
    order_id: row.order_id,
    company_id: row.company_id,
    outlet_id: row.outlet_id,
    item_id: row.item_id,
    sku_snapshot: row.sku_snapshot,
    name_snapshot: row.name_snapshot,
    item_type_snapshot: row.item_type_snapshot,
    unit_price_snapshot: row.unit_price_snapshot,
    qty: row.qty,
    discount_amount: row.discount_amount,
    updated_at: row.updated_at
  };
}

export class RuntimeService {
  constructor(
    private storage: PosStoragePort,
    private network: NetworkPort
  ) {}

  private isScopeRow(
    scope: RuntimeOutletScope,
    row: { company_id: number; outlet_id: number }
  ): boolean {
    return row.company_id === scope.company_id && row.outlet_id === scope.outlet_id;
  }

  private buildActiveOrderPk(orderId: string): string {
    return orderId;
  }

  private buildActiveOrderLinePk(orderId: string, itemId: number): string {
    return `${orderId}:${itemId}`;
  }

  private buildActiveOrderUpdatePk(updateId: string): string {
    return `active_order_update:${updateId}`;
  }

  private async enqueueOrderUpdateOutboxJob(input: {
    scope: RuntimeOutletScope;
    orderId: string;
    updateId: string;
    cancellationId?: string;
    timestamp: string;
  }): Promise<void> {
    await this.storage.createOutboxJob({
      job_id: crypto.randomUUID(),
      sale_id: input.orderId,
      company_id: input.scope.company_id,
      outlet_id: input.scope.outlet_id,
      job_type: "SYNC_POS_ORDER_UPDATE",
      dedupe_key: input.updateId,
      payload_json: JSON.stringify({
        update_id: input.updateId,
        cancellation_id: input.cancellationId ?? null,
        order_id: input.orderId,
        company_id: input.scope.company_id,
        outlet_id: input.scope.outlet_id
      }),
      status: "PENDING",
      attempts: 0,
      lease_owner_id: null,
      lease_token: null,
      lease_expires_at: null,
      next_attempt_at: null,
      last_error: null,
      created_at: input.timestamp,
      updated_at: input.timestamp
    });
  }

  private createActiveOrderUpdateEvent(input: {
    scope: RuntimeOutletScope;
    orderId: string;
    existingOrder: ActiveOrderRow | undefined;
    nextOrder: ActiveOrderRow;
    existingLines: ActiveOrderLineRow[];
    nextLines: ActiveOrderLineRow[];
    timestamp: string;
  }): ActiveOrderUpdateRow | null {
    const existingOrder = input.existingOrder;
    const existingLineMap = new Map(input.existingLines.map((line) => [line.item_id, line]));
    const nextLineMap = new Map(input.nextLines.map((line) => [line.item_id, line]));

    let eventType: OrderUpdateEventType = "SNAPSHOT_FINALIZED";

    if (!existingOrder) {
      eventType = "SNAPSHOT_FINALIZED";
    } else if (existingOrder.order_state === "CLOSED" && input.nextOrder.order_state === "OPEN") {
      eventType = "ORDER_RESUMED";
    } else if (existingOrder.order_state === "OPEN" && input.nextOrder.order_state === "CLOSED") {
      eventType = "ORDER_CLOSED";
    } else if ((existingOrder.notes ?? null) !== (input.nextOrder.notes ?? null)) {
      eventType = "NOTES_CHANGED";
    } else {
      const added = input.nextLines.find((line) => !existingLineMap.has(line.item_id));
      if (added) {
        eventType = "ITEM_ADDED";
      } else {
        const removed = input.existingLines.find((line) => !nextLineMap.has(line.item_id));
        if (removed) {
          eventType = "ITEM_REMOVED";
        } else {
          const qtyChanged = input.nextLines.find((line) => {
            const before = existingLineMap.get(line.item_id);
            return before && before.qty !== line.qty;
          });
          if (qtyChanged) {
            eventType = "QTY_CHANGED";
          }
        }
      }
    }

    const hasChange =
      !existingOrder
      || JSON.stringify({
        order: existingOrder,
        lines: input.existingLines
      }) !==
        JSON.stringify({
          order: input.nextOrder,
          lines: input.nextLines
        });

    if (!hasChange) {
      return null;
    }

    const updateId = crypto.randomUUID();
    return {
      pk: this.buildActiveOrderUpdatePk(updateId),
      update_id: updateId,
      order_id: input.orderId,
      company_id: input.scope.company_id,
      outlet_id: input.scope.outlet_id,
      base_order_updated_at: existingOrder?.updated_at ?? null,
      event_type: eventType,
      delta_json: JSON.stringify({
        previous_updated_at: existingOrder?.updated_at ?? null,
        next_updated_at: input.nextOrder.updated_at,
        line_count: input.nextLines.length
      }),
      actor_user_id: null,
      device_id: "WEB_POS",
      event_at: input.timestamp,
      created_at: input.timestamp,
      sync_status: "PENDING",
      sync_error: null
    };
  }

  private normalizePaymentMethods(
    paymentMethods: readonly string[]
  ): string[] {
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const rawMethod of paymentMethods) {
      const method = rawMethod.trim();
      if (!method || seen.has(method)) {
        continue;
      }

      seen.add(method);
      normalized.push(method);
    }

    if (normalized.length === 0) {
      return [...DEFAULT_RUNTIME_PAYMENT_METHODS];
    }

    return normalized;
  }

  resolveCheckoutConfig(
    config: RuntimeCheckoutConfig | null
  ): RuntimeCheckoutConfig {
    if (!config) {
      return {
        tax: { ...DEFAULT_RUNTIME_TAX },
        payment_methods: [...DEFAULT_RUNTIME_PAYMENT_METHODS]
      };
    }

    const taxRate =
      Number.isFinite(config.tax.rate) && config.tax.rate >= 0
        ? config.tax.rate
        : 0;

    return {
      tax: {
        rate: taxRate,
        inclusive: config.tax.inclusive
      },
      payment_methods: this.normalizePaymentMethods(config.payment_methods)
    };
  }

  isPaymentMethodAllowed(
    method: string,
    paymentMethods: readonly string[]
  ): boolean {
    return this.normalizePaymentMethods(paymentMethods).includes(method);
  }

  resolvePaymentMethod(
    method: string,
    paymentMethods: readonly string[]
  ): string {
    const normalizedMethods = this.normalizePaymentMethods(paymentMethods);
    if (normalizedMethods.includes(method)) {
      return method;
    }

    return normalizedMethods[0];
  }

  async getGlobalDueOutboxCount(): Promise<number> {
    const now = new Date();
    return await this.storage.countGlobalDueOutboxJobs(now);
  }

  isOnline(): boolean {
    return this.network.isOnline();
  }

  async verifyConnectivity(options?: {
    baseUrl?: string;
    healthcheckPath?: string;
    timeoutMs?: number;
  }): Promise<boolean> {
    return await this.network.verifyConnectivity(options);
  }

  onNetworkStatusChange(callback: (online: boolean) => void): () => void {
    return this.network.onStatusChange(callback);
  }

  resolveSyncBadgeState(
    isOnline: boolean,
    pendingOutboxCount: number
  ): RuntimeSyncBadgeState {
    if (!isOnline) {
      return "Offline";
    }

    if (pendingOutboxCount > 0) {
      return "Pending";
    }

    return "Synced";
  }

  async getOfflineSnapshot(
    scope: RuntimeOutletScope
  ): Promise<RuntimeOfflineSnapshot> {
    // Count pending/failed outbox jobs for this scope (unsynced = PENDING + FAILED)
    const pending_outbox_count = await this.storage.countUnsyncedOutboxJobsForScope({
      company_id: scope.company_id,
      outlet_id: scope.outlet_id
    });

    // Check if product cache exists for this scope
    const products = await this.storage.getProductsByOutlet({
      company_id: scope.company_id,
      outlet_id: scope.outlet_id
    });

    return {
      pending_outbox_count,
      has_product_cache: products.length > 0
    };
  }

  async clearLocalMasterCache(scope: RuntimeOutletScope): Promise<void> {
    await this.storage.clearScopeCache({
      company_id: scope.company_id,
      outlet_id: scope.outlet_id
    });
  }

  async getProductCatalog(
    scope: RuntimeOutletScope
  ): Promise<RuntimeProductCatalogItem[]> {
    const rows = await this.storage.getProductsByOutlet({
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      is_active: true
    });

    rows.sort((left, right) => left.name.localeCompare(right.name));

    return rows.map((row) => ({
      item_id: row.item_id,
      sku: row.sku,
      name: row.name,
      item_type: row.item_type,
      item_group_id: row.item_group_id ?? null,
      item_group_name: row.item_group_name ?? null,
      price_snapshot: row.price_snapshot
    }));
  }

  async getOutletTables(scope: RuntimeOutletScope): Promise<RuntimeOutletTable[]> {
    const existingRows = await this.storage.getOutletTablesByOutlet({
      company_id: scope.company_id,
      outlet_id: scope.outlet_id
    });

    return existingRows.map((table) => ({
      table_id: table.table_id,
      company_id: table.company_id,
      outlet_id: table.outlet_id,
      code: table.code,
      name: table.name,
      zone: table.zone,
      capacity: table.capacity,
      status: table.status,
      updated_at: table.updated_at
    }));
  }

  async setOutletTableStatus(
    scope: RuntimeOutletScope,
    tableId: number,
    status: RuntimeTableStatus
  ): Promise<RuntimeOutletTable | null> {
    const rows = await this.storage.getOutletTablesByOutlet({
      company_id: scope.company_id,
      outlet_id: scope.outlet_id
    });

    const target = rows.find((row) => row.table_id === tableId);
    if (!target) {
      return null;
    }

    const updated: OutletTableRow = {
      ...target,
      status,
      updated_at: nowIso()
    };

    await this.storage.upsertOutletTables([updated]);

    return {
      table_id: updated.table_id,
      company_id: updated.company_id,
      outlet_id: updated.outlet_id,
      code: updated.code,
      name: updated.name,
      zone: updated.zone,
      capacity: updated.capacity,
      status: updated.status,
      updated_at: updated.updated_at
    };
  }

  async transferActiveTable(
    scope: RuntimeOutletScope,
    fromTableId: number,
    toTableId: number
  ): Promise<RuntimeTableTransferResult | null> {
    if (fromTableId === toTableId) {
      throw new Error("Target table must be different from current table");
    }

    const [tableRows, reservationRows] = await Promise.all([
      this.storage.getOutletTablesByOutlet({
        company_id: scope.company_id,
        outlet_id: scope.outlet_id
      }),
      this.storage.getReservationsByOutlet({
        company_id: scope.company_id,
        outlet_id: scope.outlet_id
      })
    ]);

    const fromTable = tableRows.find((row) => row.table_id === fromTableId);
    const toTable = tableRows.find((row) => row.table_id === toTableId);

    if (!fromTable || !toTable) {
      return null;
    }

    if (fromTable.status !== "OCCUPIED") {
      throw new Error("Current table is not occupied");
    }

    if (toTable.status !== "AVAILABLE") {
      throw new Error("Target table is not available");
    }

    const targetReserved = reservationRows.some(
      (reservation) =>
        reservation.table_id === toTableId
        && !isReservationFinalStatus(reservation.status)
    );

    if (targetReserved) {
      throw new Error("Target table has active reservation");
    }

    const updatedAt = nowIso();
    const fromUpdated: OutletTableRow = {
      ...fromTable,
      status: "AVAILABLE",
      updated_at: updatedAt
    };
    const toUpdated: OutletTableRow = {
      ...toTable,
      status: "OCCUPIED",
      updated_at: updatedAt
    };

    await this.storage.upsertOutletTables([fromUpdated, toUpdated]);

    return {
      from: {
        table_id: fromUpdated.table_id,
        company_id: fromUpdated.company_id,
        outlet_id: fromUpdated.outlet_id,
        code: fromUpdated.code,
        name: fromUpdated.name,
        zone: fromUpdated.zone,
        capacity: fromUpdated.capacity,
        status: fromUpdated.status,
        updated_at: fromUpdated.updated_at
      },
      to: {
        table_id: toUpdated.table_id,
        company_id: toUpdated.company_id,
        outlet_id: toUpdated.outlet_id,
        code: toUpdated.code,
        name: toUpdated.name,
        zone: toUpdated.zone,
        capacity: toUpdated.capacity,
        status: toUpdated.status,
        updated_at: toUpdated.updated_at
      }
    };
  }

  async listActiveOrders(
    scope: RuntimeOutletScope,
    orderState: RuntimeActiveOrderState = "OPEN",
    options: ListRuntimeActiveOrdersOptions = {}
  ): Promise<RuntimeActiveOrder[]> {
    const rows = await this.storage.getActiveOrdersByOutlet(scope);
    return rows
      .filter((row) => {
        if (!this.isScopeRow(scope, row) || row.order_state !== orderState) {
          return false;
        }
        if (options.finalizedOnly && !row.is_finalized) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .map(mapActiveOrderRow);
  }

  async getActiveOrderSnapshot(
    scope: RuntimeOutletScope,
    orderId: string
  ): Promise<RuntimeActiveOrderSnapshot | null> {
    const row = await this.storage.getActiveOrder(orderId);
    if (!row || !this.isScopeRow(scope, row)) {
      return null;
    }

    const lines = await this.storage.getActiveOrderLines(orderId);

    return {
      order: mapActiveOrderRow(row),
      lines: lines
        .filter((line) => this.isScopeRow(scope, line))
        .sort((left, right) => left.item_id - right.item_id)
        .map(mapActiveOrderLineRow)
    };
  }

  async resolveActiveOrder(
    scope: RuntimeOutletScope,
    input: ResolveRuntimeActiveOrderInput
  ): Promise<RuntimeActiveOrderSnapshot> {
    if (input.service_type === "DINE_IN" && !input.table_id && !input.reservation_id) {
      throw new Error("Dine-in order requires table_id or reservation_id");
    }

    const sourceFlow: SourceFlow = input.source_flow ?? "WALK_IN";
    const settlementFlow: SettlementFlow = input.settlement_flow
      ?? (input.service_type === "DINE_IN" ? "DEFERRED" : "IMMEDIATE");

    const rows = await this.storage.getActiveOrdersByOutlet(scope);
    const openOrders = rows.filter(
      (row) => this.isScopeRow(scope, row) && row.order_state === "OPEN"
    );

    if (input.service_type === "TAKEAWAY") {
      const takeaway = openOrders.find(
        (row) => row.service_type === "TAKEAWAY" && row.table_id === null && row.reservation_id === null
      );
      if (takeaway) {
        const lines = await this.storage.getActiveOrderLines(takeaway.order_id);
        return {
          order: mapActiveOrderRow(takeaway),
          lines: lines.filter((line) => this.isScopeRow(scope, line)).map(mapActiveOrderLineRow)
        };
      }
    }

    if (input.table_id) {
      const byTable = openOrders.find((row) => row.table_id === input.table_id);
      if (byTable) {
        const lines = await this.storage.getActiveOrderLines(byTable.order_id);
        return {
          order: mapActiveOrderRow(byTable),
          lines: lines.filter((line) => this.isScopeRow(scope, line)).map(mapActiveOrderLineRow)
        };
      }
    }

    if (input.reservation_id) {
      const byReservation = openOrders.find((row) => row.reservation_id === input.reservation_id);
      if (byReservation) {
        const lines = await this.storage.getActiveOrderLines(byReservation.order_id);
        return {
          order: mapActiveOrderRow(byReservation),
          lines: lines.filter((line) => this.isScopeRow(scope, line)).map(mapActiveOrderLineRow)
        };
      }
    }

    const timestamp = nowIso();
    const orderId = crypto.randomUUID();
    const created: ActiveOrderRow = {
      pk: this.buildActiveOrderPk(orderId),
      order_id: orderId,
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      service_type: input.service_type,
      source_flow: sourceFlow,
      settlement_flow: settlementFlow,
      table_id: input.table_id ?? null,
      reservation_id: input.reservation_id ?? null,
      guest_count: input.guest_count ?? null,
      is_finalized: input.is_finalized ?? false,
      order_status: "OPEN",
      order_state: "OPEN",
      paid_amount: 0,
      opened_at: timestamp,
      closed_at: null,
      notes: input.notes ?? null,
      updated_at: timestamp
    };

    await this.storage.upsertActiveOrders([created]);
    return {
      order: mapActiveOrderRow(created),
      lines: []
    };
  }

  async upsertActiveOrderSnapshot(
    scope: RuntimeOutletScope,
    input: UpsertRuntimeActiveOrderInput
  ): Promise<RuntimeActiveOrderSnapshot> {
    if (input.service_type === "DINE_IN" && !input.table_id && !input.reservation_id) {
      throw new Error("Dine-in order requires table_id or reservation_id");
    }

    if (!Number.isFinite(input.paid_amount) || input.paid_amount < 0) {
      throw new Error("paid_amount must be a non-negative number");
    }

    const orderId = input.order_id ?? crypto.randomUUID();
    const timestamp = nowIso();
    const existing = await this.storage.getActiveOrder(orderId);
    const sourceFlow: SourceFlow = input.source_flow ?? existing?.source_flow ?? "WALK_IN";
    const settlementFlow: SettlementFlow = input.settlement_flow
      ?? existing?.settlement_flow
      ?? (input.service_type === "DINE_IN" ? "DEFERRED" : "IMMEDIATE");
    const existingLines = existing ? await this.storage.getActiveOrderLines(orderId) : [];

    if (existing && !this.isScopeRow(scope, existing)) {
      throw new Error("Active order does not belong to the current outlet scope");
    }

    const rows = await this.storage.getActiveOrdersByOutlet(scope);
    const openRows = rows.filter(
      (row) => this.isScopeRow(scope, row) && row.order_state === "OPEN" && row.order_id !== orderId
    );

    if (input.table_id && openRows.some((row) => row.table_id === input.table_id)) {
      throw new Error("Table already has an active order");
    }

    if (input.reservation_id && openRows.some((row) => row.reservation_id === input.reservation_id)) {
      throw new Error("Reservation already has an active order");
    }

    const baseOpenedAt = existing?.opened_at ?? input.opened_at ?? timestamp;
    const orderState: RuntimeActiveOrderState =
      input.order_status === "COMPLETED" || input.order_status === "CANCELLED" ? "CLOSED" : "OPEN";
    const closedAt = orderState === "CLOSED" ? input.closed_at ?? timestamp : null;

    const row: ActiveOrderRow = {
      pk: this.buildActiveOrderPk(orderId),
      order_id: orderId,
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      service_type: input.service_type,
      source_flow: sourceFlow,
      settlement_flow: settlementFlow,
      table_id: input.table_id,
      reservation_id: input.reservation_id,
      guest_count: input.guest_count,
      is_finalized: input.is_finalized,
      order_status: input.order_status,
      order_state: orderState,
      paid_amount: input.paid_amount,
      opened_at: baseOpenedAt,
      closed_at: closedAt,
      notes: input.notes ?? null,
      updated_at: timestamp
    };

    const lineInputs = input.lines ?? [];
    const lineRows: ActiveOrderLineRow[] = lineInputs
      .filter((line) => line.qty > 0)
      .map((line) => ({
        pk: this.buildActiveOrderLinePk(orderId, line.item_id),
        order_id: orderId,
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        item_id: line.item_id,
        sku_snapshot: line.sku_snapshot,
        name_snapshot: line.name_snapshot,
        item_type_snapshot: line.item_type_snapshot,
        unit_price_snapshot: line.unit_price_snapshot,
        qty: line.qty,
        discount_amount: line.discount_amount,
        updated_at: timestamp
      }));

    const updateEvent = this.createActiveOrderUpdateEvent({
      scope,
      orderId,
      existingOrder: existing,
      nextOrder: row,
      existingLines,
      nextLines: lineRows,
      timestamp
    });

    await this.storage.upsertActiveOrders([row]);
    await this.storage.replaceActiveOrderLines(orderId, lineRows);

    if (updateEvent) {
      await this.storage.putActiveOrderUpdate(updateEvent);
      await this.enqueueOrderUpdateOutboxJob({
        scope,
        orderId,
        updateId: updateEvent.update_id,
        timestamp
      });
    }

    return {
      order: mapActiveOrderRow(row),
      lines: lineRows.map(mapActiveOrderLineRow)
    };
  }

  async cancelFinalizedOrderLine(
    scope: RuntimeOutletScope,
    input: CancelRuntimeActiveOrderLineInput
  ): Promise<RuntimeActiveOrderSnapshot> {
    const reason = input.reason.trim();
    if (!reason) {
      throw new Error("Cancellation reason is required");
    }

    if (!Number.isInteger(input.cancel_qty) || input.cancel_qty <= 0) {
      throw new Error("cancel_qty must be a positive integer");
    }

    return await this.storage.transaction(
      "readwrite",
      ["active_orders", "active_order_lines", "active_order_updates", "item_cancellations", "outbox_jobs"],
      async () => {
        const existingOrder = await this.storage.getActiveOrder(input.order_id);
        if (!existingOrder || !this.isScopeRow(scope, existingOrder)) {
          throw new Error("Active order not found in current outlet scope");
        }

        if (existingOrder.order_state !== "OPEN") {
          throw new Error("Only open active orders can be updated");
        }

        if (!existingOrder.is_finalized) {
          throw new Error("Only finalized orders can cancel committed items");
        }

        const existingLines = await this.storage.getActiveOrderLines(input.order_id);
        const targetLine = existingLines.find((line) => line.item_id === input.item_id);
        if (!targetLine) {
          throw new Error("Order line not found");
        }

        if (targetLine.qty < input.cancel_qty) {
          throw new Error("cancel_qty exceeds committed quantity");
        }

        const timestamp = nowIso();
        const nextQty = targetLine.qty - input.cancel_qty;
        const nextDiscountAmount = nextQty === 0
          ? 0
          : Math.min(
            targetLine.unit_price_snapshot * nextQty,
            Math.round((targetLine.discount_amount * nextQty) / targetLine.qty)
          );

        const nextLines: ActiveOrderLineRow[] = existingLines
          .flatMap((line) => {
            if (line.item_id !== input.item_id) {
              return [line];
            }

            if (nextQty === 0) {
              return [];
            }

            return [{
              ...line,
              qty: nextQty,
              discount_amount: nextDiscountAmount,
              updated_at: timestamp
            }];
          });

        const nextOrder: ActiveOrderRow = {
          ...existingOrder,
          updated_at: timestamp
        };

        const updateId = crypto.randomUUID();
        const cancellationId = crypto.randomUUID();
        const updateEvent: ActiveOrderUpdateRow = {
          pk: this.buildActiveOrderUpdatePk(updateId),
          update_id: updateId,
          order_id: input.order_id,
          company_id: scope.company_id,
          outlet_id: scope.outlet_id,
          base_order_updated_at: existingOrder.updated_at,
          event_type: "ITEM_CANCELLED",
          delta_json: JSON.stringify({
            reason,
            item_id: input.item_id,
            item_name_snapshot: targetLine.name_snapshot,
            cancelled_qty: input.cancel_qty,
            previous_qty: targetLine.qty,
            next_qty: nextQty,
            previous_discount_amount: targetLine.discount_amount,
            next_discount_amount: nextDiscountAmount
          }),
          actor_user_id: input.actor_user_id ?? null,
          device_id: input.device_id ?? "WEB_POS",
          event_at: timestamp,
          created_at: timestamp,
          sync_status: "PENDING",
          sync_error: null
        };

        const cancellationRow: ItemCancellationRow = {
          pk: `item_cancellation:${cancellationId}`,
          cancellation_id: cancellationId,
          order_id: input.order_id,
          item_id: input.item_id,
          company_id: scope.company_id,
          outlet_id: scope.outlet_id,
          cancelled_quantity: input.cancel_qty,
          reason,
          cancelled_by_user_id: input.actor_user_id ?? null,
          cancelled_at: timestamp,
          sync_status: "PENDING",
          sync_error: null
        };

        await this.storage.upsertActiveOrders([nextOrder]);
        await this.storage.replaceActiveOrderLines(input.order_id, nextLines);
        await this.storage.putActiveOrderUpdate(updateEvent);
        await this.storage.putItemCancellation(cancellationRow);
        await this.enqueueOrderUpdateOutboxJob({
          scope,
          orderId: input.order_id,
          updateId,
          cancellationId,
          timestamp
        });

        return {
          order: mapActiveOrderRow(nextOrder),
          lines: nextLines.map(mapActiveOrderLineRow)
        };
      }
    );
  }

  async closeActiveOrder(
    scope: RuntimeOutletScope,
    orderId: string,
    status: Extract<OrderStatus, "COMPLETED" | "CANCELLED"> = "COMPLETED"
  ): Promise<RuntimeActiveOrder | null> {
    const existing = await this.storage.getActiveOrder(orderId);
    if (!existing || !this.isScopeRow(scope, existing)) {
      return null;
    }

    const timestamp = nowIso();
    const closed: ActiveOrderRow = {
      ...existing,
      order_status: status,
      order_state: "CLOSED",
      closed_at: timestamp,
      updated_at: timestamp
    };

    await this.storage.upsertActiveOrders([closed]);
    return mapActiveOrderRow(closed);
  }

  async transferActiveOrderTable(
    scope: RuntimeOutletScope,
    orderId: string,
    toTableId: number
  ): Promise<RuntimeActiveOrder | null> {
    return await this.storage.transaction(
      "readwrite",
      ["outlet_tables", "reservations", "active_orders"],
      async () => {
        const [existingOrder, tableRows, reservationRows, allOrders] = await Promise.all([
          this.storage.getActiveOrder(orderId),
          this.storage.getOutletTablesByOutlet(scope),
          this.storage.getReservationsByOutlet(scope),
          this.storage.getActiveOrdersByOutlet(scope)
        ]);

        if (!existingOrder || !this.isScopeRow(scope, existingOrder)) {
          return null;
        }

        if (existingOrder.order_state !== "OPEN") {
          throw new Error("Only open active orders can be transferred");
        }

        if (existingOrder.service_type !== "DINE_IN") {
          throw new Error("Only dine-in orders can be transferred");
        }

        if (!existingOrder.table_id) {
          throw new Error("Order is not assigned to a source table");
        }

        if (existingOrder.table_id === toTableId) {
          return mapActiveOrderRow(existingOrder);
        }

        const fromTable = tableRows.find((row) => row.table_id === existingOrder.table_id);
        const toTable = tableRows.find((row) => row.table_id === toTableId);
        if (!fromTable || !toTable) {
          return null;
        }

        if (toTable.status !== "AVAILABLE") {
          throw new Error("Target table is not available");
        }

        const targetReserved = reservationRows.some(
          (reservation) =>
            reservation.table_id === toTableId
            && !isReservationFinalStatus(reservation.status)
            && reservation.reservation_id !== existingOrder.reservation_id
        );

        if (targetReserved) {
          throw new Error("Target table has active reservation");
        }

        const conflictingOrder = allOrders.some(
          (row) =>
            this.isScopeRow(scope, row)
            && row.order_state === "OPEN"
            && row.order_id !== existingOrder.order_id
            && row.table_id === toTableId
        );
        if (conflictingOrder) {
          throw new Error("Target table already has another active order");
        }

        const updatedAt = nowIso();
        const fromUpdated: OutletTableRow = {
          ...fromTable,
          status: "AVAILABLE",
          updated_at: updatedAt
        };
        const toUpdated: OutletTableRow = {
          ...toTable,
          status: "OCCUPIED",
          updated_at: updatedAt
        };
        const orderUpdated: ActiveOrderRow = {
          ...existingOrder,
          table_id: toTableId,
          updated_at: updatedAt
        };

        const linkedReservation = existingOrder.reservation_id
          ? reservationRows.find((row) => row.reservation_id === existingOrder.reservation_id)
          : null;
        const reservationUpdated: ReservationRow | null =
          linkedReservation && !isReservationFinalStatus(linkedReservation.status)
            ? {
              ...linkedReservation,
              table_id: toTableId,
              updated_at: updatedAt
            }
            : null;

        await this.storage.upsertOutletTables([fromUpdated, toUpdated]);
        await this.storage.upsertActiveOrders([orderUpdated]);
        if (reservationUpdated) {
          await this.storage.upsertReservations([reservationUpdated]);
        }

        return mapActiveOrderRow(orderUpdated);
      }
    );
  }

  async completeOrderSession(
    scope: RuntimeOutletScope,
    input: CompleteRuntimeOrderSessionInput
  ): Promise<CompleteRuntimeOrderSessionResult> {
    return await this.storage.transaction(
      "readwrite",
      ["outlet_tables", "reservations", "active_orders"],
      async () => {
        const timestamp = nowIso();
        let updatedTable: RuntimeOutletTable | null = null;
        let updatedReservation: RuntimeReservation | null = null;
        let updatedOrder: RuntimeActiveOrder | null = null;

        if (input.table_id) {
          const tableRows = await this.storage.getOutletTablesByOutlet(scope);
          const table = tableRows.find((row) => row.table_id === input.table_id);
          if (table) {
            const nextTable: OutletTableRow = {
              ...table,
              status: "AVAILABLE",
              updated_at: timestamp
            };
            await this.storage.upsertOutletTables([nextTable]);
            updatedTable = {
              table_id: nextTable.table_id,
              company_id: nextTable.company_id,
              outlet_id: nextTable.outlet_id,
              code: nextTable.code,
              name: nextTable.name,
              zone: nextTable.zone,
              capacity: nextTable.capacity,
              status: nextTable.status,
              updated_at: nextTable.updated_at
            };
          }
        }

        if (input.reservation_id) {
          const reservationRows = await this.storage.getReservationsByOutlet(scope);
          const reservation = reservationRows.find((row) => row.reservation_id === input.reservation_id);
          if (reservation && !isReservationFinalStatus(reservation.status)) {
            const canComplete = canTransitionReservationStatus(reservation.status, "COMPLETED");
            const nextReservation: ReservationRow = canComplete
              ? {
                ...reservation,
                status: "COMPLETED",
                updated_at: timestamp
              }
              : reservation;
            if (canComplete) {
              await this.storage.upsertReservations([nextReservation]);
            }
            updatedReservation = mapReservationRow(nextReservation);
          }
        }

        if (input.order_id) {
          const existingOrder = await this.storage.getActiveOrder(input.order_id);
          if (existingOrder && this.isScopeRow(scope, existingOrder)) {
            const nextOrder: ActiveOrderRow = {
              ...existingOrder,
              order_status: "COMPLETED",
              order_state: "CLOSED",
              closed_at: timestamp,
              updated_at: timestamp
            };
            await this.storage.upsertActiveOrders([nextOrder]);
            updatedOrder = mapActiveOrderRow(nextOrder);
          }
        }

        return {
          order: updatedOrder,
          table: updatedTable,
          reservation: updatedReservation
        };
      }
    );
  }

  async getOutletReservations(scope: RuntimeOutletScope): Promise<RuntimeReservation[]> {
    const existingRows = await this.storage.getReservationsByOutlet({
      company_id: scope.company_id,
      outlet_id: scope.outlet_id
    });

    return existingRows.map(mapReservationRow);
  }

  async createOutletReservation(
    scope: RuntimeOutletScope,
    input: CreateRuntimeReservationInput
  ): Promise<RuntimeReservation> {
    const now = nowIso();
    const reservationRows = await this.storage.getReservationsByOutlet(scope);
    const nextReservationId = reservationRows.reduce((max, row) => Math.max(max, row.reservation_id), 0) + 1;

    const customerName = input.customer_name.trim();
    if (!customerName) {
      throw new Error("Reservation customer_name is required");
    }

    if (!Number.isInteger(input.guest_count) || input.guest_count <= 0) {
      throw new Error("Reservation guest_count must be a positive integer");
    }

    const reservationAtMs = Date.parse(input.reservation_at);
    if (!Number.isFinite(reservationAtMs)) {
      throw new Error("Reservation reservation_at must be a valid datetime");
    }

    const row: ReservationRow = {
      pk: `${scope.company_id}:${scope.outlet_id}:${nextReservationId}`,
      reservation_id: nextReservationId,
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      table_id: input.table_id ?? null,
      customer_name: customerName,
      customer_phone: input.customer_phone?.trim() || null,
      guest_count: input.guest_count,
      reservation_at: new Date(reservationAtMs).toISOString(),
      duration_minutes: input.duration_minutes ?? null,
      status: "BOOKED",
      notes: input.notes?.trim() || null,
      linked_order_id: null,
      created_at: now,
      updated_at: now,
      arrived_at: null,
      seated_at: null,
      cancelled_at: null
    };

    if (row.table_id) {
      const tableRows = await this.storage.getOutletTablesByOutlet(scope);
      const targetTable = tableRows.find((table) => table.table_id === row.table_id);
      if (!targetTable || targetTable.status === "OCCUPIED" || targetTable.status === "UNAVAILABLE" || targetTable.status === "RESERVED") {
        throw new Error("Selected table is not assignable");
      }
    }

    await this.storage.upsertReservations([row]);

    if (row.table_id) {
      await this.setOutletTableStatus(scope, row.table_id, "RESERVED");
    }

    return mapReservationRow(row);
  }

  async assignReservationTable(
    scope: RuntimeOutletScope,
    reservationId: number,
    tableId: number | null
  ): Promise<RuntimeReservation | null> {
    const [reservationRows, tableRows] = await Promise.all([
      this.storage.getReservationsByOutlet(scope),
      this.storage.getOutletTablesByOutlet(scope)
    ]);

    const target = reservationRows.find((row) => row.reservation_id === reservationId);
    if (!target || isReservationFinalStatus(target.status)) {
      return null;
    }

    if (tableId) {
      const table = tableRows.find((row) => row.table_id === tableId);
      const reservedByAnotherReservation = reservationRows.some(
        (reservation) =>
          reservation.reservation_id !== reservationId
          && reservation.table_id === tableId
          && !isReservationFinalStatus(reservation.status)
      );
      if (
        !table
        || table.status === "OCCUPIED"
        || table.status === "UNAVAILABLE"
        || reservedByAnotherReservation
      ) {
        throw new Error("Selected table is not assignable");
      }
    }

    if (target.table_id && target.table_id !== tableId) {
      await this.setOutletTableStatus(scope, target.table_id, "AVAILABLE");
    }

    if (tableId) {
      await this.setOutletTableStatus(scope, tableId, "RESERVED");
    }

    const updated: ReservationRow = {
      ...target,
      table_id: tableId,
      updated_at: nowIso()
    };

    await this.storage.upsertReservations([updated]);
    return mapReservationRow(updated);
  }

  async updateReservationStatus(
    scope: RuntimeOutletScope,
    reservationId: number,
    status: RuntimeReservationStatus
  ): Promise<RuntimeReservation | null> {
    const rows = await this.storage.getReservationsByOutlet(scope);
    const target = rows.find((row) => row.reservation_id === reservationId);
    if (!target) {
      return null;
    }

    if (!canTransitionReservationStatus(target.status, status)) {
      throw new Error(`Invalid reservation transition: ${target.status} -> ${status}`);
    }

    if (status === "SEATED" && !target.table_id) {
      throw new Error("Seated reservation requires table assignment");
    }

    const timestamp = nowIso();
    const updated: ReservationRow = {
      ...target,
      status,
      updated_at: timestamp,
      arrived_at: status === "ARRIVED" ? timestamp : target.arrived_at,
      seated_at: status === "SEATED" ? timestamp : target.seated_at,
      cancelled_at: status === "CANCELLED" || status === "NO_SHOW" ? timestamp : target.cancelled_at
    };

    if (updated.table_id) {
      if (status === "SEATED") {
        await this.setOutletTableStatus(scope, updated.table_id, "OCCUPIED");
      }
      if (status === "CANCELLED" || status === "NO_SHOW" || status === "COMPLETED") {
        await this.setOutletTableStatus(scope, updated.table_id, "AVAILABLE");
      }
    }

    await this.storage.upsertReservations([updated]);
    return mapReservationRow(updated);
  }
}
