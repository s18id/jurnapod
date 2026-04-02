// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservations Module - CRUD Operations
 *
 * Read and write operations for reservations.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { ReservationDbRow } from "./types.js";
import {
  type CreateReservationInput,
  type UpdateReservationInput,
  type ListReservationsParams,
} from "./types.js";
import {
  ReservationNotFoundError,
  ReservationValidationError,
  ReservationConflictError,
} from "./errors.js";
import {
  toDbDateTime,
  toUnixMsFromDate,
  mapDbRowToReservation,
  generateReservationCodeWithConnection,
  columnExists,
} from "./utils.js";
import {
  checkReservationOverlap,
  hasActiveReservationOnTable,
  readTableForUpdate,
  getTableOccupancySnapshotWithConnection,
} from "./availability.js";
import type { UnixMs } from "../time/timestamp.js";
import { RESERVATION_DEFAULT_DURATION_FALLBACK } from "./types.js";

// Schema capabilities cache
interface ReservationSchemaCaps {
  hasReservationCode: boolean;
  hasCustomerEmail: boolean;
  hasCreatedBy: boolean;
  hasStatusId: boolean;
  hasReservationStartTs: boolean;
  hasReservationEndTs: boolean;
  hasCanonicalTs: boolean;
}

const schemaCapsCache = new WeakMap<KyselySchema, ReservationSchemaCaps>();

