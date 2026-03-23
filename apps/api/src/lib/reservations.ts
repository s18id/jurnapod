// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { randomBytes } from "node:crypto";
import { getDbPool } from "./db";
import {
  OutletTableStatusId,
  ReservationStatusV2,
  TableOccupancyStatus,
  SETTINGS_REGISTRY,
  parseSettingValue,
  type ReservationStatusV2Type,
  type ReservationCreateRequest,
  type ReservationUpdateRequest,
  type ReservationListQuery,
  type ReservationRow,
  type ReservationStatus
} from "@jurnapod/shared";
import { getSetting } from "./settings";
import {
  holdTableWithConnection,
  seatTableWithConnection,
  TableOccupancyConflictError,
  TableNotAvailableError
} from "./table-occupancy";

// ============================================================================
// ERROR CLASSES
// ============================================================================

export class ReservationNotFoundError extends Error {
  constructor(reservationId?: number | bigint | string) {
    super(reservationId !== undefined ? `Reservation ${reservationId} not found` : "Reservation not found");
  }
}

export class ReservationValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class ReservationConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(fromStatus: number | string, toStatus: number | string) {
    super(`Invalid status transition: ${fromStatus} -> ${toStatus}`);
  }
}

export class DuplicateReservationCodeError extends Error {
  constructor(code: string) {
    super(`Reservation code ${code} already exists`);
  }
}

// ============================================================================
// STORY 12.4 - NEW TYPES
// ============================================================================

