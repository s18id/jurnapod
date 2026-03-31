// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDb, type KyselySchema } from '@/lib/db';
import { sql } from 'kysely';
import {
  type TableSyncPushRequest,
  type TableSyncConflictPayload,
} from '@jurnapod/shared';
import {
  TableOccupancyStatus,
  TableEventType,
  ServiceSessionStatus,
  SETTINGS_REGISTRY,
  parseSettingValue,
  type TableOccupancyStatusType,
} from '@jurnapod/shared';
import { getSetting } from '@/lib/settings';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Parameters for pushing table events from POS to API
 * Used by POS devices to sync offline table operations
 */
export interface PushTableEventsParams {
  companyId: number;
  outletId: number;
  events: TableSyncPushRequest['events'];
  actorId: number;
}

/**
 * Individual push result per event
 */
export interface PushTableEventResult {
  clientTxId: string;
  status: 'OK' | 'DUPLICATE' | 'ERROR' | 'CONFLICT';
  tableVersion?: number;
  conflictPayload?: TableSyncConflictPayload;
  errorMessage?: string;
}

/**
 * Result of pushing table events
 */
export interface PushTableEventsResult {
  results: PushTableEventResult[];
  syncTimestamp: string;
}

/**
 * Parameters for pulling table state from API to POS
 * Used by POS devices to sync down current table state
 */
export interface PullTableStateParams {
  companyId: number;
  outletId: number;
  cursor?: string;
  limit?: number;
}

/**
 * Table snapshot returned in pull response
 */
export interface PullTableStateSnapshot {
  tableId: number;
  tableNumber: string;
  status: number; // TABLE_STATUSES constant
  currentSessionId: number | null;
  version: number;
  stalenessMs: number;
}

/**
 * Incremental event returned in pull response
 */
export interface PullTableStateEvent {
  id: number;
  tableId: number;
  eventType: string;
  payload: unknown;
  recordedAt: string;
}

/**
 * Result of pulling table state
 */
export interface PullTableStateResult {
  tables: PullTableStateSnapshot[];
  events: PullTableStateEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  syncTimestamp: string;
}

const MAX_SYNC_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 100;
const RESERVATION_DEFAULT_DURATION_KEY = "feature.reservation.default_duration_minutes" as const;
const RESERVATION_DEFAULT_DURATION_FALLBACK = Number(
  SETTINGS_REGISTRY[RESERVATION_DEFAULT_DURATION_KEY].defaultValue
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableDbError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT";
}

