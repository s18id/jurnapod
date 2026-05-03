// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// /**
//  * Reservations Domain Module - CRUD Operations
//  *
//  * This file contains read and write operations for reservations.
//  * Part of Story 6.5b-c (Reservations Domain Extraction).
//  */

import { getDb, type KyselySchema } from "../db";
import {
  ReservationStatusV2,
  type ReservationListQuery,
  type ReservationUpdateRequest,
  type ReservationRow,
  type ReservationCreateRequest,
  type ReservationStatus,
} from "@jurnapod/shared";
// Import types from local types module
import type {
  Reservation,
  ReservationDbRow,
  CreateReservationInput,
  ListReservationsParams,
} from "./types";
import {
  ReservationNotFoundError,
  ReservationValidationError,
  ReservationConflictError,
} from "./types";

// Import helpers from utils (single source of truth)
import {
  toUnixMs,
  fromUnixMs,
  mapRow,
  mapDbRowToReservation,
  resolveEffectiveDurationMinutes,
  columnExists,
  generateReservationCodeWithConnection,
  isFinalStatus,
} from "./utils";

// Import availability helpers
import {
  checkReservationOverlap,
  hasActiveReservationOnTable,
  readTableForUpdate,
  setTableStatus,
  recomputeTableStatus,
} from "./availability";

// Re-export for use by other modules (availability, status)
export { getReservationV2WithConnection };

// Re-export helpers from utils for backward compatibility
export { mapRow, mapDbRowToReservation };

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Legacy status transition check for the legacy updateReservation interface.
 * Uses legacy status names (BOOKED, ARRIVED, SEATED, ...) and allows same-status no-ops.
 */
function legacyCanTransition(fromStatus: string, toStatus: string): boolean {
  if (fromStatus === toStatus) {
    return true;
  }
  const transitions: Record<string, string[]> = {
    BOOKED: ["CONFIRMED", "ARRIVED", "CANCELLED", "NO_SHOW"],
    CONFIRMED: ["ARRIVED", "CANCELLED", "NO_SHOW"],
    ARRIVED: ["SEATED", "CANCELLED", "NO_SHOW"],
    SEATED: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: [],
    NO_SHOW: []
  };
  return transitions[fromStatus]?.includes(toStatus) ?? false;
}

// ============================================================================
// SCHEMA CAPABILITIES CACHE
// ============================================================================

interface ReservationSchemaCaps {
  hasReservationCode: boolean;
  hasCustomerEmail: boolean;
  hasCreatedBy: boolean;
  hasStatusId: boolean;
  hasReservationStartTs: boolean;
  hasReservationEndTs: boolean;
}

// Cache using WeakMap per db instance - schema doesn't change at runtime
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
  };
  
  schemaCapsCache.set(db, caps);
  return caps;
}