export interface Reservation {
  id: bigint;
  companyId: bigint;
  outletId: bigint;
  tableId: bigint | null;
  tableCode: string | null;
  tableName: string | null;
  reservationCode: string;
  statusId: number;
  partySize: number;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  reservationTime: Date;
  durationMinutes: number;
  notes: string | null;
  cancellationReason: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReservationInput {
  companyId: bigint;
  outletId: bigint;
  partySize: number;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  reservationTime: Date;
  durationMinutes: number;
  tableId?: bigint;
  notes?: string;
  createdBy: string;
}

export interface ListReservationsParams {
  companyId: bigint;
  outletId: bigint;
  limit: number;
  offset: number;
  statusId?: number;
  tableId?: bigint;
  customerName?: string;
  fromDate?: Date;
  toDate?: Date;
  useOverlapFilter?: boolean; // Enables interval overlap for calendar views
}

export interface UpdateStatusInput {
  statusId: number;
  tableId?: bigint;
  cancellationReason?: string;
  notes?: string;
  updatedBy: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_TRANSITIONS: Record<number, number[]> = {
  [ReservationStatusV2.PENDING]: [ReservationStatusV2.CONFIRMED, ReservationStatusV2.CANCELLED],
  [ReservationStatusV2.CONFIRMED]: [ReservationStatusV2.CHECKED_IN, ReservationStatusV2.NO_SHOW, ReservationStatusV2.CANCELLED],
  [ReservationStatusV2.CHECKED_IN]: [ReservationStatusV2.COMPLETED],
  [ReservationStatusV2.NO_SHOW]: [],
  [ReservationStatusV2.CANCELLED]: [],
  [ReservationStatusV2.COMPLETED]: []
};

const MAX_CODE_GENERATION_RETRIES = 3;
const RESERVATION_DEFAULT_DURATION_KEY = "feature.reservation.default_duration_minutes" as const;
const RESERVATION_DEFAULT_DURATION_FALLBACK = Number(
  SETTINGS_REGISTRY[RESERVATION_DEFAULT_DURATION_KEY].defaultValue
);

// Legacy status transition map (for backward compatibility)
const finalStatuses: ReservationStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW"];

function isFinalStatus(status: ReservationStatus): boolean {
  return finalStatuses.includes(status);
}

// ============================================================================
// LEGACY DATABASE MAPPING HELPERS (Backward Compatibility)
// ============================================================================

interface ReservationDbRow extends RowDataPacket {
  id: number;
  company_id: number;
  outlet_id: number;
  table_id: number | null;
  table_code: string | null;
  table_name: string | null;
  reservation_code: string | null;
  status_id: number | null;
  status: string | null;
  party_size: number | null;
  guest_count: number;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  reservation_time: string | null;
  reservation_at: string;
  reservation_start_ts: number | string | null;
  reservation_end_ts: number | string | null;
  duration_minutes: number | null;
  notes: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  arrived_at: string | null;
  seated_at: string | null;
  cancelled_at: string | null;
  linked_order_id: string | null;
}

interface LegacyOverlapRow extends RowDataPacket {
  reservation_start_ts: number | string | null;
  reservation_end_ts: number | string | null;
  reservation_at: string | null;
  duration_minutes: number | null;
}

interface OccupancySnapshotRow extends RowDataPacket {
  status_id: number;
  version: number;
  reservation_id: number | string | null;
}

type OutletTableStatus = "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";

type OutletTableRow = RowDataPacket & {
  id: number;
  status: OutletTableStatus;
};

function toIso(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toDbDateTime(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ReservationValidationError("Invalid reservation datetime value");
  }

  return parsed.toISOString().slice(0, 19).replace("T", " ");
}

function toUnixMs(value: Date | string): number {
  const parsed = value instanceof Date ? value : new Date(value);
  const ts = parsed.getTime();
  if (Number.isNaN(ts)) {
    throw new ReservationValidationError("Invalid reservation datetime value");
  }
  return ts;
}

function fromUnixMs(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function resolveEffectiveDurationMinutes(
  companyId: number,
  durationMinutes: number | null | undefined
): Promise<number> {
  if (durationMinutes !== null && durationMinutes !== undefined) {
    return durationMinutes;
  }

  const setting = await getSetting({
    companyId,
    key: RESERVATION_DEFAULT_DURATION_KEY,
    outletId: null
  });

  if (setting?.value !== null && setting?.value !== undefined) {
    try {
      const parsed = parseSettingValue(RESERVATION_DEFAULT_DURATION_KEY, setting.value);
      if (typeof parsed === "number" && Number.isFinite(parsed)) {
        return parsed;
      }
    } catch {
      // Fallback to shared registry default.
    }
  }

  return RESERVATION_DEFAULT_DURATION_FALLBACK;
}

async function getTableOccupancySnapshotWithConnection(
  connection: PoolConnection,
  companyId: bigint,
  outletId: bigint,
  tableId: bigint
): Promise<{ statusId: number; version: number; reservationId: bigint | null } | null> {
  const [rows] = await connection.execute<OccupancySnapshotRow[]>(
    `SELECT status_id, version, reservation_id
     FROM table_occupancy
     WHERE company_id = ?
       AND outlet_id = ?
       AND table_id = ?
     FOR UPDATE`,
    [companyId, outletId, tableId]
  );

  if (rows.length === 0) {
    return null;
  }

  const reservationIdRaw = rows[0].reservation_id;
  return {
    statusId: Number(rows[0].status_id),
    version: Number(rows[0].version),
    reservationId: reservationIdRaw == null ? null : BigInt(String(reservationIdRaw))
  };
}

function mapRow(row: ReservationDbRow): ReservationRow {
  const reservationStartTs = fromUnixMs(row.reservation_start_ts);
  const reservationAt = reservationStartTs !== null ? toIso(new Date(reservationStartTs)) : toIso(row.reservation_at);
  const createdAt = toIso(row.created_at);
  const updatedAt = toIso(row.updated_at);
  if (!reservationAt || !createdAt || !updatedAt) {
    throw new ReservationValidationError("Invalid reservation datetime value");
  }

  // Determine status: prefer status column, map from status_id if needed
  let status: ReservationStatus = row.status as ReservationStatus ?? "BOOKED";
  if (!status && row.status_id) {
    const statusIdMap: Record<number, ReservationStatus> = {
      1: "BOOKED",
      2: "CONFIRMED",
      3: "ARRIVED",
      4: "SEATED",
      5: "CANCELLED",
      6: "COMPLETED",
      7: "NO_SHOW"
    };
    status = statusIdMap[row.status_id] ?? "BOOKED";
  }

  return {
    reservation_id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    table_id: row.table_id ? Number(row.table_id) : null,
    customer_name: String(row.customer_name),
    customer_phone: row.customer_phone,
    guest_count: Number(row.guest_count),
    reservation_at: reservationAt,
    duration_minutes: row.duration_minutes != null ? Number(row.duration_minutes) : null,
    status: status,
    notes: row.notes,
    linked_order_id: row.linked_order_id,
    created_at: createdAt,
    updated_at: updatedAt,
    arrived_at: toIso(row.arrived_at),
    seated_at: toIso(row.seated_at),
    cancelled_at: toIso(row.cancelled_at)
  };
}

function mapDbRowToReservation(row: ReservationDbRow): Reservation {
  // Determine status_id: prefer status_id column, fall back to mapping from status string
  let statusId: number;
  if (row.status_id !== null && row.status_id !== undefined) {
    statusId = row.status_id;
  } else if (row.status) {
    // Map legacy status strings to V2 status IDs
    const statusMap: Record<string, number> = {
      'BOOKED': ReservationStatusV2.PENDING,
      'CONFIRMED': ReservationStatusV2.CONFIRMED,
      'ARRIVED': ReservationStatusV2.CHECKED_IN,
      'SEATED': ReservationStatusV2.CHECKED_IN,
      'COMPLETED': ReservationStatusV2.COMPLETED,
      'CANCELLED': ReservationStatusV2.CANCELLED,
      'NO_SHOW': ReservationStatusV2.NO_SHOW
    };
    statusId = statusMap[row.status.toUpperCase()] ?? ReservationStatusV2.PENDING;
  } else {
    statusId = ReservationStatusV2.PENDING;
  }

  const reservationStartTs = fromUnixMs(row.reservation_start_ts);
  const reservationTimeStr =
    reservationStartTs !== null
      ? new Date(reservationStartTs).toISOString()
      : (row.reservation_time ?? row.reservation_at);
  
  return {
    id: BigInt(row.id),
    companyId: BigInt(row.company_id),
    outletId: BigInt(row.outlet_id),
    tableId: row.table_id !== null ? BigInt(row.table_id) : null,
    tableCode: row.table_code ?? null,
    tableName: row.table_name ?? null,
    reservationCode: row.reservation_code ?? `RES-${row.id}`,
    statusId,
    partySize: row.party_size ?? row.guest_count ?? 1,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    reservationTime: new Date(reservationTimeStr),
    durationMinutes: row.duration_minutes ?? 90,
    notes: row.notes,
    cancellationReason: row.cancellation_reason,
    createdBy: row.created_by ?? 'system',
    updatedBy: row.updated_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function canTransition(fromStatus: ReservationStatus, toStatus: ReservationStatus): boolean {
  if (fromStatus === toStatus) {
    return true;
  }

  const transitions: Record<ReservationStatus, ReservationStatus[]> = {
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

// ============================================================================
// LEGACY HELPER FUNCTIONS (Backward Compatibility)
// ============================================================================

async function readReservationForUpdate(
  connection: PoolConnection,
  companyId: number,
  reservationId: number
): Promise<ReservationDbRow> {
  const [rows] = await connection.execute<ReservationDbRow[]>(
    `SELECT id, company_id, outlet_id, table_id, customer_name, customer_phone, guest_count,
            reservation_at, reservation_start_ts, reservation_end_ts,
            duration_minutes, status, notes, linked_order_id,
            created_at, updated_at, arrived_at, seated_at, cancelled_at, status_id
     FROM reservations
     WHERE company_id = ? AND id = ?
     LIMIT 1
     FOR UPDATE`,
    [companyId, reservationId]
  );

  if (rows.length === 0) {
    throw new ReservationNotFoundError(reservationId);
  }

  return rows[0];
}

async function readTableForUpdate(
  connection: PoolConnection,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<OutletTableRow> {
  const [rows] = await connection.execute<OutletTableRow[]>(
    `SELECT id, status
     FROM outlet_tables
     WHERE company_id = ? AND outlet_id = ? AND id = ?
     LIMIT 1
     FOR UPDATE`,
    [companyId, outletId, tableId]
  );

  if (rows.length === 0) {
    throw new ReservationValidationError(`Table ${tableId} not found in outlet`);
  }

  return rows[0];
}

async function setTableStatus(
  connection: PoolConnection,
  companyId: number,
  outletId: number,
  tableId: number,
  status: OutletTableStatus
): Promise<void> {
  const statusId =
    status === "UNAVAILABLE"
      ? OutletTableStatusId.UNAVAILABLE
      : status === "OCCUPIED"
        ? OutletTableStatusId.OCCUPIED
        : status === "RESERVED"
          ? OutletTableStatusId.RESERVED
          : OutletTableStatusId.AVAILABLE;

  await connection.execute(
    `UPDATE outlet_tables
     SET status = ?, status_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE company_id = ? AND outlet_id = ? AND id = ?`,
    [status, statusId, companyId, outletId, tableId]
  );
}

async function hasOpenDineInOrderOnTable(
  connection: PoolConnection,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<boolean> {
  const [rows] = await connection.execute<Array<RowDataPacket & { count_open: number }>>(
    `SELECT COUNT(*) AS count_open
     FROM pos_order_snapshots
     WHERE company_id = ?
       AND outlet_id = ?
       AND table_id = ?
       AND order_state = 'OPEN'
       AND service_type = 'DINE_IN'`,
    [companyId, outletId, tableId]
  );

  return Number(rows[0]?.count_open ?? 0) > 0;
}

async function recomputeTableStatus(
  connection: PoolConnection,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<void> {
  const table = await readTableForUpdate(connection, companyId, outletId, tableId);
  if (table.status === "UNAVAILABLE") {
    return;
  }

  const hasOpenDineIn = await hasOpenDineInOrderOnTable(connection, companyId, outletId, tableId);
  if (hasOpenDineIn) {
    await setTableStatus(connection, companyId, outletId, tableId, "OCCUPIED");
    return;
  }

  const [rows] = await connection.execute<
    Array<
      RowDataPacket & {
        count_seated: number;
        count_pre_seated: number;
      }
    >
  >(
    `SELECT
       SUM(CASE WHEN status = 'SEATED' THEN 1 ELSE 0 END) AS count_seated,
       SUM(CASE WHEN status IN ('BOOKED', 'CONFIRMED', 'ARRIVED') THEN 1 ELSE 0 END) AS count_pre_seated
     FROM reservations
     WHERE company_id = ?
       AND outlet_id = ?
       AND table_id = ?`,
    [companyId, outletId, tableId]
  );

  const seatedCount = Number(rows[0]?.count_seated ?? 0);
  const preSeatedCount = Number(rows[0]?.count_pre_seated ?? 0);

  if (seatedCount > 0) {
    await setTableStatus(connection, companyId, outletId, tableId, "OCCUPIED");
    return;
  }

  if (preSeatedCount > 0) {
    await setTableStatus(connection, companyId, outletId, tableId, "RESERVED");
    return;
  }

  await setTableStatus(connection, companyId, outletId, tableId, "AVAILABLE");
}

async function hasActiveReservationOnTable(
  connection: PoolConnection,
  companyId: number,
  outletId: number,
  tableId: number,
  exceptReservationId?: number
): Promise<boolean> {
  const [rows] = await connection.execute<Array<RowDataPacket & { count_active: number }>>(
    `SELECT COUNT(*) AS count_active
     FROM reservations
     WHERE company_id = ?
       AND outlet_id = ?
       AND table_id = ?
       AND status NOT IN ('COMPLETED', 'CANCELLED', 'NO_SHOW')
       AND (? IS NULL OR id <> ?)`,
    [companyId, outletId, tableId, exceptReservationId ?? null, exceptReservationId ?? null]
  );

  return Number(rows[0]?.count_active ?? 0) > 0;
}

// ============================================================================
// LEGACY EXPORTS (Backward Compatibility)
// ============================================================================

/**
 * List reservations (legacy interface)
 * 
 * Date filtering modes:
 * - Calendar mode (overlap_filter=true): Returns reservations that overlap with the date range.
 * - Report mode (overlap_filter=false, default): Returns reservations that START within the date range.
 * 
 * @param companyId - Company ID
 * @param query - Query parameters including optional overlap_filter flag
 * @returns List of reservation rows
 */
export async function listReservations(
  companyId: number,
  query: ReservationListQuery
): Promise<ReservationRow[]> {
  const pool = getDbPool();
  const where: string[] = ["company_id = ?", "outlet_id = ?"];
  const params: Array<number | string> = [companyId, query.outlet_id];

  if (query.status) {
    where.push("status = ?");
    params.push(query.status);
  }
  
  // Date filtering: calendar mode uses interval overlap, report mode uses point-in-time
  if (query.from && query.to) {
    if (query.overlap_filter) {
      // Calendar mode: show reservations that touch any part of the date range
      // Interval overlap: reservation_start < filter_end AND reservation_end > filter_start
      where.push(
        "((reservation_start_ts IS NOT NULL AND reservation_end_ts IS NOT NULL " +
        "  AND reservation_start_ts < ? AND reservation_end_ts > ?) " +
        "OR (reservation_start_ts IS NULL AND reservation_at >= ? AND reservation_at <= ?))"
      );
      params.push(
        toUnixMs(query.to) + 1,      // start < filter_end (exclusive)
        toUnixMs(query.from),         // end > filter_start (exclusive)
        toDbDateTime(query.from),     // legacy fallback: point-in-time
        toDbDateTime(query.to)
      );
    } else {
      // Report mode: point-in-time filtering (reservation counted on start date only)
      where.push("((reservation_start_ts IS NOT NULL AND reservation_start_ts >= ? AND reservation_start_ts <= ?) OR (reservation_start_ts IS NULL AND reservation_at >= ? AND reservation_at <= ?))");
      params.push(toUnixMs(query.from), toUnixMs(query.to), toDbDateTime(query.from), toDbDateTime(query.to));
    }
  } else if (query.from) {
    if (query.overlap_filter) {
      where.push("((reservation_start_ts IS NOT NULL AND reservation_end_ts IS NOT NULL AND reservation_end_ts > ?) OR (reservation_start_ts IS NULL AND reservation_at >= ?))");
      params.push(toUnixMs(query.from), toDbDateTime(query.from));
    } else {
      where.push("((reservation_start_ts IS NOT NULL AND reservation_start_ts >= ?) OR (reservation_start_ts IS NULL AND reservation_at >= ?))");
      params.push(toUnixMs(query.from), toDbDateTime(query.from));
    }
  } else if (query.to) {
    if (query.overlap_filter) {
      where.push("((reservation_start_ts IS NOT NULL AND reservation_start_ts < ?) OR (reservation_start_ts IS NULL AND reservation_at <= ?))");
      params.push(toUnixMs(query.to) + 1, toDbDateTime(query.to));
    } else {
      where.push("((reservation_start_ts IS NOT NULL AND reservation_start_ts <= ?) OR (reservation_start_ts IS NULL AND reservation_at <= ?))");
      params.push(toUnixMs(query.to), toDbDateTime(query.to));
    }
  }

  params.push(query.limit, query.offset);
  const [rows] = await pool.execute<ReservationDbRow[]>(
    `SELECT id, company_id, outlet_id, table_id, customer_name, customer_phone, guest_count,
            reservation_at, reservation_start_ts, reservation_end_ts,
            duration_minutes, status, notes, linked_order_id,
            created_at, updated_at, arrived_at, seated_at, cancelled_at, status_id
     FROM reservations
     WHERE ${where.join(" AND ")}
     ORDER BY reservation_start_ts IS NULL ASC, reservation_start_ts ASC, reservation_at ASC, id ASC
     LIMIT ? OFFSET ?`,
    params
  );

  return rows.map(mapRow);
}

export async function readReservationOutletId(
  companyId: number,
  reservationId: number
): Promise<number | null> {
  const pool = getDbPool();
  const [rows] = await pool.execute<Array<RowDataPacket & { outlet_id: number }>>(
    `SELECT outlet_id
     FROM reservations
     WHERE company_id = ? AND id = ?
     LIMIT 1`,
    [companyId, reservationId]
  );

  if (rows.length === 0) {
    return null;
  }

  return Number(rows[0].outlet_id);
}

export async function createReservation(
  companyId: number,
  input: ReservationCreateRequest
): Promise<ReservationRow> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (input.table_id) {
      const table = await readTableForUpdate(connection, companyId, input.outlet_id, input.table_id);
      const tableAlreadyReserved = await hasActiveReservationOnTable(
        connection,
        companyId,
        input.outlet_id,
        input.table_id
      );
      if (table.status === "OCCUPIED" || table.status === "UNAVAILABLE" || tableAlreadyReserved || table.status === "RESERVED") {
        throw new ReservationValidationError("Selected table is not available for reservation");
      }
      await setTableStatus(connection, companyId, input.outlet_id, input.table_id, "RESERVED");
    }

    const reservationAtDb = toDbDateTime(input.reservation_at);
    const reservationStartTs = toUnixMs(input.reservation_at);
    const effectiveDurationMinutes = await resolveEffectiveDurationMinutes(companyId, input.duration_minutes);
    const reservationEndTs = reservationStartTs + effectiveDurationMinutes * 60000;

    // Generate a reservation code for the new reservation
    const reservationCode = await generateReservationCodeWithConnection(
      connection,
      BigInt(input.outlet_id)
    );

    // Check which columns exist to build the appropriate INSERT
    const hasReservationCodeCol = await columnExists(connection, 'reservations', 'reservation_code');
    const hasStatusIdCol = await columnExists(connection, 'reservations', 'status_id');
    const hasCreatedByCol = await columnExists(connection, 'reservations', 'created_by');
    const hasReservationStartTsCol = await columnExists(connection, 'reservations', 'reservation_start_ts');
    const hasReservationEndTsCol = await columnExists(connection, 'reservations', 'reservation_end_ts');
    const hasCanonicalTsCols = hasReservationStartTsCol && hasReservationEndTsCol;
    
    let insertSql: string;
    let insertValues: (string | number | null)[];
    
    if (hasReservationCodeCol && hasStatusIdCol && hasCreatedByCol && hasCanonicalTsCols) {
      // All new columns exist
      insertSql = `INSERT INTO reservations (
         company_id, outlet_id, table_id, customer_name, customer_phone,
         guest_count, reservation_at, reservation_start_ts, reservation_end_ts,
         duration_minutes, status, notes,
         reservation_code, status_id, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', ?, ?, ?)`;
      insertValues = [
        companyId,
        input.outlet_id,
        input.table_id ?? null,
        input.customer_name,
        input.customer_phone ?? null,
        input.guest_count,
        reservationAtDb,
        reservationStartTs,
        reservationEndTs,
        input.duration_minutes ?? null,
        input.notes ?? null,
        reservationCode,
        ReservationStatusV2.PENDING,
        'system'
      ];
    } else if (hasReservationCodeCol && hasStatusIdCol && hasCreatedByCol) {
      insertSql = `INSERT INTO reservations (
         company_id, outlet_id, table_id, customer_name, customer_phone,
         guest_count, reservation_at, duration_minutes, status, notes,
         reservation_code, status_id, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', ?, ?, ?, ?)`;
      insertValues = [
        companyId,
        input.outlet_id,
        input.table_id ?? null,
        input.customer_name,
        input.customer_phone ?? null,
        input.guest_count,
        reservationAtDb,
        input.duration_minutes ?? null,
        input.notes ?? null,
        reservationCode,
        ReservationStatusV2.PENDING,
        'system'
      ];
    } else if (hasCanonicalTsCols) {
      insertSql = `INSERT INTO reservations (
         company_id, outlet_id, table_id, customer_name, customer_phone,
         guest_count, reservation_at, reservation_start_ts, reservation_end_ts,
         duration_minutes, status, status_id, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', 1, ?)`;
      insertValues = [
        companyId,
        input.outlet_id,
        input.table_id ?? null,
        input.customer_name,
        input.customer_phone ?? null,
        input.guest_count,
        reservationAtDb,
        reservationStartTs,
        reservationEndTs,
        input.duration_minutes ?? null,
        input.notes ?? null
      ];
    } else {
      // Use legacy columns only
      insertSql = `INSERT INTO reservations (
         company_id, outlet_id, table_id, customer_name, customer_phone,
         guest_count, reservation_at, duration_minutes, status, status_id, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', 1, ?)`;
      insertValues = [
        companyId,
        input.outlet_id,
        input.table_id ?? null,
        input.customer_name,
        input.customer_phone ?? null,
        input.guest_count,
        reservationAtDb,
        input.duration_minutes ?? null,
        input.notes ?? null
      ];
    }
    
    const [insertResult] = await connection.execute<ResultSetHeader>(insertSql, insertValues);

    const reservationId = Number(insertResult.insertId);
    const row = await readReservationForUpdate(connection, companyId, reservationId);
    await connection.commit();
    return mapRow(row);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateReservation(
  companyId: number,
  reservationId: number,
  patch: ReservationUpdateRequest
): Promise<ReservationRow> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const current = await readReservationForUpdate(connection, companyId, reservationId);
    const nextReservationAt = patch.reservation_at === undefined ? current.reservation_at : patch.reservation_at;
    const nextDurationMinutes = patch.duration_minutes === undefined ? current.duration_minutes : patch.duration_minutes;
    const nextReservationAtDb = toDbDateTime(nextReservationAt);
    const reservationStartTs = toUnixMs(nextReservationAt);
    const effectiveDurationMinutes = await resolveEffectiveDurationMinutes(companyId, nextDurationMinutes);
    const reservationEndTs = reservationStartTs + effectiveDurationMinutes * 60000;

    const nextStatus = patch.status ?? current.status;
    if (!canTransition(current.status as ReservationStatus, nextStatus as ReservationStatus)) {
      throw new ReservationValidationError(`Invalid reservation transition: ${current.status} -> ${nextStatus}`);
    }

    if (isFinalStatus(current.status as ReservationStatus) && current.status !== nextStatus) {
      throw new ReservationValidationError("Finalized reservation cannot be modified");
    }

    if (
      isFinalStatus(current.status as ReservationStatus) &&
      (patch.table_id !== undefined ||
        patch.customer_name !== undefined ||
        patch.customer_phone !== undefined ||
        patch.guest_count !== undefined ||
        patch.reservation_at !== undefined ||
        patch.duration_minutes !== undefined ||
        patch.notes !== undefined)
    ) {
      throw new ReservationValidationError("Finalized reservation cannot be modified");
    }

    const nextTableId = patch.table_id === undefined ? current.table_id : patch.table_id;

    if (nextStatus === "SEATED" && !nextTableId) {
      throw new ReservationValidationError("Seated reservation requires table assignment");
    }

    if (nextTableId && current.table_id !== nextTableId) {
      const table = await readTableForUpdate(connection, companyId, current.outlet_id, nextTableId);
      const tableAlreadyReserved = await hasActiveReservationOnTable(
        connection,
        companyId,
        current.outlet_id,
        nextTableId,
        reservationId
      );
      if (table.status === "OCCUPIED" || table.status === "UNAVAILABLE" || tableAlreadyReserved) {
        throw new ReservationValidationError("Selected table is not assignable");
      }
    }

    const hasReservationStartTsCol = await columnExists(connection, 'reservations', 'reservation_start_ts');
    const hasReservationEndTsCol = await columnExists(connection, 'reservations', 'reservation_end_ts');

    const updateAssignments = [
      'table_id = ?',
      'customer_name = ?',
      'customer_phone = ?',
      'guest_count = ?',
      'reservation_at = ?',
      'duration_minutes = ?',
      'status = ?',
      'notes = ?',
      "arrived_at = CASE WHEN ? = 'ARRIVED' THEN CURRENT_TIMESTAMP ELSE arrived_at END",
      "seated_at = CASE WHEN ? = 'SEATED' THEN CURRENT_TIMESTAMP ELSE seated_at END",
      "cancelled_at = CASE WHEN ? IN ('CANCELLED', 'NO_SHOW') THEN CURRENT_TIMESTAMP ELSE cancelled_at END",
      'updated_at = CURRENT_TIMESTAMP'
    ];

    const updateValues: Array<string | number | null> = [
      nextTableId,
      patch.customer_name ?? current.customer_name,
      patch.customer_phone === undefined ? current.customer_phone : patch.customer_phone,
      patch.guest_count ?? current.guest_count,
      nextReservationAtDb,
      nextDurationMinutes,
      nextStatus,
      patch.notes === undefined ? current.notes : patch.notes,
      nextStatus,
      nextStatus,
      nextStatus
    ];

    if (hasReservationStartTsCol && hasReservationEndTsCol) {
      updateAssignments.splice(6, 0, 'reservation_start_ts = ?', 'reservation_end_ts = ?');
      updateValues.splice(6, 0, reservationStartTs, reservationEndTs);
    }

    updateValues.push(companyId, reservationId);

    await connection.execute(
      `UPDATE reservations
       SET ${updateAssignments.join(',\n           ')}
       WHERE company_id = ? AND id = ?`,
      updateValues
    );

    const impactedTableIds = new Set<number>();
    if (current.table_id != null) {
      impactedTableIds.add(current.table_id);
    }
    if (nextTableId != null) {
      impactedTableIds.add(nextTableId);
    }

    for (const tableId of impactedTableIds) {
      await recomputeTableStatus(connection, companyId, current.outlet_id, tableId);
    }

    const updated = await readReservationForUpdate(connection, companyId, reservationId);
    await connection.commit();
    return mapRow(updated);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ============================================================================
// STORY 12.4 - NEW FUNCTIONS
// ============================================================================

/**
 * Generate a unique reservation code for an outlet
 * Format: RES-{random alphanumeric 6 chars}
 * Retries up to 3 times if collision occurs
 */
export async function generateReservationCode(outletId: bigint): Promise<string> {
  const pool = getDbPool();
  
  // Check if reservation_code column exists
  let hasReservationCodeColumn = false;
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'reservations' 
         AND COLUMN_NAME = 'reservation_code'
       LIMIT 1`
    );
    hasReservationCodeColumn = rows.length > 0;
  } catch {
    hasReservationCodeColumn = false;
  }
  
  for (let attempt = 0; attempt < MAX_CODE_GENERATION_RETRIES; attempt++) {
    // Generate code: RES- + 6 random alphanumeric characters
    const randomPart = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
    const code = `RES-${randomPart}`;
    
    // Check uniqueness against database only if column exists
    if (hasReservationCodeColumn) {
      try {
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT 1 FROM reservations 
           WHERE outlet_id = ? AND reservation_code = ?
           LIMIT 1`,
          [outletId, code]
        );
        
        if (rows.length === 0) {
          return code;
        }
        // Collision detected, retry
      } catch (error) {
        // If query fails (column doesn't exist), just return the code
        return code;
      }
    } else {
      // Column doesn't exist, return code without checking
      return code;
    }
  }
  
  // If all retries failed, use timestamp-based code as fallback
  const timestamp = Date.now().toString(36).toUpperCase();
  return `RES-${timestamp.slice(-6)}`;
}

/**
 * Check if a reservation overlaps with existing reservations for the same table
 * Overlap exists if: existing_start < new_end AND existing_end > new_start
 */
async function checkReservationOverlap(
  connection: PoolConnection,
  companyId: bigint,
  outletId: bigint,
  tableId: bigint | null,
  reservationTime: Date,
  durationMinutes: number,
  excludeReservationId?: bigint
): Promise<boolean> {
  if (!tableId) {
    return false;
  }

  const newStartTs = toUnixMs(reservationTime);
  const newEndTs = newStartTs + durationMinutes * 60000;

  const canonicalSql = `
    SELECT COUNT(*) as count
    FROM reservations
    WHERE company_id = ?
      AND outlet_id = ?
      AND table_id = ?
      AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
      AND reservation_start_ts IS NOT NULL
      AND reservation_end_ts IS NOT NULL
      AND reservation_start_ts < ?
      AND reservation_end_ts > ?
      ${excludeReservationId ? 'AND id != ?' : ''}
  `;

  const canonicalParams: (bigint | number)[] = [companyId, outletId, tableId, newEndTs, newStartTs];
  if (excludeReservationId) {
    canonicalParams.push(excludeReservationId);
  }

  const [canonicalRows] = await connection.execute<Array<RowDataPacket & { count: number }>>(canonicalSql, canonicalParams);
  if (Number(canonicalRows[0]?.count ?? 0) > 0) {
    return true;
  }

  const legacySql = `
    SELECT reservation_start_ts, reservation_end_ts, reservation_at, duration_minutes
    FROM reservations
    WHERE company_id = ?
      AND outlet_id = ?
      AND table_id = ?
      AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
      AND (reservation_start_ts IS NULL OR reservation_end_ts IS NULL)
      ${excludeReservationId ? 'AND id != ?' : ''}
  `;

  const legacyParams: (bigint | number)[] = [companyId, outletId, tableId];
  if (excludeReservationId) {
    legacyParams.push(excludeReservationId);
  }

  const [legacyRows] = await connection.execute<LegacyOverlapRow[]>(legacySql, legacyParams);
  if (legacyRows.length === 0) {
    return false;
  }

  const defaultDurationMinutes = await resolveEffectiveDurationMinutes(Number(companyId), null);
  for (const row of legacyRows) {
    const existingDuration = row.duration_minutes ?? defaultDurationMinutes;
    let existingStartTs = fromUnixMs(row.reservation_start_ts);
    let existingEndTs = fromUnixMs(row.reservation_end_ts);

    if (existingStartTs === null && row.reservation_at) {
      existingStartTs = toUnixMs(row.reservation_at);
    }
    if (existingEndTs === null && existingStartTs !== null) {
      existingEndTs = existingStartTs + existingDuration * 60000;
    }
    if (existingStartTs === null && existingEndTs !== null) {
      existingStartTs = existingEndTs - existingDuration * 60000;
    }
    if (existingStartTs === null || existingEndTs === null) {
      continue;
    }

    if (existingStartTs < newEndTs && existingEndTs > newStartTs) {
      return true;
    }
  }

  return false;
}

/**
 * Create a new reservation (Story 12.4 interface)
 * Inserts with PENDING status and generates reservation code
 */
export async function createReservationV2(
  input: CreateReservationInput
): Promise<Reservation> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Check for overlapping reservations if table is specified
    const durationMinutes = input.durationMinutes ?? 90;
    const tableId = input.tableId ?? null;

    if (tableId) {
      const overlapExists = await checkReservationOverlap(
        connection,
        input.companyId,
        input.outletId,
        tableId,
        input.reservationTime,
        durationMinutes
      );

      if (overlapExists) {
        throw new ReservationConflictError('Table is already reserved for this time slot');
      }
    }

    // Generate unique reservation code
    const reservationCode = await generateReservationCodeWithConnection(
      connection,
      input.outletId
    );

    // Prepare values with fallbacks for columns that may not exist yet
    const reservationAt = toDbDateTime(input.reservationTime);
    const reservationStartTs = toUnixMs(input.reservationTime);
    const effectiveDurationMinutes = await resolveEffectiveDurationMinutes(
      Number(input.companyId),
      input.durationMinutes
    );
    const reservationEndTs = reservationStartTs + effectiveDurationMinutes * 60000;

    // Insert reservation
    // Check which columns exist to build the appropriate INSERT
    const hasReservationCode = await columnExists(connection, 'reservations', 'reservation_code');
    const hasCustomerEmail = await columnExists(connection, 'reservations', 'customer_email');
    const hasCreatedBy = await columnExists(connection, 'reservations', 'created_by');
    const hasStatusId = await columnExists(connection, 'reservations', 'status_id');
    const hasReservationStartTs = await columnExists(connection, 'reservations', 'reservation_start_ts');
    const hasReservationEndTs = await columnExists(connection, 'reservations', 'reservation_end_ts');
    const hasCanonicalTsCols = hasReservationStartTs && hasReservationEndTs;
    
    let insertSql: string;
    let insertValues: (string | number | bigint | null)[];
    
    if (hasReservationCode && hasCustomerEmail && hasCreatedBy && hasStatusId && hasCanonicalTsCols) {
      // All new columns exist
      insertSql = `INSERT INTO reservations (
        company_id, outlet_id, table_id, 
        customer_name, customer_phone,
        guest_count, reservation_at, reservation_start_ts, reservation_end_ts,
        duration_minutes, 
        status, notes, reservation_code, customer_email,
        created_by, status_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', ?, ?, ?, ?)`;
      insertValues = [
        input.companyId,
        input.outletId,
        tableId,
        input.customerName,
        input.customerPhone ?? null,
        input.partySize,
        reservationAt,
        reservationStartTs,
        reservationEndTs,
        durationMinutes,
        input.notes ?? null,
        reservationCode,
        input.customerEmail ?? null,
        input.createdBy,
        ReservationStatusV2.PENDING
      ];
    } else if (hasReservationCode && hasCustomerEmail && hasCreatedBy && hasStatusId) {
      insertSql = `INSERT INTO reservations (
        company_id, outlet_id, table_id, 
        customer_name, customer_phone,
        guest_count, reservation_at, duration_minutes, 
        status, notes, reservation_code, customer_email,
        created_by, status_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', ?, ?, ?, ?, ?)`;
      insertValues = [
        input.companyId,
        input.outletId,
        tableId,
        input.customerName,
        input.customerPhone ?? null,
        input.partySize,
        reservationAt,
        durationMinutes,
        input.notes ?? null,
        reservationCode,
        input.customerEmail ?? null,
        input.createdBy,
        ReservationStatusV2.PENDING
      ];
    } else if (hasCanonicalTsCols) {
      insertSql = `INSERT INTO reservations (
        company_id, outlet_id, table_id, 
        customer_name, customer_phone,
        guest_count, reservation_at, reservation_start_ts, reservation_end_ts,
        duration_minutes, status, status_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', 1, ?)`;
      insertValues = [
        input.companyId,
        input.outletId,
        tableId,
        input.customerName,
        input.customerPhone ?? null,
        input.partySize,
        reservationAt,
        reservationStartTs,
        reservationEndTs,
        durationMinutes,
        input.notes ?? null
      ];
    } else {
      // Use legacy columns only
      insertSql = `INSERT INTO reservations (
        company_id, outlet_id, table_id, 
        customer_name, customer_phone,
        guest_count, reservation_at, duration_minutes, 
        status, status_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', 1, ?)`;
      insertValues = [
        input.companyId,
        input.outletId,
        tableId,
        input.customerName,
        input.customerPhone ?? null,
        input.partySize,
        reservationAt,
        durationMinutes,
        input.notes ?? null
      ];
    }
    
    const [insertResult] = await connection.execute<ResultSetHeader>(insertSql, insertValues);

    const reservationId = BigInt(insertResult.insertId);

    await connection.commit();

    // Fetch and return the created reservation
    const reservation = await getReservationV2WithConnection(
      connection,
      reservationId,
      input.companyId,
      input.outletId
    );

    if (!reservation) {
      throw new Error('Failed to retrieve created reservation');
    }

    return reservation;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Get a single reservation by ID with tenant isolation (Story 12.4 interface)
 */
export async function getReservation(
  id: bigint,
  companyId: bigint,
  outletId: bigint
): Promise<Reservation | null> {
  const pool = getDbPool();
  return getReservationV2WithConnection(pool as unknown as PoolConnection, id, companyId, outletId);
}

async function getReservationV2WithConnection(
  connection: PoolConnection | { execute: Function },
  id: bigint,
  companyId: bigint,
  outletId: bigint
): Promise<Reservation | null> {
  // Use a simpler query that works with existing columns
  const [rows] = await connection.execute<ReservationDbRow[]>(
    `SELECT 
      id, company_id, outlet_id, table_id,
      status_id, status,
      guest_count,
      customer_name, customer_phone,
      reservation_at, reservation_start_ts, reservation_end_ts,
      duration_minutes, notes,
      created_at, updated_at
    FROM reservations
    WHERE id = ? AND company_id = ? AND outlet_id = ?
    LIMIT 1`,
    [id, companyId, outletId]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapDbRowToReservation(rows[0]);
}

/**
 * List reservations with filtering and pagination (Story 12.4 interface)
 */
/**
 * List reservations with flexible filtering
 * 
 * Date filtering modes:
 * - Calendar mode (useOverlapFilter=true): Returns reservations that overlap with the date range.
 *   A reservation appears on ANY day it occupies, even partially.
 *   Example: NYE party (Dec 31 11PM - Jan 1 2AM) shows on BOTH Dec 31 AND Jan 1.
 * 
 * - Report mode (useOverlapFilter=false, default): Returns reservations that START within the date range.
 *   Each reservation is counted once, on its start date.
 *   Example: NYE party (Dec 31 11PM - Jan 1 2AM) shows ONLY on Dec 31.
 * 
 * @param params - Query parameters including optional useOverlapFilter flag
 * @returns Paginated list of reservations with total count
 */
export async function listReservationsV2(
  params: ListReservationsParams
): Promise<{ reservations: Reservation[]; total: number }> {
  const pool = getDbPool();
  
  const whereConditions: string[] = ['r.company_id = ?', 'r.outlet_id = ?'];
  const queryParams: (bigint | number | string | Date)[] = [params.companyId, params.outletId];

  // Add optional filters with fallback to legacy columns
  if (params.statusId !== undefined) {
    const legacyStatusMap: Record<number, string> = {
      [ReservationStatusV2.PENDING]: 'BOOKED',
      [ReservationStatusV2.CONFIRMED]: 'CONFIRMED',
      [ReservationStatusV2.CHECKED_IN]: 'ARRIVED',
      [ReservationStatusV2.NO_SHOW]: 'NO_SHOW',
      [ReservationStatusV2.CANCELLED]: 'CANCELLED',
      [ReservationStatusV2.COMPLETED]: 'COMPLETED'
    };
    const legacyStatus = legacyStatusMap[params.statusId];
    if (legacyStatus) {
      whereConditions.push('(r.status_id = ? OR r.status = ?)');
      queryParams.push(params.statusId, legacyStatus);
    } else {
      whereConditions.push('r.status_id = ?');
      queryParams.push(params.statusId);
    }
  }

  if (params.tableId !== undefined) {
    whereConditions.push('r.table_id = ?');
    queryParams.push(params.tableId);
  }

  if (params.customerName) {
    whereConditions.push('r.customer_name LIKE ?');
    queryParams.push(`%${params.customerName}%`);
  }

  // Date filtering: calendar mode uses interval overlap, report mode uses point-in-time
  if (params.fromDate && params.toDate) {
    if (params.useOverlapFilter) {
      // Calendar mode: show reservations that touch any part of the date range
      // Interval overlap: reservation_start < filter_end AND reservation_end > filter_start
      whereConditions.push(
        '((r.reservation_start_ts IS NOT NULL AND r.reservation_end_ts IS NOT NULL ' +
        '  AND r.reservation_start_ts < ? AND r.reservation_end_ts > ?) ' +
        'OR (r.reservation_start_ts IS NULL AND r.reservation_at >= ? AND r.reservation_at <= ?))'
      );
      queryParams.push(
        toUnixMs(params.toDate) + 1,      // start < filter_end (exclusive)
        toUnixMs(params.fromDate),         // end > filter_start (exclusive)
        toDbDateTime(params.fromDate),     // legacy fallback: point-in-time
        toDbDateTime(params.toDate)
      );
    } else {
      // Report mode: point-in-time filtering (reservation counted on start date only)
      whereConditions.push(
        '((r.reservation_start_ts IS NOT NULL AND r.reservation_start_ts >= ? AND r.reservation_start_ts <= ?) ' +
        'OR (r.reservation_start_ts IS NULL AND r.reservation_at >= ? AND r.reservation_at <= ?))'
      );
      queryParams.push(
        toUnixMs(params.fromDate),
        toUnixMs(params.toDate),
        toDbDateTime(params.fromDate),
        toDbDateTime(params.toDate)
      );
    }
  } else if (params.fromDate) {
    if (params.useOverlapFilter) {
      whereConditions.push(
        '((r.reservation_start_ts IS NOT NULL AND r.reservation_end_ts IS NOT NULL AND r.reservation_end_ts > ?) ' +
        'OR (r.reservation_start_ts IS NULL AND r.reservation_at >= ?))'
      );
      queryParams.push(toUnixMs(params.fromDate), toDbDateTime(params.fromDate));
    } else {
      whereConditions.push(
        '((r.reservation_start_ts IS NOT NULL AND r.reservation_start_ts >= ?) ' +
        'OR (r.reservation_start_ts IS NULL AND r.reservation_at >= ?))'
      );
      queryParams.push(toUnixMs(params.fromDate), toDbDateTime(params.fromDate));
    }
  } else if (params.toDate) {
    if (params.useOverlapFilter) {
      whereConditions.push(
        '((r.reservation_start_ts IS NOT NULL AND r.reservation_start_ts < ?) ' +
        'OR (r.reservation_start_ts IS NULL AND r.reservation_at <= ?))'
      );
      queryParams.push(toUnixMs(params.toDate) + 1, toDbDateTime(params.toDate));
    } else {
      whereConditions.push(
        '((r.reservation_start_ts IS NOT NULL AND r.reservation_start_ts <= ?) ' +
        'OR (r.reservation_start_ts IS NULL AND r.reservation_at <= ?))'
      );
      queryParams.push(toUnixMs(params.toDate), toDbDateTime(params.toDate));
    }
  }

  // Get total count
  const countSql = `SELECT COUNT(*) as total FROM reservations r WHERE ${whereConditions.join(' AND ')}`;
  const [countRows] = await pool.execute<RowDataPacket[]>(countSql, queryParams);
  const total = Number(countRows[0]?.total ?? 0);

  // Get reservations with pagination
  // Build params atomically to match WHERE conditions
  const dataParams = [...queryParams, params.limit, params.offset];
  const [rows] = await pool.execute<ReservationDbRow[]>(
    `SELECT 
      r.id, r.company_id, r.outlet_id, r.table_id,
      r.status_id, r.status,
      r.guest_count,
      r.customer_name, r.customer_phone,
      r.reservation_at, r.reservation_start_ts, r.reservation_end_ts,
      r.duration_minutes, r.notes,
      r.created_at, r.updated_at,
      ot.code as table_code, ot.name as table_name
    FROM reservations r
    LEFT JOIN outlet_tables ot ON r.table_id = ot.id 
      AND r.company_id = ot.company_id 
      AND r.outlet_id = ot.outlet_id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY r.reservation_start_ts IS NULL ASC, r.reservation_start_ts ASC, r.reservation_at ASC, r.id ASC
    LIMIT ? OFFSET ?`,
    dataParams
  );

  const reservations = rows.map(mapDbRowToReservation);

  return { reservations, total };
}

/**
 * Update reservation status with validation and side effects (Story 12.4 interface)
 */
export async function updateReservationStatus(
  id: bigint,
  companyId: bigint,
  outletId: bigint,
  input: UpdateStatusInput
): Promise<Reservation> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get current reservation state
    const currentReservation = await getReservationV2WithConnection(
      connection,
      id,
      companyId,
      outletId
    );

    if (!currentReservation) {
      throw new ReservationNotFoundError(id);
    }

    // Validate status transition
    const validTransitions = VALID_TRANSITIONS[currentReservation.statusId] ?? [];
    if (!validTransitions.includes(input.statusId)) {
      throw new InvalidStatusTransitionError(currentReservation.statusId, input.statusId);
    }

    // Handle side effects based on target status
    let tableId = currentReservation.tableId ?? input.tableId ?? null;

    // Check for overlap if table is assigned (either existing or new table)
    // This handles both new table assignments and confirming existing reservations
    const isTableChanged = input.tableId !== undefined && input.tableId !== currentReservation.tableId;
    const isConfirming = input.statusId === ReservationStatusV2.CONFIRMED && 
                         currentReservation.statusId !== ReservationStatusV2.CONFIRMED;
    
    if (tableId && (isTableChanged || isConfirming)) {
      // Check for overlapping reservations on this table
      const overlapExists = await checkReservationOverlap(
        connection,
        companyId,
        outletId,
        tableId,
        currentReservation.reservationTime,
        currentReservation.durationMinutes,
        id
      );

      if (overlapExists) {
        throw new ReservationConflictError('Table is already reserved for this time slot');
      }
    }

    if (input.statusId === ReservationStatusV2.CONFIRMED) {
      // CONFIRMED: Hold the table if tableId is provided
      if (tableId) {
        // Calculate hold until time (reservation time + duration)
        const heldUntil = new Date(currentReservation.reservationTime);
        heldUntil.setMinutes(heldUntil.getMinutes() + currentReservation.durationMinutes);

        const occupancy = await getTableOccupancySnapshotWithConnection(
          connection,
          companyId,
          outletId,
          tableId
        );
        const expectedVersion = occupancy?.version ?? 1;

        await holdTableWithConnection(connection, {
          companyId,
          outletId,
          tableId,
          heldUntil,
          reservationId: id,
          notes: `Held for reservation ${currentReservation.reservationCode}`,
          expectedVersion,
          createdBy: input.updatedBy
        });
      }
    } else if (input.statusId === ReservationStatusV2.CANCELLED) {
      // CANCELLED: Release held table if exists
      if (tableId) {
        const occupancy = await getTableOccupancySnapshotWithConnection(
          connection,
          companyId,
          outletId,
          tableId
        );
        if (occupancy && occupancy.reservationId === id) {
          // Table is held for this reservation, release it
          const [releaseResult] = await connection.execute<ResultSetHeader>(
            `UPDATE table_occupancy 
             SET status_id = ?, 
                  reservation_id = NULL, 
                  reserved_until = NULL,
                  version = version + 1,
                  updated_at = NOW(),
                  updated_by = ?
             WHERE company_id = ? AND outlet_id = ? AND table_id = ? AND version = ?`,
            [TableOccupancyStatus.AVAILABLE, input.updatedBy, companyId, outletId, tableId, occupancy.version]
          );

          if (releaseResult.affectedRows === 0) {
            throw new ReservationConflictError("Table state has changed, please retry");
          }
        }
      }
    } else if (input.statusId === ReservationStatusV2.CHECKED_IN) {
      // CHECKED_IN: Seat the table and create a service session
      if (tableId) {
        // Verify table is reserved for this reservation
        const occupancy = await getTableOccupancySnapshotWithConnection(
          connection,
          companyId,
          outletId,
          tableId
        );
        if (!occupancy || occupancy.reservationId !== id) {
          throw new ReservationValidationError(
            'Table is not reserved for this reservation'
          );
        }

        // Seat the table - creates service session and updates occupancy
        try {
          await seatTableWithConnection(connection, {
            companyId,
            outletId,
            tableId,
            guestCount: currentReservation.partySize,
            reservationId: id,
            guestName: currentReservation.customerName,
            expectedVersion: occupancy.version,
            createdBy: input.updatedBy
          });
        } catch (error) {
          if (error instanceof TableOccupancyConflictError) {
            throw new ReservationConflictError(
              'Table state has changed, please retry'
            );
          }
          if (error instanceof TableNotAvailableError) {
            throw new ReservationValidationError(
              `Table is not available for seating`
            );
          }
          throw error;
        }
      }
    } else if (input.statusId === ReservationStatusV2.NO_SHOW) {
      // NO_SHOW: Verify grace period has passed before allowing the transition
      const now = new Date();
      const reservationTime = new Date(currentReservation.reservationTime);
      const gracePeriodMinutes = 15; // Default grace period
      const gracePeriodEnd = new Date(reservationTime.getTime() + gracePeriodMinutes * 60000);

      if (now < gracePeriodEnd) {
        throw new ReservationValidationError(
          `Grace period not yet passed. Cannot mark as NO_SHOW before ${gracePeriodEnd.toISOString()}`
        );
      }

      // Release held table if exists (similar to CANCELLED handling)
      if (tableId) {
        const occupancy = await getTableOccupancySnapshotWithConnection(
          connection,
          companyId,
          outletId,
          tableId
        );
        if (occupancy && occupancy.reservationId === id) {
          // Table is held for this reservation, release it
          const [releaseResult] = await connection.execute<ResultSetHeader>(
            `UPDATE table_occupancy 
             SET status_id = ?, 
                  reservation_id = NULL, 
                  reserved_until = NULL,
                  version = version + 1,
                  updated_at = NOW(),
                  updated_by = ?
             WHERE company_id = ? AND outlet_id = ? AND table_id = ? AND version = ?`,
            [TableOccupancyStatus.AVAILABLE, input.updatedBy, companyId, outletId, tableId, occupancy.version]
          );

          if (releaseResult.affectedRows === 0) {
            throw new ReservationConflictError("Table state has changed, please retry");
          }
        }
      }
    }

    // Build update SQL dynamically based on provided fields
    const updates: string[] = [];
    const values: (number | string | bigint | null)[] = [];
    
    // Check which columns exist
    const hasStatusId = await columnExists(connection, 'reservations', 'status_id');
    const hasCancellationReason = await columnExists(connection, 'reservations', 'cancellation_reason');
    const hasUpdatedBy = await columnExists(connection, 'reservations', 'updated_by');
    
    // Map V2 status to legacy status string
    const legacyStatusMap: Record<number, string> = {
      [ReservationStatusV2.PENDING]: 'BOOKED',
      [ReservationStatusV2.CONFIRMED]: 'CONFIRMED',
      [ReservationStatusV2.CHECKED_IN]: 'ARRIVED',
      [ReservationStatusV2.NO_SHOW]: 'NO_SHOW',
      [ReservationStatusV2.CANCELLED]: 'CANCELLED',
      [ReservationStatusV2.COMPLETED]: 'COMPLETED'
    };
    
    // Always update legacy status column
    updates.push('status = ?');
    values.push(legacyStatusMap[input.statusId] ?? 'BOOKED');
    
    // Update status_id if column exists
    if (hasStatusId) {
      updates.push('status_id = ?');
      values.push(input.statusId);
    }

    if (input.tableId !== undefined && input.tableId !== null) {
      updates.push('table_id = ?');
      values.push(input.tableId);
    }

    if (input.cancellationReason !== undefined && hasCancellationReason) {
      updates.push('cancellation_reason = ?');
      values.push(input.cancellationReason);
    }

    if (input.notes !== undefined) {
      updates.push('notes = ?');
      values.push(input.notes);
    }

    if (hasUpdatedBy) {
      updates.push('updated_by = ?');
      values.push(input.updatedBy);
    }

    // Update timestamp
    updates.push('updated_at = NOW()');

    // Add WHERE clause params
    values.push(id, companyId, outletId);

    // Execute update
    const [updateResult] = await connection.execute<ResultSetHeader>(
      `UPDATE reservations 
       SET ${updates.join(', ')}
       WHERE id = ? AND company_id = ? AND outlet_id = ?`,
      values
    );

    if (updateResult.affectedRows === 0) {
      throw new ReservationNotFoundError(id);
    }

    await connection.commit();

    // Fetch and return updated reservation
    const updatedReservation = await getReservationV2WithConnection(
      connection,
      id,
      companyId,
      outletId
    );

    if (!updatedReservation) {
      throw new Error('Failed to retrieve updated reservation');
    }

    return updatedReservation;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function columnExists(
  connection: PoolConnection,
  tableName: string,
  columnName: string
): Promise<boolean> {
  try {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT 1 FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = ? 
         AND COLUMN_NAME = ?
       LIMIT 1`,
      [tableName, columnName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function generateReservationCodeWithConnection(
  connection: PoolConnection,
  outletId: bigint
): Promise<string> {
  // Check if reservation_code column exists
  const hasReservationCodeColumn = await columnExists(connection, 'reservations', 'reservation_code');
  
  for (let attempt = 0; attempt < MAX_CODE_GENERATION_RETRIES; attempt++) {
    const randomPart = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
    const code = `RES-${randomPart}`;
    
    // Only check uniqueness if the column exists
    if (hasReservationCodeColumn) {
      try {
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT 1 FROM reservations 
           WHERE outlet_id = ? AND reservation_code = ?
           LIMIT 1`,
          [outletId, code]
        );
        
        if (rows.length === 0) {
          return code;
        }
        // Collision detected, retry
      } catch (error) {
        // If query fails (column doesn't exist), just return the code
        return code;
      }
    } else {
      // Column doesn't exist, return code without checking
      return code;
    }
  }
  
  const timestamp = Date.now().toString(36).toUpperCase();
  return `RES-${timestamp.slice(-6)}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  VALID_TRANSITIONS,
  ReservationStatusV2
};

// Legacy exports for backward compatibility
export { ReservationRow };
