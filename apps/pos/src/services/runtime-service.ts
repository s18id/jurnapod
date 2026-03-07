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
import type { OutletTableRow, ProductCacheRow, ReservationRow } from "@jurnapod/offline-db/dexie";

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

const DEFAULT_OUTLET_TABLES: Array<Omit<RuntimeOutletTable, "company_id" | "outlet_id">> = [
  {
    table_id: 1,
    code: "A1",
    name: "Table A1",
    zone: "Main Hall",
    capacity: 2,
    status: "AVAILABLE",
    updated_at: "2026-03-07T00:00:00.000Z"
  },
  {
    table_id: 2,
    code: "A2",
    name: "Table A2",
    zone: "Main Hall",
    capacity: 4,
    status: "RESERVED",
    updated_at: "2026-03-07T00:00:00.000Z"
  },
  {
    table_id: 3,
    code: "B1",
    name: "Table B1",
    zone: "Window",
    capacity: 2,
    status: "OCCUPIED",
    updated_at: "2026-03-07T00:00:00.000Z"
  },
  {
    table_id: 4,
    code: "T1",
    name: "Table T1",
    zone: "Terrace",
    capacity: 4,
    status: "UNAVAILABLE",
    updated_at: "2026-03-07T00:00:00.000Z"
  }
];

const DEFAULT_OUTLET_RESERVATIONS: Array<Omit<RuntimeReservation, "company_id" | "outlet_id">> = [
  {
    reservation_id: 1,
    table_id: 2,
    customer_name: "Ardi Pranata",
    customer_phone: "+628111000001",
    guest_count: 4,
    reservation_at: "2026-03-07T12:00:00.000Z",
    duration_minutes: 90,
    status: "BOOKED",
    notes: "Birthday setup",
    linked_order_id: null,
    created_at: "2026-03-07T08:00:00.000Z",
    updated_at: "2026-03-07T08:00:00.000Z",
    arrived_at: null,
    seated_at: null,
    cancelled_at: null
  },
  {
    reservation_id: 2,
    table_id: null,
    customer_name: "Sari Dewi",
    customer_phone: "+628111000002",
    guest_count: 2,
    reservation_at: "2026-03-07T13:30:00.000Z",
    duration_minutes: 60,
    status: "CONFIRMED",
    notes: null,
    linked_order_id: null,
    created_at: "2026-03-07T08:15:00.000Z",
    updated_at: "2026-03-07T08:15:00.000Z",
    arrived_at: null,
    seated_at: null,
    cancelled_at: null
  }
];

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

export class RuntimeService {
  constructor(
    private storage: PosStoragePort,
    private network: NetworkPort
  ) {}

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

    if (existingRows.length > 0) {
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

    const seededRows: OutletTableRow[] = DEFAULT_OUTLET_TABLES.map((table) => ({
      pk: `${scope.company_id}:${scope.outlet_id}:${table.table_id}`,
      table_id: table.table_id,
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      code: table.code,
      name: table.name,
      zone: table.zone,
      capacity: table.capacity,
      status: table.status,
      updated_at: table.updated_at
    }));

    await this.storage.upsertOutletTables(seededRows);

    return seededRows.map((table) => ({
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

  async getOutletReservations(scope: RuntimeOutletScope): Promise<RuntimeReservation[]> {
    const existingRows = await this.storage.getReservationsByOutlet({
      company_id: scope.company_id,
      outlet_id: scope.outlet_id
    });

    if (existingRows.length > 0) {
      return existingRows.map(mapReservationRow);
    }

    const seededRows: ReservationRow[] = DEFAULT_OUTLET_RESERVATIONS.map((reservation) => ({
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
      created_at: reservation.created_at,
      updated_at: reservation.updated_at,
      arrived_at: reservation.arrived_at,
      seated_at: reservation.seated_at,
      cancelled_at: reservation.cancelled_at
    }));

    await this.storage.upsertReservations(seededRows);

    return seededRows.map(mapReservationRow);
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