async function getReservationSchemaCaps(db: KyselySchema): Promise<ReservationSchemaCaps> {
  if (schemaCapsCache.has(db)) {
    return schemaCapsCache.get(db)!;
  }
  
  const [
    hasReservationCode, hasCustomerEmail, hasCreatedBy, hasStatusId,
    hasReservationStartTs, hasReservationEndTs
  ] = await Promise.all([
    columnExists(db, 'reservations', 'reservation_code'),
    columnExists(db, 'reservations', 'customer_email'),
    columnExists(db, 'reservations', 'created_by'),
    columnExists(db, 'reservations', 'status_id'),
    columnExists(db, 'reservations', 'reservation_start_ts'),
    columnExists(db, 'reservations', 'reservation_end_ts'),
  ]);

  const caps: ReservationSchemaCaps = {
    hasReservationCode,
    hasCustomerEmail,
    hasCreatedBy,
    hasStatusId,
    hasReservationStartTs,
    hasReservationEndTs,
    hasCanonicalTs: hasReservationStartTs && hasReservationEndTs,
  };
  
  schemaCapsCache.set(db, caps);
  return caps;
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get reservation by ID
 */
export async function getReservation(
  db: KyselySchema,
  companyId: number,
  reservationId: number
): Promise<ReturnType<typeof mapDbRowToReservation> | null> {
  const row = await db
    .selectFrom("reservations")
    .where("id", "=", reservationId)
    .where("company_id", "=", companyId)
    .select([
      "id", "company_id", "outlet_id", "table_id",
      "status_id", "status",
      "guest_count",
      "customer_name", "customer_phone",
      "reservation_at", "reservation_start_ts", "reservation_end_ts",
      "duration_minutes", "notes",
      "created_at", "updated_at"
    ])
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return mapDbRowToReservation(row as unknown as ReservationDbRow);
}

/**
 * Get outlet ID for a reservation
 */
export async function readReservationOutletId(
  db: KyselySchema,
  companyId: number,
  reservationId: number
): Promise<number | null> {
  const row = await db
    .selectFrom("reservations")
    .where("company_id", "=", companyId)
    .where("id", "=", reservationId)
    .select(["outlet_id"])
    .executeTakeFirst();
  
  return row ? Number(row.outlet_id) : null;
}

/**
 * List reservations with filtering and pagination
 */
export async function listReservations(
  db: KyselySchema,
  companyId: number,
  params: ListReservationsParams
): Promise<{ reservations: ReturnType<typeof mapDbRowToReservation>[]; total: number }> {
  // Build base query with company and outlet filters
  let baseQuery = db
    .selectFrom("reservations as r")
    .where("r.company_id", "=", companyId)
    .where("r.outlet_id", "=", params.outletId);

  // Add optional filters
  if (params.status !== undefined) {
    baseQuery = baseQuery.where("r.status_id", "=", params.status);
  }

  if (params.tableId !== undefined) {
    baseQuery = baseQuery.where("r.table_id", "=", params.tableId);
  }

  if (params.customerName) {
    baseQuery = baseQuery.where("r.customer_name", "like", `%${params.customerName}%`);
  }

  // Date filtering
  if (params.fromDate !== undefined && params.toDate !== undefined) {
    if (params.useOverlapFilter) {
      baseQuery = baseQuery.where((eb) => eb.or([
        eb.and([
          eb("r.reservation_start_ts", "is not", null),
          eb("r.reservation_end_ts", "is not", null),
          eb("r.reservation_start_ts", "<", params.toDate! + 1),
          eb("r.reservation_end_ts", ">", params.fromDate!)
        ]),
        eb.and([
          eb("r.reservation_start_ts", "is", null),
          eb("r.reservation_at", ">=", new Date(params.fromDate!)),
          eb("r.reservation_at", "<=", new Date(params.toDate!))
        ])
      ]));
    } else {
      baseQuery = baseQuery.where((eb) => eb.or([
        eb.and([
          eb("r.reservation_start_ts", "is not", null),
          eb("r.reservation_start_ts", ">=", params.fromDate!),
          eb("r.reservation_start_ts", "<=", params.toDate!)
        ]),
        eb.and([
          eb("r.reservation_start_ts", "is", null),
          eb("r.reservation_at", ">=", new Date(params.fromDate!)),
          eb("r.reservation_at", "<=", new Date(params.toDate!))
        ])
      ]));
    }
  } else if (params.fromDate !== undefined) {
    if (params.useOverlapFilter) {
      baseQuery = baseQuery.where((eb) => eb.or([
        eb.and([
          eb("r.reservation_start_ts", "is not", null),
          eb("r.reservation_end_ts", "is not", null),
          eb("r.reservation_end_ts", ">", params.fromDate!)
        ]),
        eb.and([
          eb("r.reservation_start_ts", "is", null),
          eb("r.reservation_at", ">=", new Date(params.fromDate!))
        ])
      ]));
    } else {
      baseQuery = baseQuery.where((eb) => eb.or([
        eb.and([
          eb("r.reservation_start_ts", "is not", null),
          eb("r.reservation_start_ts", ">=", params.fromDate!)
        ]),
        eb.and([
          eb("r.reservation_start_ts", "is", null),
          eb("r.reservation_at", ">=", new Date(params.fromDate!))
        ])
      ]));
    }
  } else if (params.toDate !== undefined) {
    if (params.useOverlapFilter) {
      baseQuery = baseQuery.where((eb) => eb.or([
        eb.and([
          eb("r.reservation_start_ts", "is not", null),
          eb("r.reservation_start_ts", "<", params.toDate! + 1)
        ]),
        eb.and([
          eb("r.reservation_start_ts", "is", null),
          eb("r.reservation_at", "<=", new Date(params.toDate!))
        ])
      ]));
    } else {
      baseQuery = baseQuery.where((eb) => eb.or([
        eb.and([
          eb("r.reservation_start_ts", "is not", null),
          eb("r.reservation_start_ts", "<=", params.toDate!)
        ]),
        eb.and([
          eb("r.reservation_start_ts", "is", null),
          eb("r.reservation_at", "<=", new Date(params.toDate!))
        ])
      ]));
    }
  }

  // Get total count
  const countResult = await baseQuery
    .select((eb) => eb.fn.count("r.id").as("total"))
    .executeTakeFirst();
  const total = Number(countResult?.total ?? 0);

  // Get reservations with pagination
  const result = await baseQuery
    .leftJoin("outlet_tables as ot", (join) => join
      .onRef("r.table_id", "=", "ot.id")
      .onRef("r.company_id", "=", "ot.company_id")
      .onRef("r.outlet_id", "=", "ot.outlet_id")
    )
    .select([
      "r.id", "r.company_id", "r.outlet_id", "r.table_id",
      "r.status_id", "r.status",
      "r.guest_count",
      "r.customer_name", "r.customer_phone",
      "r.reservation_at", "r.reservation_start_ts", "r.reservation_end_ts",
      "r.duration_minutes", "r.notes",
      "r.created_at", "r.updated_at",
      "ot.code as table_code", "ot.name as table_name"
    ])
    .orderBy(sql`CASE WHEN r.reservation_start_ts IS NULL THEN 0 ELSE 1 END`, "asc")
    .orderBy("r.reservation_start_ts", "asc")
    .orderBy("r.reservation_at", "asc")
    .orderBy("r.id", "asc")
    .limit(params.limit)
    .offset(params.offset)
    .execute();

  const reservations = result.map((row) => mapDbRowToReservation(row as unknown as ReservationDbRow));

  return { reservations, total };
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Create a new reservation
 */
export async function createReservation(
  db: KyselySchema,
  input: CreateReservationInput
): Promise<ReturnType<typeof mapDbRowToReservation>> {
  return db.transaction().execute(async (trx) => {
    // Check for overlapping reservations if table is specified
    if (input.tableId) {
      const table = await readTableForUpdate(trx, input.companyId, input.outletId, input.tableId);
      if (!table) {
        throw new ReservationValidationError(`Table ${input.tableId} not found in outlet`);
      }
      
      // Check if table status is available
      if (table.status === "OCCUPIED" || table.status === "UNAVAILABLE" || table.status === "RESERVED") {
        throw new ReservationValidationError("Selected table is not available for reservation");
      }
      
      const tableAlreadyReserved = await hasActiveReservationOnTable(
        trx,
        input.companyId,
        input.outletId,
        input.tableId
      );
      if (tableAlreadyReserved) {
        throw new ReservationValidationError("Selected table is not available for reservation");
      }
    }

    // Generate reservation code
    const reservationCode = await generateReservationCodeWithConnection(trx, input.outletId);
    
    // Calculate timestamps
    const reservationStartTs = input.reservationStartTs;
    const reservationEndTs = reservationStartTs + input.durationMinutes * 60_000;
    const reservationAt = toDbDateTime(new Date(reservationStartTs));

    const caps = await getReservationSchemaCaps(trx);

    // Build INSERT values dynamically based on schema capabilities
    const insertData: Record<string, unknown> = {
      company_id: input.companyId,
      outlet_id: input.outletId,
      table_id: input.tableId ?? null,
      customer_name: input.customerName,
      customer_phone: input.customerPhone ?? null,
      guest_count: input.partySize,
      reservation_at: reservationAt,
      duration_minutes: input.durationMinutes,
      status: "BOOKED",
      notes: input.notes ?? null,
    };

    if (caps.hasReservationCode) {
      insertData.reservation_code = reservationCode;
    }
    if (caps.hasCustomerEmail) {
      insertData.customer_email = input.customerEmail ?? null;
    }
    if (caps.hasCreatedBy) {
      insertData.created_by = input.createdBy.userId.toString();
    }
    if (caps.hasStatusId) {
      insertData.status_id = 1; // PENDING
    }
    if (caps.hasCanonicalTs) {
      insertData.reservation_start_ts = reservationStartTs;
      insertData.reservation_end_ts = reservationEndTs;
    }

    const insertResult = await trx
      .insertInto("reservations")
      .values(insertData as any)
      .executeTakeFirst();

    const reservationId = Number(insertResult!.insertId);
    
    // Fetch created reservation
    const reservation = await getReservation(trx, input.companyId, reservationId);
    if (!reservation) {
      throw new Error("Failed to retrieve created reservation");
    }

    return reservation;
  });
}

/**
 * Update a reservation
 */
export async function updateReservation(
  db: KyselySchema,
  companyId: number,
  reservationId: number,
  input: UpdateReservationInput
): Promise<ReturnType<typeof mapDbRowToReservation>> {
  return db.transaction().execute(async (trx) => {
    // Get current reservation
    const current = await getReservation(trx, companyId, reservationId);
    if (!current) {
      throw new ReservationNotFoundError(reservationId);
    }

    // Calculate new timestamps if provided
    const nextReservationStartTs = input.reservationStartTs ?? current.reservationStartTs;
    const nextDurationMinutes = input.durationMinutes ?? (current.reservationEndTs - current.reservationStartTs) / 60_000;
    const nextReservationEndTs = nextReservationStartTs + nextDurationMinutes * 60_000;

    // Update data
    const updateData: Record<string, unknown> = {
      table_id: input.tableId ?? current.tableId,
      customer_name: input.customerName ?? current.customerName,
      customer_phone: input.customerPhone === undefined ? current.customerPhone : input.customerPhone,
      guest_count: input.partySize ?? current.partySize,
      reservation_at: toDbDateTime(new Date(nextReservationStartTs)),
      duration_minutes: nextDurationMinutes,
      notes: input.notes === undefined ? current.notes : input.notes,
      updated_at: new Date(),
    };

    // Update canonical timestamps
    updateData.reservation_start_ts = nextReservationStartTs;
    updateData.reservation_end_ts = nextReservationEndTs;

    await trx
      .updateTable("reservations")
      .set(updateData as any)
      .where("company_id", "=", companyId)
      .where("id", "=", reservationId)
      .execute();

    // Fetch updated reservation
    const updated = await getReservation(trx, companyId, reservationId);
    if (!updated) {
      throw new ReservationNotFoundError(reservationId);
    }

    return updated;
  });
}
