// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import type {
  ReservationCreateRequest,
  ReservationListQuery,
  ReservationRow,
  ReservationStatus,
  ReservationUpdateRequest
} from "@jurnapod/shared";
import { getDbPool } from "./db";

export class ReservationNotFoundError extends Error {}
export class ReservationValidationError extends Error {}

type ReservationDbRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  table_id: number | null;
  customer_name: string;
  customer_phone: string | null;
  guest_count: number;
  reservation_at: Date;
  duration_minutes: number | null;
  status: ReservationStatus;
  notes: string | null;
  linked_order_id: string | null;
  created_at: Date;
  updated_at: Date;
  arrived_at: Date | null;
  seated_at: Date | null;
  cancelled_at: Date | null;
};

type OutletTableStatus = "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";

type OutletTableRow = RowDataPacket & {
  id: number;
  status: OutletTableStatus;
};

const finalStatuses: ReservationStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW"];

function isFinalStatus(status: ReservationStatus): boolean {
  return finalStatuses.includes(status);
}

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

function mapRow(row: ReservationDbRow): ReservationRow {
  const reservationAt = toIso(row.reservation_at);
  const createdAt = toIso(row.created_at);
  const updatedAt = toIso(row.updated_at);
  if (!reservationAt || !createdAt || !updatedAt) {
    throw new ReservationValidationError("Invalid reservation datetime value");
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
    status: row.status,
    notes: row.notes,
    linked_order_id: row.linked_order_id,
    created_at: createdAt,
    updated_at: updatedAt,
    arrived_at: toIso(row.arrived_at),
    seated_at: toIso(row.seated_at),
    cancelled_at: toIso(row.cancelled_at)
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

async function readReservationForUpdate(
  connection: PoolConnection,
  companyId: number,
  reservationId: number
): Promise<ReservationDbRow> {
  const [rows] = await connection.execute<ReservationDbRow[]>(
    `SELECT id, company_id, outlet_id, table_id, customer_name, customer_phone, guest_count,
            reservation_at, duration_minutes, status, notes, linked_order_id,
            created_at, updated_at, arrived_at, seated_at, cancelled_at
     FROM reservations
     WHERE company_id = ? AND id = ?
     LIMIT 1
     FOR UPDATE`,
    [companyId, reservationId]
  );

  if (rows.length === 0) {
    throw new ReservationNotFoundError(`Reservation ${reservationId} not found`);
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
  await connection.execute(
    `UPDATE outlet_tables
     SET status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE company_id = ? AND outlet_id = ? AND id = ?`,
    [status, companyId, outletId, tableId]
  );
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
  if (query.from) {
    where.push("reservation_at >= ?");
    params.push(query.from);
  }
  if (query.to) {
    where.push("reservation_at <= ?");
    params.push(query.to);
  }

  params.push(query.limit, query.offset);
  const [rows] = await pool.execute<ReservationDbRow[]>(
    `SELECT id, company_id, outlet_id, table_id, customer_name, customer_phone, guest_count,
            reservation_at, duration_minutes, status, notes, linked_order_id,
            created_at, updated_at, arrived_at, seated_at, cancelled_at
     FROM reservations
     WHERE ${where.join(" AND ")}
     ORDER BY reservation_at ASC, id ASC
     LIMIT ? OFFSET ?`,
    params
  );

  return rows.map(mapRow);
}

export async function readReservationOutletId(companyId: number, reservationId: number): Promise<number | null> {
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

    const [insertResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO reservations (
         company_id, outlet_id, table_id, customer_name, customer_phone,
         guest_count, reservation_at, duration_minutes, status, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', ?)`,
      [
        companyId,
        input.outlet_id,
        input.table_id ?? null,
        input.customer_name,
        input.customer_phone ?? null,
        input.guest_count,
        input.reservation_at,
        input.duration_minutes ?? null,
        input.notes ?? null
      ]
    );

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

    const nextStatus = patch.status ?? current.status;
    if (!canTransition(current.status, nextStatus)) {
      throw new ReservationValidationError(`Invalid reservation transition: ${current.status} -> ${nextStatus}`);
    }

    if (isFinalStatus(current.status) && current.status !== nextStatus) {
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
      await setTableStatus(connection, companyId, current.outlet_id, nextTableId, "RESERVED");
    }

    if (current.table_id && current.table_id !== nextTableId) {
      await setTableStatus(connection, companyId, current.outlet_id, current.table_id, "AVAILABLE");
    }

    if (nextTableId) {
      if (nextStatus === "SEATED") {
        await setTableStatus(connection, companyId, current.outlet_id, nextTableId, "OCCUPIED");
      }
      if (nextStatus === "COMPLETED" || nextStatus === "CANCELLED" || nextStatus === "NO_SHOW") {
        await setTableStatus(connection, companyId, current.outlet_id, nextTableId, "AVAILABLE");
      }
    }

    await connection.execute(
      `UPDATE reservations
       SET table_id = ?,
           customer_name = ?,
           customer_phone = ?,
           guest_count = ?,
           reservation_at = ?,
           duration_minutes = ?,
           status = ?,
           notes = ?,
           arrived_at = CASE WHEN ? = 'ARRIVED' THEN CURRENT_TIMESTAMP ELSE arrived_at END,
           seated_at = CASE WHEN ? = 'SEATED' THEN CURRENT_TIMESTAMP ELSE seated_at END,
           cancelled_at = CASE WHEN ? IN ('CANCELLED', 'NO_SHOW') THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ? AND id = ?`,
      [
        nextTableId,
        patch.customer_name ?? current.customer_name,
        patch.customer_phone === undefined ? current.customer_phone : patch.customer_phone,
        patch.guest_count ?? current.guest_count,
        patch.reservation_at ?? toIso(current.reservation_at),
        patch.duration_minutes === undefined ? current.duration_minutes : patch.duration_minutes,
        nextStatus,
        patch.notes === undefined ? current.notes : patch.notes,
        nextStatus,
        nextStatus,
        nextStatus,
        companyId,
        reservationId
      ]
    );

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