async function columnExists(
  db: KyselySchema,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${tableName}
      AND COLUMN_NAME = ${columnName}
    LIMIT 1
  `.execute(db);
  return result.rows.length > 0;
}

async function resolveReservationDefaultDurationMinutes(companyId: number): Promise<number> {
  const setting = await getSetting({
    companyId,
    key: RESERVATION_DEFAULT_DURATION_KEY,
    outletId: null
  });

  if (setting?.value !== null && setting?.value !== undefined) {
    try {
      const parsed = parseSettingValue(RESERVATION_DEFAULT_DURATION_KEY, setting.value);
      if (typeof parsed === 'number' && Number.isFinite(parsed)) {
        return parsed;
      }
    } catch {
      // Fallback to shared registry default.
    }
  }

  return RESERVATION_DEFAULT_DURATION_FALLBACK;
}

// ============================================================================
// SCOPE D: CONFLICT CANONICALIZATION HELPER
// ============================================================================

/**
 * Build conflict payload for version mismatch scenarios
 * Queries current table occupancy and active session state
 * 
 * @param tableId - The table ID (as bigint)
 * @param companyId - Company ID for tenant isolation
 * @param outletId - Outlet ID for outlet scoping
 * @returns Canonical state snapshot for conflict resolution
 */
async function buildConflictPayload(
  tableId: bigint,
  companyId: bigint,
  outletId: bigint
): Promise<TableSyncConflictPayload> {
  const db = getDb();

  // 1. Query current table occupancy with strict tenant/outlet isolation
  const occupancyResult = await sql<
    {
      status_id: number | null;
      guest_count: number | null;
      service_session_id: bigint | null;
      version: number | null;
      reservation_id: bigint | null;
      table_code: string;
      table_name: string;
    }
  >`
    SELECT 
      to2.status_id,
      to2.guest_count,
      to2.service_session_id,
      to2.version,
      to2.reservation_id,
      ot.code as table_code,
      ot.name as table_name
    FROM table_occupancy to2
    INNER JOIN outlet_tables ot ON to2.table_id = ot.id
      AND to2.company_id = ot.company_id
      AND to2.outlet_id = ot.outlet_id
    WHERE to2.company_id = ${companyId}
      AND to2.outlet_id = ${outletId}
      AND to2.table_id = ${tableId}
  `.execute(db);

  const occupancy = occupancyResult.rows.length > 0 ? occupancyResult.rows[0] : null;

  // 2. Query active session if exists
  let activeSession: {
    id: number;
    status_id: number;
    started_at: string;
  } | null = null;

  if (occupancy?.service_session_id) {
    const sessionResult = await sql<
      {
        id: bigint;
        status_id: number;
        started_at: Date;
      }
    >`
      SELECT 
        id,
        status_id,
        started_at
      FROM table_service_sessions
      WHERE company_id = ${companyId}
        AND outlet_id = ${outletId}
        AND id = ${occupancy.service_session_id}
        AND status_id IN (${ServiceSessionStatus.ACTIVE}, ${ServiceSessionStatus.LOCKED_FOR_PAYMENT})
      LIMIT 1
    `.execute(db);

    if (sessionResult.rows.length > 0) {
      const sessionRow = sessionResult.rows[0];
      activeSession = {
        id: Number(sessionRow.id),
        status_id: sessionRow.status_id,
        started_at: sessionRow.started_at.toISOString()
      };
    }
  }

  // 3. Build and return canonical conflict payload
  return {
    current_occupancy: {
      status_id: occupancy?.status_id ?? TableOccupancyStatus.AVAILABLE,
      guest_count: occupancy?.guest_count ?? null,
      service_session_id: occupancy?.service_session_id 
        ? Number(occupancy.service_session_id) 
        : null,
    },
    active_session: activeSession ? {
      id: Number(activeSession.id),
      status_id: activeSession.status_id,
      started_at: activeSession.started_at,
    } : null,
    current_version: occupancy?.version ?? 1,
    conflict_reason: 'Table state has changed since last sync (optimistic version mismatch)'
  };
}

// ============================================================================
// SCOPE C: IDEMPOTENT PUSH CORE IMPLEMENTATION
// ============================================================================

/**
 * Push table events from POS to API
 * 
 * This function processes events from offline POS devices and applies them
 * to the server's table state. It handles:
 * - Idempotent event processing via clientTxId
 * - Optimistic concurrency control via expectedVersion
 * - Conflict detection and resolution
 * - Table occupancy transitions
 * - Service session lifecycle
 * 
 * @param params - Push parameters including company, outlet, events, and actor
 * @returns Push result with per-event status and server timestamps
 * @throws Error if validation fails or database error occurs
 * 
 * @scope Scope C - Event Processing and Application
 */
export async function pushTableEvents(
  params: PushTableEventsParams
): Promise<PushTableEventsResult> {
  const db = getDb();
  const results: PushTableEventResult[] = [];

  // Convert string IDs to bigints for database operations
  const companyId = BigInt(params.companyId);
  const outletId = BigInt(params.outletId);

  // Process each event in order
  for (const event of params.events) {
    const clientTxId = event.client_tx_id;
    
    // Validate table_id before conversion
    if (event.table_id == null || Number.isNaN(event.table_id) || event.table_id <= 0) {
      results.push({
        clientTxId,
        status: 'ERROR',
        errorMessage: `Invalid table_id: ${event.table_id}`,
      });
      continue;
    }
    
    const tableId = BigInt(event.table_id);

    let attempt = 0;
    while (attempt < MAX_SYNC_RETRIES) {
      attempt += 1;

      try {
        // 1. TABLE EXISTENCE CHECK: Validate table exists for this company/outlet
        const tableResult = await sql<{ id: bigint }>`
          SELECT id FROM outlet_tables
          WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id = ${tableId}
        `.execute(db);

        if (tableResult.rows.length === 0) {
          results.push({
            clientTxId,
            status: "ERROR",
            errorMessage: `Table ${event.table_id} not found`,
          });
          break;
        }

        // 2. IDEMPOTENCY CHECK: Query existing event before transactional apply
        const existingEventResult = await sql<{ occupancy_version_after: number | null }>`
          SELECT occupancy_version_after
          FROM table_events
          WHERE company_id = ${companyId}
            AND outlet_id = ${outletId}
            AND client_tx_id = ${clientTxId}
          LIMIT 1
        `.execute(db);

        if (existingEventResult.rows.length > 0) {
          results.push({
            clientTxId,
            status: 'DUPLICATE',
            tableVersion: existingEventResult.rows[0].occupancy_version_after ?? undefined,
          });
          break;
        }

        // 3. TRANSACTIONAL MUTATION APPLY
        const result = await applyTableEventWithTransaction({
          db,
          companyId,
          outletId,
          tableId,
          event,
          actorId: params.actorId,
        });

        results.push(result);
        break;
      } catch (error) {
        if ((error as { code?: string })?.code === 'ER_DUP_ENTRY') {
          const existingEventDupResult = await sql<{ occupancy_version_after: number | null }>`
            SELECT occupancy_version_after
            FROM table_events
            WHERE company_id = ${companyId}
              AND outlet_id = ${outletId}
              AND client_tx_id = ${clientTxId}
            LIMIT 1
          `.execute(db);

          results.push({
            clientTxId,
            status: 'DUPLICATE',
            tableVersion: existingEventDupResult.rows.length > 0
              ? (existingEventDupResult.rows[0].occupancy_version_after ?? undefined)
              : undefined,
          });
          break;
        }

        if (isRetryableDbError(error) && attempt < MAX_SYNC_RETRIES) {
          const backoffMs = BASE_RETRY_DELAY_MS * (2 ** (attempt - 1));
          await sleep(backoffMs);
          continue;
        }

        // Log error and return ERROR status for this event
        console.error(`Error processing table event ${clientTxId}:`, error);

        results.push({
          clientTxId,
          status: 'ERROR',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        break;
      }
    }
  }

  return {
    results,
    syncTimestamp: new Date().toISOString(),
  };
}

/**
 * Apply a single table event within a database transaction
 * Handles all event types: HOLD, SEAT, RELEASE, MERGE, SPLIT, etc.
 */
async function applyTableEventWithTransaction(params: {
  db: KyselySchema;
  companyId: bigint;
  outletId: bigint;
  tableId: bigint;
  event: PushTableEventsParams['events'][number];
  actorId: number;
}): Promise<PushTableEventResult> {
  const { db, companyId, outletId, tableId, event, actorId } = params;

  // Guard: Validate required parameters
  if (tableId == null || companyId == null || outletId == null) {
    throw new Error(`Missing required parameters: tableId=${tableId}, companyId=${companyId}, outletId=${outletId}`);
  }

  return await db.transaction().execute(async (trx) => {
    const lockedRowsResult = await sql<{
      status_id: number | null;
      version: number | null;
      service_session_id: bigint | null;
      reservation_id: bigint | null;
      guest_count: number | null;
      reserved_until: Date | null;
    }>`
      SELECT
        status_id,
        version,
        service_session_id,
        reservation_id,
        guest_count,
        reserved_until
      FROM table_occupancy
      WHERE company_id = ${companyId}
        AND outlet_id = ${outletId}
        AND table_id = ${tableId}
      FOR UPDATE
    `.execute(trx);

    const lockedRows = lockedRowsResult.rows;
    const currentOccupancy = lockedRows.length > 0 ? lockedRows[0] : null;
    const currentVersion = Number(currentOccupancy?.version ?? 1);
    const currentStatus = Number(currentOccupancy?.status_id ?? TableOccupancyStatus.AVAILABLE);

    if (event.expected_table_version !== currentVersion) {
      const conflictPayload = await buildConflictPayload(tableId, companyId, outletId);
      const conflictReason = `Optimistic version mismatch: expected ${event.expected_table_version}, got ${currentVersion}`;

      await sql`
        INSERT INTO table_events
         (company_id, outlet_id, table_id, event_type_id, client_tx_id,
          occupancy_version_before, occupancy_version_after, event_data,
          status_id_before, status_id_after, service_session_id, reservation_id,
          occurred_at, created_at, created_by, is_conflict, conflict_reason)
         VALUES (
           ${companyId}, ${outletId}, ${tableId}, ${event.event_type}, ${event.client_tx_id},
           ${currentVersion}, ${currentVersion}, ${JSON.stringify({
             ...event.payload,
             _conflict_metadata: {
               attempted_version: event.expected_table_version,
               actual_version: currentVersion,
             },
           })},
           ${currentStatus}, ${currentStatus},
           ${currentOccupancy?.service_session_id ?? null},
           ${currentOccupancy?.reservation_id ?? null},
           ${new Date(event.recorded_at)}, NOW(), ${actorId}, 1, ${conflictReason}
         )
      `.execute(trx);

      return {
        clientTxId: event.client_tx_id,
        status: 'CONFLICT' as const,
        tableVersion: currentVersion,
        conflictPayload,
      };
    }

    const eventType = event.event_type;
    const clientTxId = event.client_tx_id;
    const newVersion = currentVersion + 1;
    let statusIdAfter = currentStatus;
    let serviceSessionId: bigint | null = currentOccupancy?.service_session_id ?? null;
    let eventReservationId: bigint | null = currentOccupancy?.reservation_id ?? null;
    let eventData: Record<string, unknown> = { ...event.payload };

    // Process event based on type
    switch (eventType) {
      case TableEventType.TABLE_OPENED: {
        // SEAT: Create service session and update occupancy to OCCUPIED
        const guestCount = event.payload.guest_count as number ?? 1;
        const guestName = event.payload.guest_name as string | null ?? null;
        const reservationId = event.payload.reservation_id
          ? BigInt(event.payload.reservation_id as string)
          : null;

        // Validate table is not already occupied
        if (currentStatus === TableOccupancyStatus.OCCUPIED) {
          throw new Error('Table is already occupied');
        }

        // Create service session
        const sessionInsertResult = await sql`
          INSERT INTO table_service_sessions
           (company_id, outlet_id, table_id, status_id, started_at, guest_count, guest_name, notes, created_at, updated_at, created_by)
           VALUES (${Number(companyId)}, ${Number(outletId)}, ${Number(tableId)}, ${ServiceSessionStatus.ACTIVE}, NOW(), ${guestCount}, ${guestName}, ${event.payload.notes ?? null}, NOW(), NOW(), ${actorId})
        `.execute(trx);

        if (sessionInsertResult.insertId === undefined) {
          throw new Error('Failed to insert service session: insertId is undefined');
        }
        serviceSessionId = BigInt(sessionInsertResult.insertId);
        statusIdAfter = TableOccupancyStatus.OCCUPIED;
        eventReservationId = reservationId;

        // Update occupancy
        await updateOccupancy(trx, {
          companyId,
          outletId,
          tableId,
          statusId: TableOccupancyStatus.OCCUPIED,
          serviceSessionId,
          guestCount,
          reservationId,
          reservedUntil: null,
          newVersion,
          actorId,
        });

        eventData = {
          ...eventData,
          service_session_id: String(serviceSessionId),
          guest_count: guestCount,
        };
        break;
      }

      case TableEventType.TABLE_CLOSED: {
        // RELEASE: Close service session and reset occupancy to AVAILABLE
        if (currentStatus !== TableOccupancyStatus.OCCUPIED) {
          throw new Error('Table is not occupied');
        }

        // Close existing service session
        if (serviceSessionId) {
          await sql`
            UPDATE table_service_sessions
             SET status_id = ${ServiceSessionStatus.CLOSED},
                 closed_at = NOW(),
                 updated_at = NOW(),
                 updated_by = ${actorId}
             WHERE id = ${serviceSessionId}
               AND company_id = ${companyId}
               AND outlet_id = ${outletId}
          `.execute(trx);
        }

        statusIdAfter = TableOccupancyStatus.AVAILABLE;
        serviceSessionId = null;

        // Reset occupancy to AVAILABLE
        await resetOccupancy(trx, {
          companyId,
          outletId,
          tableId,
          newVersion,
          actorId,
          notes: event.payload.notes as string | null ?? null,
        });

        break;
      }

      case TableEventType.RESERVATION_CREATED: {
        // HOLD: Reserve table
        if (currentStatus !== TableOccupancyStatus.AVAILABLE) {
          throw new Error('Table is not available for reservation');
        }

        const reservedUntil = event.payload.reserved_until
          ? new Date(event.payload.reserved_until as string)
          : new Date(Date.now() + 30 * 60 * 1000); // Default 30 min hold

        // Get or create reservation_id - trigger requires reservation_id for RESERVED status
        let reservationId: bigint;
        if (event.payload.reservation_id) {
          reservationId = BigInt(event.payload.reservation_id as string);

          const reservationRowsResult = await sql<{ id: bigint; table_id: bigint | null }>`
            SELECT id, table_id
            FROM reservations
            WHERE id = ${reservationId}
              AND company_id = ${companyId}
              AND outlet_id = ${outletId}
            LIMIT 1
          `.execute(trx);

          const reservationRows = reservationRowsResult.rows;
          if (reservationRows.length === 0) {
            throw new Error(`Reservation ${reservationId} not found for company/outlet scope`);
          }

          const reservationTableId = reservationRows[0].table_id;
          if (reservationTableId !== null && BigInt(String(reservationTableId)) !== tableId) {
            throw new Error(
              `Reservation ${reservationId} table mismatch: expected table ${tableId}, got ${reservationTableId}`
            );
          }
        } else {
          // Create a placeholder reservation for hold operations without existing reservation
          const guestName = (event.payload.customer_name ?? event.payload.guest_name) as string | null ?? 'Walk-in';
          const guestCount = (event.payload.guest_count ?? event.payload.party_size) as number ?? 1;
          const reservationStartTs = reservedUntil.getTime();
          const effectiveDurationMinutes = await resolveReservationDefaultDurationMinutes(Number(companyId));
          const reservationEndTs = reservationStartTs + effectiveDurationMinutes * 60000;
          const hasReservationStartTs = await columnExists(db, 'reservations', 'reservation_start_ts');
          const hasReservationEndTs = await columnExists(db, 'reservations', 'reservation_end_ts');

          let reservationInsertResult;
          if (hasReservationStartTs && hasReservationEndTs) {
            reservationInsertResult = await sql`
              INSERT INTO reservations
               (company_id, outlet_id, table_id, customer_name, guest_count,
                reservation_at, reservation_start_ts, reservation_end_ts,
                status, created_at, updated_at)
               VALUES (${companyId}, ${outletId}, ${tableId}, ${guestName}, ${guestCount},
                 ${reservedUntil}, ${reservationStartTs}, ${reservationEndTs}, 'BOOKED', NOW(), NOW())
            `.execute(trx);
          } else {
            reservationInsertResult = await sql`
              INSERT INTO reservations
               (company_id, outlet_id, table_id, customer_name, guest_count,
                reservation_at, status, created_at, updated_at)
               VALUES (${companyId}, ${outletId}, ${tableId}, ${guestName}, ${guestCount},
                 ${reservedUntil}, 'BOOKED', NOW(), NOW())
            `.execute(trx);
          }
          if (reservationInsertResult.insertId === undefined) {
            throw new Error('Failed to insert reservation: insertId is undefined');
          }
          reservationId = BigInt(reservationInsertResult.insertId);
        }

        statusIdAfter = TableOccupancyStatus.RESERVED;
        eventReservationId = reservationId;

        // Use upsert helper to handle both INSERT and UPDATE cases
        await updateOccupancy(trx, {
          companyId,
          outletId,
          tableId,
          statusId: TableOccupancyStatus.RESERVED,
          serviceSessionId: null,
          guestCount: null,
          reservationId,
          reservedUntil,
          newVersion,
          actorId,
        });

        eventData = {
          ...eventData,
          reserved_until: reservedUntil.toISOString(),
          reservation_id: String(reservationId),
        };
        break;
      }

      case TableEventType.STATUS_CHANGED: {
        // Direct status change (e.g., to CLEANING, OUT_OF_SERVICE)
        const newStatusId = event.payload.status_id as number;

        if (!Object.values(TableOccupancyStatus).includes(newStatusId as TableOccupancyStatusType)) {
          throw new Error(`Invalid table status: ${newStatusId}`);
        }

        statusIdAfter = newStatusId;

        // Use upsert helper to handle both INSERT and UPDATE cases
        await updateOccupancy(trx, {
          companyId,
          outletId,
          tableId,
          statusId: newStatusId,
          serviceSessionId: currentOccupancy?.service_session_id ?? null,
          guestCount: currentOccupancy?.guest_count ?? null,
          reservationId: currentOccupancy?.reservation_id ?? null,
          reservedUntil: currentOccupancy?.reserved_until ?? null,
          newVersion,
          actorId,
        });

        break;
      }

      case TableEventType.GUEST_COUNT_CHANGED: {
        // Update guest count without changing status
        const newGuestCount = event.payload.guest_count as number;

        if (currentStatus !== TableOccupancyStatus.OCCUPIED) {
          throw new Error('Cannot change guest count - table is not occupied');
        }

        await sql`
          UPDATE table_occupancy
           SET guest_count = ${newGuestCount},
               version = ${newVersion},
               updated_at = NOW(),
               updated_by = ${actorId}
           WHERE company_id = ${companyId}
             AND outlet_id = ${outletId}
             AND table_id = ${tableId}
        `.execute(trx);

        // Also update session guest count
        if (serviceSessionId) {
          await sql`
            UPDATE table_service_sessions
             SET guest_count = ${newGuestCount},
                 updated_at = NOW(),
                 updated_by = ${actorId}
             WHERE id = ${serviceSessionId}
               AND company_id = ${companyId}
               AND outlet_id = ${outletId}
          `.execute(trx);
        }

        break;
      }

      case TableEventType.TABLE_TRANSFERRED: {
        // Transfer session to different table (merge/split operations)
        const targetTableId = event.payload.target_table_id
          ? BigInt(event.payload.target_table_id as string)
          : null;

        if (!targetTableId) {
          throw new Error('Target table ID required for transfer');
        }

        if (currentStatus !== TableOccupancyStatus.OCCUPIED) {
          throw new Error('Cannot transfer - table is not occupied');
        }

        const targetTableResult = await sql<{ id: bigint }>`
          SELECT id
          FROM outlet_tables
          WHERE id = ${targetTableId}
            AND company_id = ${companyId}
            AND outlet_id = ${outletId}
            AND is_active = 1
          LIMIT 1
        `.execute(trx);

        if (targetTableResult.rows.length === 0) {
          throw new Error(`Target table ${targetTableId} not found in outlet scope`);
        }

        // Update service session to point to new table
        if (serviceSessionId) {
          await sql`
            UPDATE table_service_sessions
             SET table_id = ${targetTableId},
                 updated_at = NOW(),
                 updated_by = ${actorId}
             WHERE id = ${serviceSessionId}
               AND company_id = ${companyId}
               AND outlet_id = ${outletId}
          `.execute(trx);
        }

        // Reset current table
        await resetOccupancy(trx, {
          companyId,
          outletId,
          tableId,
          newVersion,
          actorId,
          notes: `Transferred to table ${targetTableId}`,
        });

        statusIdAfter = TableOccupancyStatus.AVAILABLE;
        serviceSessionId = null;

        eventData = {
          ...eventData,
          target_table_id: String(targetTableId),
        };
        break;
      }

      default: {
        // Unknown event type - store event but don't mutate state
        console.warn(`Unknown table event type: ${eventType}`);

        // Still increment version and log event
        await sql`
          UPDATE table_occupancy
           SET version = ${newVersion},
               updated_at = NOW(),
               updated_by = ${actorId}
           WHERE company_id = ${companyId}
             AND outlet_id = ${outletId}
             AND table_id = ${tableId}
        `.execute(trx);

        eventData = {
          ...eventData,
          warning: `Unknown event type: ${eventType}`,
        };
      }
    }

    // 4. INSERT EVENT INTO TABLE_EVENTS (append-only log)
    await sql`
      INSERT INTO table_events
       (company_id, outlet_id, table_id, event_type_id, client_tx_id,
        occupancy_version_before, occupancy_version_after, event_data,
        status_id_before, status_id_after, service_session_id, reservation_id,
        occurred_at, created_at, created_by)
       VALUES (
         ${companyId}, ${outletId}, ${tableId}, ${eventType}, ${clientTxId},
         ${currentVersion}, ${newVersion}, ${eventData ? JSON.stringify(eventData) : null},
         ${currentStatus}, ${statusIdAfter}, ${serviceSessionId}, ${eventReservationId},
         ${new Date(event.recorded_at)}, NOW(), ${actorId}
       )
    `.execute(trx);

    return {
      clientTxId,
      status: 'OK' as const,
      tableVersion: newVersion,
    };
  });
}

/**
 * Helper: Update table occupancy within transaction
 */
async function updateOccupancy(
  trx: any,
  params: {
    companyId: bigint;
    outletId: bigint;
    tableId: bigint;
    statusId: number;
    serviceSessionId: bigint | null;
    guestCount: number | null;
    reservationId: bigint | null;
    reservedUntil: Date | null;
    newVersion: number;
    actorId: number;
  }
): Promise<void> {
  const { companyId, outletId, tableId, statusId, serviceSessionId, guestCount, reservationId, reservedUntil, newVersion, actorId } = params;

  // Check if occupancy record exists
  const existingResult = await sql<{ id: bigint }>`
    SELECT id FROM table_occupancy
    WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND table_id = ${tableId}
  `.execute(trx);

  if (existingResult.rows.length > 0) {
    // Update existing
    await sql`
      UPDATE table_occupancy
       SET status_id = ${statusId},
           service_session_id = ${serviceSessionId},
           guest_count = ${guestCount},
           reservation_id = ${reservationId},
           reserved_until = ${reservedUntil},
           version = ${newVersion},
           occupied_at = CASE WHEN ${statusId} = ${TableOccupancyStatus.OCCUPIED} THEN NOW() ELSE occupied_at END,
           updated_at = NOW(),
           updated_by = ${actorId}
       WHERE company_id = ${companyId}
         AND outlet_id = ${outletId}
         AND table_id = ${tableId}
    `.execute(trx);
  } else {
    // Create new occupancy record
    await sql`
      INSERT INTO table_occupancy
       (company_id, outlet_id, table_id, status_id, service_session_id,
        guest_count, reservation_id, reserved_until, version, occupied_at, created_at, updated_at, created_by)
       VALUES (
         ${companyId}, ${outletId}, ${tableId}, ${statusId}, ${serviceSessionId},
         ${guestCount}, ${reservationId}, ${reservedUntil}, ${newVersion},
         CASE WHEN ${statusId} = ${TableOccupancyStatus.OCCUPIED} THEN NOW() ELSE NULL END,
         NOW(), NOW(), ${actorId}
       )
    `.execute(trx);
  }
}

/**
 * Helper: Reset occupancy to AVAILABLE state within transaction
 */
async function resetOccupancy(
  trx: any,
  params: {
    companyId: bigint;
    outletId: bigint;
    tableId: bigint;
    newVersion: number;
    actorId: number;
    notes: string | null;
  }
): Promise<void> {
  const { companyId, outletId, tableId, newVersion, actorId, notes } = params;

  await sql`
    UPDATE table_occupancy
     SET status_id = ${TableOccupancyStatus.AVAILABLE},
         service_session_id = NULL,
         guest_count = NULL,
         reservation_id = NULL,
         occupied_at = NULL,
         notes = ${notes},
         version = ${newVersion},
         updated_at = NOW(),
         updated_by = ${actorId}
     WHERE company_id = ${companyId}
       AND outlet_id = ${outletId}
       AND table_id = ${tableId}
  `.execute(trx);
}

// ============================================================================
// PULL OPERATIONS (Scope E - Complete)
// ============================================================================

// Default and max limits for pagination
const DEFAULT_PULL_LIMIT = 100;
const MAX_PULL_LIMIT = 500;

/**
 * Parse cursor string into type and value
 * Cursor can be:
 * - table_events.id (numeric)
 * - recorded_at timestamp (ISO string)
 * - null/undefined (initial sync)
 */
function parseCursor(cursor?: string): { type: 'id' | 'timestamp' | 'none'; value: string | null } {
  if (!cursor) return { type: 'none', value: null };
  if (/^\d+$/.test(cursor)) return { type: 'id', value: cursor };
  return { type: 'timestamp', value: cursor };
}

/**
 * Validate and normalize limit parameter
 */
function normalizeLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_PULL_LIMIT;
  return Math.min(limit, MAX_PULL_LIMIT);
}

/**
 * Calculate staleness in milliseconds
 */
function calculateStaleness(lastUpdated: Date | null | undefined, createdAt?: Date | null): number {
  const now = Date.now();
  const referenceTime = lastUpdated ?? createdAt;
  if (!referenceTime) return 0;
  return now - new Date(referenceTime).getTime();
}

/**
 * Pull table state from API to POS
 *
 * This function retrieves current table state and incremental events
 * for POS devices to sync down. It handles:
 * - Pagination via cursor-based iteration
 * - Table occupancy snapshots
 * - Incremental event streaming
 * - Version tracking for optimistic locking
 *
 * @param params - Pull parameters including company, outlet, cursor, and limit
 * @returns Pull result with table snapshots, events, and pagination info
 * @throws Error if validation fails or database error occurs
 *
 * @scope Scope E - Pull Query and Response Assembly
 */
export async function pullTableState(
  params: PullTableStateParams
): Promise<PullTableStateResult> {
  const db = getDb();
  const limit = normalizeLimit(params.limit);

  // Parse cursor for pagination
  const cursorParsed = parseCursor(params.cursor);

  // ============================================================================
  // STEP 1: Query Current Table States
  // ============================================================================
  const tableRowsResult = await sql<{
    table_id: bigint;
    table_number: string;
    capacity: number | null;
    status_id: number | null;
    current_session_id: bigint | null;
    version: number | null;
    held_by: string | null;
    held_at: Date | null;
    last_updated: Date | null;
    created_at: Date;
  }>`
    SELECT
      ot.id as table_id,
      ot.code as table_number,
      ot.capacity,
      to2.status_id,
      to2.service_session_id as current_session_id,
      to2.version,
      to2.created_by as held_by,
      to2.updated_at as held_at,
      COALESCE(to2.updated_at, ot.updated_at) as last_updated,
      ot.created_at
    FROM outlet_tables ot
    LEFT JOIN table_occupancy to2 ON to2.table_id = ot.id
      AND to2.company_id = ot.company_id
      AND to2.outlet_id = ot.outlet_id
    WHERE ot.company_id = ${params.companyId}
      AND ot.outlet_id = ${params.outletId}
    ORDER BY ot.code
  `.execute(db);

  const tableRows = tableRowsResult.rows;

  // ============================================================================
  // STEP 2: Query Incremental Events
  // ============================================================================
  type EventRow = {
    id: bigint;
    table_id: bigint;
    event_type: number;
    payload: string | null;
    recorded_at: Date;
    actor_id: string | null;
  };

  let events: EventRow[];

  if (cursorParsed.type === 'id' && cursorParsed.value !== null) {
    // Cursor is a numeric ID - paginate by event ID
    const eventsResult = await sql<EventRow>`
      SELECT
        te.id,
        te.table_id,
        te.event_type_id as event_type,
        te.event_data as payload,
        te.occurred_at as recorded_at,
        te.created_by as actor_id
      FROM table_events te
      WHERE te.company_id = ${params.companyId}
        AND te.outlet_id = ${params.outletId}
        AND te.id > ${parseInt(cursorParsed.value, 10)}
      ORDER BY te.id ASC
      LIMIT ${limit + 1}
    `.execute(db);
    events = eventsResult.rows;
  } else if (cursorParsed.type === 'timestamp' && cursorParsed.value !== null) {
    // Cursor is a timestamp - paginate by occurred_at
    const eventsResult = await sql<EventRow>`
      SELECT
        te.id,
        te.table_id,
        te.event_type_id as event_type,
        te.event_data as payload,
        te.occurred_at as recorded_at,
        te.created_by as actor_id
      FROM table_events te
      WHERE te.company_id = ${params.companyId}
        AND te.outlet_id = ${params.outletId}
        AND te.occurred_at > ${cursorParsed.value}
      ORDER BY te.occurred_at ASC, te.id ASC
      LIMIT ${limit + 1}
    `.execute(db);
    events = eventsResult.rows;
  } else {
    // Initial sync - get most recent events (descending order for initial sync)
    const eventsResult = await sql<EventRow>`
      SELECT
        te.id,
        te.table_id,
        te.event_type_id as event_type,
        te.event_data as payload,
        te.occurred_at as recorded_at,
        te.created_by as actor_id
      FROM table_events te
      WHERE te.company_id = ${params.companyId}
        AND te.outlet_id = ${params.outletId}
      ORDER BY te.occurred_at DESC, te.id DESC
      LIMIT ${limit}
    `.execute(db);
    events = eventsResult.rows;
  }

  // ============================================================================
  // STEP 3: Pagination Logic
  // ============================================================================
  // For initial sync (type: 'none'), events are in DESC order, so no hasMore logic
  // For cursor-based sync, we fetch limit+1 to check for more

  let hasMore = false;
  let nextCursor: string | null = null;

  if (cursorParsed.type !== 'none') {
    // Cursor-based sync: events are in ASC order, we fetched limit+1
    hasMore = events.length > limit;
    if (hasMore) {
      events = events.slice(0, limit); // Remove extra event used for has_more check
    }
    // Generate next_cursor from last event ID
    nextCursor = events.length > 0 ? String(events[events.length - 1].id) : null;
  } else {
    // Initial sync: events are in DESC order, reverse them for consistent response
    events = events.reverse();
    // For initial sync, use the ID of the oldest event as cursor (first in reversed array)
    nextCursor = events.length > 0 ? String(events[events.length - 1].id) : null;
    // We can't easily determine hasMore for initial sync without an additional query
    // Default to false since we're fetching the most recent events
    hasMore = false;
  }

  // ============================================================================
  // STEP 4: Response Assembly
  // ============================================================================
  const now = new Date().toISOString();

  // Map table rows to snapshots with staleness calculation
  const tables: PullTableStateSnapshot[] = tableRows.map(t => ({
    tableId: Number(t.table_id),
    tableNumber: t.table_number,
    status: Number(t.status_id ?? TableOccupancyStatus.AVAILABLE),
    currentSessionId: t.current_session_id ? Number(t.current_session_id) : null,
    version: Number(t.version ?? 1),
    stalenessMs: calculateStaleness(t.last_updated, t.created_at),
  }));

  // Map event rows to event objects
  const mappedEvents: PullTableStateEvent[] = events.map(e => ({
    id: Number(e.id),
    tableId: Number(e.table_id),
    eventType: String(e.event_type),
    payload: e.payload ? JSON.parse(e.payload) : {},
    recordedAt: new Date(e.recorded_at).toISOString(),
  }));

  return {
    tables,
    events: mappedEvents,
    nextCursor,
    hasMore,
    syncTimestamp: now,
  };
}

// ============================================================================
// HELPER TYPES (For Scope C and E implementation)
// ============================================================================

/**
 * Error types for table sync operations
 * Will be used by Scope C and E implementations
 */
export class TableSyncValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TableSyncValidationError';
  }
}

export class TableSyncConflictError extends Error {
  constructor(
    message: string,
    public readonly conflictPayload: TableSyncConflictPayload
  ) {
    super(message);
    this.name = 'TableSyncConflictError';
  }
}

export class TableSyncNotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = 'TableSyncNotFoundError';
  }
}