function assertCanonicalReservationTimestampSchema(caps: ReservationSchemaCaps): void {
  if (caps.hasReservationStartTs && caps.hasReservationEndTs) {
    return;
  }

  throw new ReservationValidationError(
    "Reservation canonical timestamp columns are required. Run DB migrations before reservation writes."
  );
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

async function readReservationForUpdate(
  db: KyselySchema,
  companyId: number,
  reservationId: number
): Promise<ReservationDbRow> {
  const row = await db
    .selectFrom("reservations")
    .where("company_id", "=", companyId)
    .where("id", "=", reservationId)
    .select([
      "id", "company_id", "outlet_id", "table_id", "customer_name", "customer_phone",
      "guest_count", "reservation_at", "reservation_start_ts", "reservation_end_ts",
      "duration_minutes", "status", "notes", "linked_order_id",
      "created_at", "updated_at", "arrived_at", "seated_at", "cancelled_at", "status_id"
    ])
    .forUpdate()
    .executeTakeFirst();

  if (!row) {
    throw new ReservationNotFoundError(reservationId);
  }

  return row as unknown as ReservationDbRow;
}

/**
 * List reservations with filtering and pagination (legacy interface)
 */
export async function listReservations(
  companyId: number,
  query: ReservationListQuery
): Promise<ReservationRow[]> {
  const db = getDb();
  
  let q = db
    .selectFrom("reservations")
    .where("company_id", "=", companyId)
    .where("outlet_id", "=", query.outlet_id);

  if (query.status) {
    q = q.where("status", "=", query.status);
  }

  // Store date values to avoid TypeScript narrowing issues inside expression builder
  const queryFrom = query.from;
  const queryTo = query.to;
  const fromMs = queryFrom ? toUnixMs(queryFrom) : undefined;
  const toMs = queryTo ? toUnixMs(queryTo) : undefined;

  if (fromMs !== undefined && toMs !== undefined) {
    if (query.overlap_filter) {
      q = q.where((eb) => eb.and([
        eb("reservation_start_ts", "<", toMs + 1),
        eb("reservation_end_ts", ">", fromMs)
      ]));
    } else {
      q = q.where((eb) => eb.and([
        eb("reservation_start_ts", ">=", fromMs),
        eb("reservation_start_ts", "<=", toMs)
      ]));
    }
  } else if (fromMs !== undefined) {
    if (query.overlap_filter) {
      q = q.where("reservation_end_ts", ">", fromMs);
    } else {
      q = q.where("reservation_start_ts", ">=", fromMs);
    }
  } else if (toMs !== undefined) {
    if (query.overlap_filter) {
      q = q.where("reservation_start_ts", "<", toMs + 1);
    } else {
      q = q.where("reservation_start_ts", "<=", toMs);
    }
  }

  const result = await q
    .selectAll()
    .orderBy("reservation_start_ts", "asc")
    .orderBy("id", "asc")
    .limit(query.limit)
    .offset(query.offset)
    .execute();

  return result.map((row) => mapRow(row as unknown as ReservationDbRow));
}

/**
 * Get outlet ID for a reservation (for tenant verification)
 */
export async function readReservationOutletId(
  companyId: number,
  reservationId: number
): Promise<number | null> {
  const db = getDb();
  const row = await db
    .selectFrom("reservations")
    .where("company_id", "=", companyId)
    .where("id", "=", reservationId)
    .select(["outlet_id"])
    .executeTakeFirst();
  
  return row ? Number(row.outlet_id) : null;
}

/**
 * Get a single reservation by ID with tenant isolation (Story 12.4 interface)
 */
export async function getReservation(
  id: bigint,
  companyId: bigint,
  outletId: bigint
): Promise<Reservation | null> {
  const db = getDb();
  return getReservationV2WithConnection(db, id, companyId, outletId);
}

/**
 * Internal: Get reservation with connection for transaction support
 */
async function getReservationV2WithConnection(
  db: KyselySchema,
  id: bigint,
  companyId: bigint,
  outletId: bigint
): Promise<Reservation | null> {
  const row = await db
    .selectFrom("reservations")
    .where("id", "=", Number(id))
    .where("company_id", "=", Number(companyId))
    .where("outlet_id", "=", Number(outletId))
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

// Extended type for listReservationsV2 result including joined columns
interface ListReservationsV2Row extends ReservationDbRow {
  table_code: string | null;
  table_name: string | null;
}

/**
 * List reservations with flexible filtering (Story 12.4 interface)
 *
 * Date filtering modes:
 * - Calendar mode (useOverlapFilter=true): Returns reservations that overlap with the date range.
 * - Report mode (useOverlapFilter=false, default): Returns reservations that START within the date range.
 */
export async function listReservationsV2(
  params: ListReservationsParams
): Promise<{ reservations: Reservation[]; total: number }> {
  const db = getDb();
  
  // Build base query with company and outlet filters
  let baseQuery = db
    .selectFrom("reservations as r")
    .where("r.company_id", "=", Number(params.companyId))
    .where("r.outlet_id", "=", Number(params.outletId));

  // Add optional filters
  if (params.statusId !== undefined) {
    const legacyStatusMap: Record<number, string> = {
      [ReservationStatusV2.PENDING]: 'BOOKED',
      [ReservationStatusV2.CONFIRMED]: 'CONFIRMED',
      [ReservationStatusV2.CHECKED_IN]: 'ARRIVED',
      [ReservationStatusV2.NO_SHOW]: 'NO_SHOW',
      [ReservationStatusV2.CANCELLED]: 'CANCELLED',
      [ReservationStatusV2.COMPLETED]: 'COMPLETED'
    };
    const statusId = params.statusId;
    const legacyStatus = legacyStatusMap[statusId];
    if (legacyStatus) {
      baseQuery = baseQuery.where((eb) => 
        eb.or([
          eb("r.status_id", "=", statusId),
          eb("r.status", "=", legacyStatus)
        ])
      );
    } else {
      baseQuery = baseQuery.where("r.status_id", "=", statusId);
    }
  }

  if (params.tableId !== undefined) {
    baseQuery = baseQuery.where("r.table_id", "=", Number(params.tableId));
  }

  if (params.customerName) {
    baseQuery = baseQuery.where("r.customer_name", "like", `%${params.customerName}%`);
  }

  // Store date values to avoid TypeScript narrowing issues inside expression builder
  const fromDate = params.fromDate;
  const toDate = params.toDate;
  const fromDateMs = fromDate ? toUnixMs(fromDate) : undefined;
  const toDateMs = toDate ? toUnixMs(toDate) : undefined;

  // Date filtering: calendar mode uses interval overlap, report mode uses point-in-time
  if (fromDateMs !== undefined && toDateMs !== undefined) {
    if (params.useOverlapFilter) {
      baseQuery = baseQuery.where((eb) => eb.and([
        eb("r.reservation_start_ts", "<", toDateMs + 1),
        eb("r.reservation_end_ts", ">", fromDateMs)
      ]));
    } else {
      baseQuery = baseQuery.where((eb) => eb.and([
        eb("r.reservation_start_ts", ">=", fromDateMs),
        eb("r.reservation_start_ts", "<=", toDateMs)
      ]));
    }
  } else if (fromDateMs !== undefined) {
    if (params.useOverlapFilter) {
      baseQuery = baseQuery.where("r.reservation_end_ts", ">", fromDateMs);
    } else {
      baseQuery = baseQuery.where("r.reservation_start_ts", ">=", fromDateMs);
    }
  } else if (toDateMs !== undefined) {
    if (params.useOverlapFilter) {
      baseQuery = baseQuery.where("r.reservation_start_ts", "<", toDateMs + 1);
    } else {
      baseQuery = baseQuery.where("r.reservation_start_ts", "<=", toDateMs);
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
    .orderBy("r.reservation_start_ts", "asc")
    .orderBy("r.id", "asc")
    .limit(params.limit)
    .offset(params.offset)
    .execute();

  const reservations = result.map((row) => mapDbRowToReservation(row as unknown as ListReservationsV2Row));

  return { reservations, total };
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Create a new reservation (legacy interface)
 */
export async function createReservation(
  companyId: number,
  input: ReservationCreateRequest
): Promise<ReservationRow> {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    if (input.table_id) {
      const table = await readTableForUpdate(trx, companyId, input.outlet_id, input.table_id);
      const tableAlreadyReserved = await hasActiveReservationOnTable(
        trx,
        companyId,
        input.outlet_id,
        input.table_id
      );
      if (table.status === "OCCUPIED" || table.status === "UNAVAILABLE" || tableAlreadyReserved || table.status === "RESERVED") {
        throw new ReservationValidationError("Selected table is not available for reservation");
      }
      await setTableStatus(trx, companyId, input.outlet_id, input.table_id, "RESERVED");
    }

    const reservationStartTs = toUnixMs(input.reservation_at);
    const effectiveDurationMinutes = await resolveEffectiveDurationMinutes(companyId, input.duration_minutes);
    const reservationEndTs = reservationStartTs + effectiveDurationMinutes * 60000;
    const reservationCode = await generateReservationCodeWithConnection(trx, BigInt(input.outlet_id));
    const caps = await getReservationSchemaCaps(trx);
    assertCanonicalReservationTimestampSchema(caps);

    // Build INSERT values dynamically based on schema capabilities
    const insertData: Record<string, unknown> = {
      company_id: companyId,
      outlet_id: input.outlet_id,
      table_id: input.table_id ?? null,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone ?? null,
      guest_count: input.guest_count,
      duration_minutes: input.duration_minutes ?? null,
      status: "BOOKED",
      notes: input.notes ?? null,
    };

    if (caps.hasReservationCode) {
      insertData.reservation_code = reservationCode;
    }
    if (caps.hasStatusId) {
      insertData.status_id = ReservationStatusV2.PENDING;
    }
    if (caps.hasCreatedBy) {
      insertData.created_by = "system";
    }
    insertData.reservation_start_ts = reservationStartTs;
    insertData.reservation_end_ts = reservationEndTs;

    const insertResult = await trx
      .insertInto("reservations")
      .values(insertData as any)
      .executeTakeFirst();

    const reservationId = Number(insertResult!.insertId);
    const row = await readReservationForUpdate(trx, companyId, reservationId);
    return mapRow(row);
  });
}

/**
 * Update reservation details including status transitions (legacy interface)
 */
export async function updateReservation(
  companyId: number,
  reservationId: number,
  patch: ReservationUpdateRequest
): Promise<ReservationRow> {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    const current = await readReservationForUpdate(trx, companyId, reservationId);
    const currentReservationStartTs = fromUnixMs(current.reservation_start_ts);
    if (currentReservationStartTs === null) {
      throw new ReservationValidationError("reservation_start_ts is required for reservation updates");
    }
    const nextReservationAt = patch.reservation_at;
    const nextDurationMinutes = patch.duration_minutes === undefined ? current.duration_minutes : patch.duration_minutes;
    const reservationStartTs = nextReservationAt === undefined
      ? currentReservationStartTs
      : toUnixMs(nextReservationAt);
    const effectiveDurationMinutes = await resolveEffectiveDurationMinutes(companyId, nextDurationMinutes);
    const reservationEndTs = reservationStartTs + effectiveDurationMinutes * 60000;

    const nextStatus = patch.status ?? current.status;
    if (!legacyCanTransition(current.status ?? '', nextStatus ?? '')) {
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
      const table = await readTableForUpdate(trx, companyId, current.outlet_id, nextTableId);
      const tableAlreadyReserved = await hasActiveReservationOnTable(
        trx,
        companyId,
        current.outlet_id,
        nextTableId,
        reservationId
      );
      if (table.status === "OCCUPIED" || table.status === "UNAVAILABLE" || tableAlreadyReserved) {
        throw new ReservationValidationError("Selected table is not assignable");
      }
    }

    const caps = await getReservationSchemaCaps(trx);
    assertCanonicalReservationTimestampSchema(caps);

    // Build update data with conditional timestamp handling
    const updateData: Record<string, unknown> = {
      table_id: nextTableId,
      customer_name: patch.customer_name ?? current.customer_name,
      customer_phone: patch.customer_phone === undefined ? current.customer_phone : patch.customer_phone,
      guest_count: patch.guest_count ?? current.guest_count,
      duration_minutes: nextDurationMinutes,
      status: nextStatus,
      notes: patch.notes === undefined ? current.notes : patch.notes,
      updated_at: new Date(),
    };

    // Conditional timestamp updates based on new status
    updateData.reservation_start_ts = reservationStartTs;
    updateData.reservation_end_ts = reservationEndTs;

    // Handle arrived_at, seated_at, cancelled_at - preserve old value unless status changed to trigger
    updateData.arrived_at = nextStatus === "ARRIVED" ? new Date() : current.arrived_at;
    updateData.seated_at = nextStatus === "SEATED" ? new Date() : current.seated_at;
    updateData.cancelled_at = nextStatus != null && ["CANCELLED", "NO_SHOW"].includes(nextStatus) ? new Date() : current.cancelled_at;

    // Build update query
    const updateQuery = trx
      .updateTable("reservations")
      .set(updateData)
      .where("company_id", "=", companyId)
      .where("id", "=", reservationId);

    await updateQuery.execute();

    const impactedTableIds = new Set<number>();
    if (current.table_id != null) {
      impactedTableIds.add(current.table_id);
    }
    if (nextTableId != null) {
      impactedTableIds.add(nextTableId);
    }

    for (const tableId of impactedTableIds) {
      await recomputeTableStatus(trx, companyId, current.outlet_id, tableId);
    }

    const updated = await readReservationForUpdate(trx, companyId, reservationId);
    return mapRow(updated);
  });
}

/**
 * Create a new reservation (Story 12.4 interface)
 * Inserts with PENDING status and generates reservation code
 */
export async function createReservationV2(
  input: CreateReservationInput
): Promise<Reservation> {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    // Check for overlapping reservations if table is specified
    const durationMinutes = input.durationMinutes ?? 90;
    const tableId = input.tableId ?? null;

    if (tableId) {
      const overlapExists = await checkReservationOverlap(
        trx,
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
      trx,
      input.outletId
    );

    // Prepare values with fallbacks for columns that may not exist yet
    const reservationStartTs = toUnixMs(input.reservationTime);
    const effectiveDurationMinutes = await resolveEffectiveDurationMinutes(
      Number(input.companyId),
      input.durationMinutes
    );
    const reservationEndTs = reservationStartTs + effectiveDurationMinutes * 60000;

    const caps = await getReservationSchemaCaps(trx);
    assertCanonicalReservationTimestampSchema(caps);

    // Build INSERT values dynamically based on schema capabilities
    const insertData: Record<string, unknown> = {
      company_id: input.companyId,
      outlet_id: input.outletId,
      table_id: tableId,
      customer_name: input.customerName,
      customer_phone: input.customerPhone ?? null,
      guest_count: input.partySize,
      duration_minutes: durationMinutes,
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
      insertData.created_by = input.createdBy;
    }
    if (caps.hasStatusId) {
      insertData.status_id = ReservationStatusV2.PENDING;
    }
    insertData.reservation_start_ts = reservationStartTs;
    insertData.reservation_end_ts = reservationEndTs;

    const insertResult = await trx
      .insertInto("reservations")
      .values(insertData as any)
      .executeTakeFirst();

    const reservationId = BigInt(Number(insertResult?.insertId ?? 0));

    // Fetch within the transaction so a failed fetch causes rollback (no orphan)
    const reservation = await getReservationV2WithConnection(
      trx,
      reservationId,
      input.companyId,
      input.outletId
    );

    if (!reservation) {
      throw new Error('Failed to retrieve created reservation');
    }

    // Preserve in-memory values for columns that may not exist in the DB schema yet
    return {
      ...reservation,
      reservationCode: reservation.reservationCode || reservationCode,
      createdBy: reservation.createdBy || input.createdBy,
    };
  });
}
