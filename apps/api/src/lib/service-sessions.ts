// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import {
  ServiceSessionStatus,
  ServiceSessionLineState,
  TableEventType,
  TableOccupancyStatus,
  TableEventTypeLabels,
  type ServiceSessionStatusType,
} from "@jurnapod/shared";

// ============================================================================
// ERROR CLASSES
// ============================================================================

export class SessionNotFoundError extends Error {
  constructor(sessionId: bigint | string) {
    super(`Service session ${sessionId} not found`);
  }
}

export class SessionConflictError extends Error {
  constructor(
    message: string,
    public readonly currentState?: ServiceSession
  ) {
    super(message);
  }
}

export class SessionValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidSessionStatusError extends Error {
  constructor(
    public readonly currentStatus: number,
    public readonly expectedStatus: number | number[],
    message?: string
  ) {
    const expected = Array.isArray(expectedStatus)
      ? expectedStatus.join(", ")
      : expectedStatus.toString();
    super(message || `Invalid session status: ${currentStatus} (expected: ${expected})`);
  }
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Service Session - represents a dine-in service session at a table
 * Maps to table_service_sessions table
 */
export interface ServiceSession {
  id: bigint;
  companyId: bigint;
  outletId: bigint;
  tableId: bigint;
  tableCode: string | null;
  tableName: string | null;
  statusId: ServiceSessionStatusType;
  statusLabel: string;
  startedAt: Date;
  lockedAt: Date | null;
  closedAt: Date | null;
  guestCount: number;
  guestName: string | null;
  notes: string | null;
  posOrderSnapshotId: string | null;
  reservationId: bigint | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: SessionLine[];
}

/**
 * Session Line - individual items in a service session
 * Maps to pos_order_snapshot_lines fields
 */
export interface SessionLine {
  id: bigint;
  sessionId: bigint;
  lineNumber: number;
  lineState: number;
  productId: bigint;
  productName: string;
  productSku: string | null;
  quantity: number;
  unitPrice: number; // Stored as decimal, represented as number
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  notes: string | null;
  isVoided: boolean;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Parameters for listing service sessions
 */
export interface ListSessionsParams {
  companyId: bigint;
  outletId: bigint;
  limit?: number;
  offset?: number;
  statusId?: ServiceSessionStatusType;
  tableId?: bigint;
  fromDate?: Date;
  toDate?: Date;
}

/**
 * Result of listing service sessions
 */
export interface ListSessionsResult {
  sessions: ServiceSession[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Input for adding a line to a session
 */
export interface AddSessionLineInput {
  companyId: bigint;
  outletId: bigint;
  sessionId: bigint;
  productId: bigint;
  productName: string;
  productSku?: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  taxAmount?: number;
  notes?: string;
  createdBy: string;
  clientTxId: string;
}

/**
 * Input for updating a session line
 */
export interface UpdateSessionLineInput {
  companyId: bigint;
  outletId: bigint;
  sessionId: bigint;
  lineId: bigint;
  quantity?: number;
  unitPrice?: number;
  discountAmount?: number;
  taxAmount?: number;
  notes?: string;
  isVoided?: boolean;
  voidReason?: string;
  updatedBy: string;
  clientTxId: string;
}

/**
 * Input for removing a session line
 */
export interface RemoveSessionLineInput {
  companyId: bigint;
  outletId: bigint;
  sessionId: bigint;
  lineId: bigint;
  updatedBy: string;
  clientTxId: string;
}

/**
 * Input for locking a session for payment
 */
export interface LockSessionInput {
  companyId: bigint;
  outletId: bigint;
  sessionId: bigint;
  clientTxId: string;
  posOrderSnapshotId?: string;
  notes?: string;
  updatedBy: string;
}

/**
 * Input for closing a session
 */
export interface CloseSessionInput {
  companyId: bigint;
  outletId: bigint;
  sessionId: bigint;
  clientTxId: string;
  notes?: string;
  updatedBy: string;
}

export interface FinalizeSessionBatchInput {
  companyId: bigint;
  outletId: bigint;
  sessionId: bigint;
  clientTxId: string;
  notes?: string;
  updatedBy: string;
}

export interface FinalizeSessionBatchResult {
  sessionId: bigint;
  batchNo: number;
  sessionVersion: number;
  syncedLinesCount: number;
}

export interface AdjustSessionLineInput {
  companyId: bigint;
  outletId: bigint;
  sessionId: bigint;
  lineId: bigint;
  action: "CANCEL" | "REDUCE_QTY";
  qtyDelta?: number;
  reason: string;
  clientTxId: string;
  updatedBy: string;
}

export interface AdjustSessionLineResult {
  line: SessionLine;
  sessionVersion: number;
}

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

interface ServiceSessionDbRow extends RowDataPacket {
  id: number;
  company_id: number;
  outlet_id: number;
  table_id: number;
  table_code: string | null;
  table_name: string | null;
  status_id: number;
  started_at: string;
  locked_at: string | null;
  closed_at: string | null;
  guest_count: number;
  guest_name: string | null;
  notes: string | null;
  pos_order_snapshot_id: string | null;
  reservation_id: number | null;
  session_version?: number;
  last_finalized_batch_no?: number;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionLineDbRow extends RowDataPacket {
  id: number;
  session_id: number;
  line_number: number;
  batch_no?: number | null;
  line_state?: number;
  product_id: number;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  unit_price: string; // DECIMAL stored as string
  discount_amount: string; // DECIMAL stored as string
  tax_amount: string; // DECIMAL stored as string
  line_total: string; // DECIMAL stored as string
  notes: string | null;
  is_voided: number; // TINYINT(1)
  voided_at: string | null;
  void_reason: string | null;
  adjustment_parent_line_id?: number | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// READ-SIDE QUERIES
// ============================================================================

/**
 * Get a single service session by ID with lines
 * Strict company_id + outlet_id scoping enforced
 */
export async function getSession(
  companyId: bigint,
  outletId: bigint,
  sessionId: bigint
): Promise<ServiceSession | null> {
  const pool = getDbPool();

  // Get session with table info - scoped to company + outlet
  const [sessionRows] = await pool.execute<ServiceSessionDbRow[]>(
    `SELECT 
      s.id,
      s.company_id,
      s.outlet_id,
      s.table_id,
      ot.code as table_code,
      ot.name as table_name,
      s.status_id,
      s.started_at,
      s.locked_at,
      s.closed_at,
      s.guest_count,
      s.guest_name,
      s.notes,
      s.pos_order_snapshot_id,
      s.reservation_id,
      s.created_by,
      s.updated_by,
      s.created_at,
      s.updated_at
    FROM table_service_sessions s
    LEFT JOIN outlet_tables ot ON s.table_id = ot.id
      AND s.company_id = ot.company_id
      AND s.outlet_id = ot.outlet_id
    WHERE s.id = ?
      AND s.company_id = ?
      AND s.outlet_id = ?
    LIMIT 1`,
    [sessionId, companyId, outletId]
  );

  if (sessionRows.length === 0) {
    return null;
  }

  const sessionRow = sessionRows[0];
  
  // Get session lines
  const lines = await getSessionLines(sessionId);

  return mapDbRowToServiceSession(sessionRow, lines);
}

/**
 * List service sessions with filtering and pagination
 * Strict company_id + outlet_id scoping enforced
 */
export async function listSessions(
  params: ListSessionsParams
): Promise<ListSessionsResult> {
  const pool = getDbPool();
  
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;

  // Build WHERE conditions with mandatory company + outlet scoping
  const whereConditions: string[] = [
    "s.company_id = ?",
    "s.outlet_id = ?"
  ];
  const queryParams: (bigint | number | string | Date)[] = [
    params.companyId,
    params.outletId
  ];

  // Optional filters
  if (params.statusId !== undefined) {
    whereConditions.push("s.status_id = ?");
    queryParams.push(params.statusId);
  }

  if (params.tableId !== undefined) {
    whereConditions.push("s.table_id = ?");
    queryParams.push(params.tableId);
  }

  if (params.fromDate !== undefined) {
    whereConditions.push("s.started_at >= ?");
    queryParams.push(params.fromDate);
  }

  if (params.toDate !== undefined) {
    whereConditions.push("s.started_at <= ?");
    queryParams.push(params.toDate);
  }

  // Get total count with same scoping
  const countSql = `
    SELECT COUNT(*) as total 
    FROM table_service_sessions s 
    WHERE ${whereConditions.join(" AND ")}
  `;
  const [countRows] = await pool.execute<RowDataPacket[]>(countSql, queryParams);
  const total = Number(countRows[0]?.total ?? 0);

  // Get sessions with pagination
  // Build data params by adding limit/offset to the WHERE params
  const dataParams = [...queryParams, limit, offset];
  const [sessionRows] = await pool.execute<ServiceSessionDbRow[]>(
    `SELECT 
      s.id,
      s.company_id,
      s.outlet_id,
      s.table_id,
      ot.code as table_code,
      ot.name as table_name,
      s.status_id,
      s.started_at,
      s.locked_at,
      s.closed_at,
      s.guest_count,
      s.guest_name,
      s.notes,
      s.pos_order_snapshot_id,
      s.reservation_id,
      s.created_by,
      s.updated_by,
      s.created_at,
      s.updated_at
    FROM table_service_sessions s
    LEFT JOIN outlet_tables ot ON s.table_id = ot.id
      AND s.company_id = ot.company_id
      AND s.outlet_id = ot.outlet_id
    WHERE ${whereConditions.join(" AND ")}
    ORDER BY s.started_at DESC, s.id DESC
    LIMIT ? OFFSET ?`,
    dataParams
  );

  // Fetch lines for all sessions (can be optimized with a single query if needed)
  const sessions: ServiceSession[] = [];
  for (const row of sessionRows) {
    const lines = await getSessionLines(BigInt(row.id));
    sessions.push(mapDbRowToServiceSession(row, lines));
  }

  return {
    sessions,
    total,
    limit,
    offset
  };
}

/**
 * Get lines for a specific session
 * Scoped to session_id (company/outlet scoping via session lookup)
 */
export async function getSessionLines(sessionId: bigint): Promise<SessionLine[]> {
  const pool = getDbPool();

  const [rows] = await pool.execute<SessionLineDbRow[]>(
    `SELECT 
      id,
      session_id,
      line_number,
      product_id,
      product_name,
      product_sku,
      quantity,
      unit_price,
      discount_amount,
      tax_amount,
      line_total,
      notes,
      is_voided,
      voided_at,
      void_reason,
      created_at,
      updated_at
    FROM table_service_session_lines
    WHERE session_id = ?
    ORDER BY line_number ASC, id ASC`,
    [sessionId]
  );

  return rows.map(mapDbRowToSessionLine);
}

/**
 * Session Event - events related to a service session
 */
export interface SessionEvent {
  id: bigint;
  eventTypeId: number;
  eventTypeLabel: string;
  clientTxId: string;
  eventData: Record<string, unknown> | null;
  occurredAt: Date;
  createdBy: string;
}

interface SessionEventDbRow extends RowDataPacket {
  id: number;
  event_type_id: number;
  client_tx_id: string;
  event_data: string | null;
  occurred_at: string;
  created_by: string;
}

/**
 * Get recent events for a specific session
 * Returns last 20 events ordered by occurred_at DESC
 */
export async function getSessionEvents(
  companyId: bigint,
  outletId: bigint,
  sessionId: bigint,
  limit: number = 20
): Promise<SessionEvent[]> {
  const pool = getDbPool();

  const [rows] = await pool.execute<SessionEventDbRow[]>(
    `SELECT 
      id,
      event_type_id,
      client_tx_id,
      event_data,
      occurred_at,
      created_by
    FROM table_events
    WHERE company_id = ? 
      AND outlet_id = ? 
      AND service_session_id = ?
    ORDER BY occurred_at DESC, id DESC
    LIMIT ?`,
    [companyId, outletId, sessionId, limit]
  );

  return rows.map(row => ({
    id: BigInt(row.id),
    eventTypeId: row.event_type_id,
    eventTypeLabel: TableEventTypeLabels[row.event_type_id as keyof typeof TableEventTypeLabels] || "Unknown",
    clientTxId: row.client_tx_id,
    eventData: row.event_data ? JSON.parse(row.event_data) : null,
    occurredAt: new Date(row.occurred_at),
    createdBy: row.created_by
  }));
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapDbRowToServiceSession(
  row: ServiceSessionDbRow,
  lines: SessionLine[]
): ServiceSession {
  // Map status ID to label
  const statusLabels: Record<number, string> = {
    [ServiceSessionStatus.ACTIVE]: "Active",
    [ServiceSessionStatus.LOCKED_FOR_PAYMENT]: "Locked for Payment",
    [ServiceSessionStatus.CLOSED]: "Closed"
  };

  return {
    id: BigInt(row.id),
    companyId: BigInt(row.company_id),
    outletId: BigInt(row.outlet_id),
    tableId: BigInt(row.table_id),
    tableCode: row.table_code,
    tableName: row.table_name,
    statusId: row.status_id as ServiceSessionStatusType,
    statusLabel: statusLabels[row.status_id] || "Unknown",
    startedAt: new Date(row.started_at),
    lockedAt: row.locked_at ? new Date(row.locked_at) : null,
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
    guestCount: row.guest_count,
    guestName: row.guest_name,
    notes: row.notes,
    posOrderSnapshotId: row.pos_order_snapshot_id,
    reservationId: row.reservation_id ? BigInt(row.reservation_id) : null,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lines
  };
}

function mapDbRowToSessionLine(row: SessionLineDbRow): SessionLine {
  return {
    id: BigInt(row.id),
    sessionId: BigInt(row.session_id),
    lineNumber: row.line_number,
    lineState: row.line_state ?? ServiceSessionLineState.OPEN,
    productId: BigInt(row.product_id),
    productName: row.product_name,
    productSku: row.product_sku,
    quantity: row.quantity,
    unitPrice: parseFloat(row.unit_price),
    discountAmount: parseFloat(row.discount_amount),
    taxAmount: parseFloat(row.tax_amount),
    lineTotal: parseFloat(row.line_total),
    notes: row.notes,
    isVoided: row.is_voided === 1,
    voidedAt: row.voided_at ? new Date(row.voided_at) : null,
    voidReason: row.void_reason,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

// ============================================================================
// SESSION LINE MUTATIONS
// ============================================================================

/**
 * Check if a client transaction ID already exists in table_events
 * Used for idempotency
 */
async function checkClientTxIdExists(
  connection: PoolConnection,
  companyId: bigint,
  outletId: bigint,
  clientTxId: string
): Promise<boolean> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id FROM table_events WHERE company_id = ? AND outlet_id = ? AND client_tx_id = ? LIMIT 1`,
    [companyId, outletId, clientTxId]
  );
  return rows.length > 0;
}

/**
 * Get session with connection for transaction context
 * Strict company_id + outlet_id scoping enforced
 */
async function getSessionWithConnection(
  connection: PoolConnection,
  companyId: bigint,
  outletId: bigint,
  sessionId: bigint
): Promise<ServiceSessionDbRow | null> {
  const [rows] = await connection.execute<ServiceSessionDbRow[]>(
    `SELECT 
      s.id,
      s.company_id,
      s.outlet_id,
      s.table_id,
      ot.code as table_code,
      ot.name as table_name,
      s.status_id,
      s.started_at,
      s.locked_at,
      s.closed_at,
      s.guest_count,
      s.guest_name,
      s.notes,
      s.pos_order_snapshot_id,
      s.reservation_id,
      s.created_by,
      s.updated_by,
      s.created_at,
      s.updated_at
    FROM table_service_sessions s
    LEFT JOIN outlet_tables ot ON s.table_id = ot.id
      AND s.company_id = ot.company_id
      AND s.outlet_id = ot.outlet_id
    WHERE s.id = ?
      AND s.company_id = ?
      AND s.outlet_id = ?
    LIMIT 1`,
    [sessionId, companyId, outletId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get session line with connection for transaction context
 * Scoped to session_id with company/outlet scoping via JOIN
 */
async function getSessionLineWithConnection(
  connection: PoolConnection,
  companyId: bigint,
  outletId: bigint,
  sessionId: bigint,
  lineId: bigint
): Promise<SessionLineDbRow | null> {
  const [rows] = await connection.execute<SessionLineDbRow[]>(
    `SELECT 
      l.id,
      l.session_id,
      l.line_number,
      l.line_state,
      l.product_id,
      l.product_name,
      l.product_sku,
      l.quantity,
      l.unit_price,
      l.discount_amount,
      l.tax_amount,
      l.line_total,
      l.notes,
      l.is_voided,
      l.voided_at,
      l.void_reason,
      l.created_at,
      l.updated_at
    FROM table_service_session_lines l
    INNER JOIN table_service_sessions s ON l.session_id = s.id
      AND s.company_id = ?
      AND s.outlet_id = ?
    WHERE l.id = ?
      AND l.session_id = ?
    LIMIT 1`,
    [companyId, outletId, lineId, sessionId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Log a table event within a transaction
 */
async function logTableEventWithConnection(
  connection: PoolConnection,
  event: {
    companyId: bigint;
    outletId: bigint;
    tableId: bigint;
    eventTypeId: number;
    clientTxId: string;
    serviceSessionId: bigint;
    eventData: Record<string, unknown> | null;
    createdBy: string;
  }
): Promise<void> {
  await connection.execute(
    `INSERT INTO table_events
     (company_id, outlet_id, table_id, event_type_id, client_tx_id,
      service_session_id, event_data, occurred_at, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)`,
    [
      event.companyId,
      event.outletId,
      event.tableId,
      event.eventTypeId,
      event.clientTxId,
      event.serviceSessionId,
      event.eventData ? JSON.stringify(event.eventData) : null,
      event.createdBy
    ]
  );
}

/**
 * Add a line to a service session
 * - Checks session status is ACTIVE
 * - Idempotent via clientTxId check
 * - Inserts into table_service_session_lines
 * - Logs SESSION_LINE_ADDED event
 * - Lines are synced to pos_order_snapshot_lines on session close
 */
export async function addSessionLine(
  input: AddSessionLineInput
): Promise<SessionLine> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Check idempotency - duplicate clientTxId?
    // client_tx_id is unique per (company_id, outlet_id), so a duplicate key must replay,
    // not attempt a second write.
    const isDuplicate = await checkClientTxIdExists(connection, input.companyId, input.outletId, input.clientTxId);
    if (isDuplicate) {
      // Deterministic replay: resolve original line_id from the original
      // SESSION_LINE_ADDED event payload for this exact session.
      const [eventRows] = await connection.execute<RowDataPacket[]>(
        `SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(e.event_data, '$.lineId')) AS UNSIGNED) AS line_id
         FROM table_events e
         WHERE e.company_id = ?
           AND e.outlet_id = ?
           AND e.client_tx_id = ?
           AND e.service_session_id = ?
           AND e.event_type_id = ?
         LIMIT 1`,
        [
          input.companyId,
          input.outletId,
          input.clientTxId,
          input.sessionId,
          TableEventType.SESSION_LINE_ADDED,
        ]
      );

      await connection.commit();

      if (eventRows.length === 0) {
        throw new SessionConflictError("Duplicate transaction belongs to a different session");
      }

      const originalLineId = eventRows[0]?.line_id;
      if (originalLineId === undefined || originalLineId === null) {
        throw new SessionConflictError("Duplicate transaction found but original line reference missing");
      }

      const [existingRows] = await pool.execute<SessionLineDbRow[]>(
        `SELECT * FROM table_service_session_lines
         WHERE id = ? AND session_id = ?
         LIMIT 1`,
        [originalLineId, input.sessionId]
      );

      if (existingRows.length > 0) {
        return mapDbRowToSessionLine(existingRows[0]);
      }

      throw new SessionConflictError("Duplicate transaction found but original line not found");
    }

    // 2. Get session with company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    if (!sessionRow) {
      throw new SessionNotFoundError(input.sessionId);
    }

    // 3. Check session status is ACTIVE
    if (sessionRow.status_id !== ServiceSessionStatus.ACTIVE) {
      throw new InvalidSessionStatusError(
        sessionRow.status_id,
        ServiceSessionStatus.ACTIVE,
        `Cannot add line to session with status ${sessionRow.status_id}`
      );
    }

    // 4. Validate product belongs to company (tenant isolation)
    const [productRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM items WHERE id = ? AND company_id = ? LIMIT 1`,
      [input.productId, input.companyId]
    );

    if (productRows.length === 0) {
      throw new SessionValidationError("Product not found or not accessible");
    }

    // 6. Calculate line total
    const quantity = input.quantity;
    const unitPrice = input.unitPrice;
    const discountAmount = input.discountAmount ?? 0;
    const taxAmount = input.taxAmount ?? 0;
    const lineTotal = (quantity * unitPrice) - discountAmount + taxAmount;

    // 7. Get next line number for this session
    const [lineNumberRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COALESCE(MAX(line_number), 0) + 1 as next_line_number
       FROM table_service_session_lines
       WHERE session_id = ?`,
      [input.sessionId]
    );
    const lineNumber = lineNumberRows[0]?.next_line_number ?? 1;

    // 8. Insert the line
    const [insertResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO table_service_session_lines
       (session_id, line_number, product_id, product_name, product_sku,
        quantity, unit_price, discount_amount, tax_amount, line_total,
        notes, is_voided, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
      [
        input.sessionId,
        lineNumber,
        input.productId,
        input.productName,
        input.productSku ?? null,
        quantity,
        unitPrice,
        discountAmount,
        taxAmount,
        lineTotal,
        input.notes ?? null
      ]
    );

    const lineId = BigInt(insertResult.insertId);

    // 9. Log the event
    await logTableEventWithConnection(connection, {
      companyId: input.companyId,
      outletId: input.outletId,
      tableId: BigInt(sessionRow.table_id),
      eventTypeId: TableEventType.SESSION_LINE_ADDED,
      clientTxId: input.clientTxId,
      serviceSessionId: input.sessionId,
      eventData: {
        lineId: lineId.toString(),
        productId: input.productId.toString(),
        productName: input.productName,
        quantity,
        unitPrice,
        lineTotal
      },
      createdBy: input.createdBy
    });

    await connection.commit();

    // 10. Return the created line
    const [lineRows] = await connection.execute<SessionLineDbRow[]>(
      `SELECT * FROM table_service_session_lines WHERE id = ?`,
      [lineId]
    );

    if (lineRows.length === 0) {
      throw new Error("Failed to retrieve created line");
    }

    return mapDbRowToSessionLine(lineRows[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update a session line
 * - Checks session status is ACTIVE
 * - Updates table_service_session_lines
 * - Logs SESSION_LINE_UPDATED event
 * - Changes are synced to pos_order_snapshot_lines on session close
 */
export async function updateSessionLine(
  input: UpdateSessionLineInput
): Promise<SessionLine> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const isDuplicate = await checkClientTxIdExists(connection, input.companyId, input.outletId, input.clientTxId);
    if (isDuplicate) {
      const existingOnRetry = await getSessionLineWithConnection(
        connection,
        input.companyId,
        input.outletId,
        input.sessionId,
        input.lineId
      );

      await connection.commit();

      if (!existingOnRetry) {
        throw new SessionConflictError("Duplicate update transaction but line not found");
      }
      return mapDbRowToSessionLine(existingOnRetry);
    }

    // 1. Get session with company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    if (!sessionRow) {
      throw new SessionNotFoundError(input.sessionId);
    }

    // 2. Check session status is ACTIVE
    if (sessionRow.status_id !== ServiceSessionStatus.ACTIVE) {
      throw new InvalidSessionStatusError(
        sessionRow.status_id,
        ServiceSessionStatus.ACTIVE,
        `Cannot update line in session with status ${sessionRow.status_id}`
      );
    }

    // 3. Get the existing line with scoping
    const existingLine = await getSessionLineWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId,
      input.lineId
    );

    if (!existingLine) {
      throw new SessionNotFoundError(`Line ${input.lineId} in session ${input.sessionId}`);
    }

    // 4. Build update fields
    const updates: string[] = [];
    const values: (string | number | bigint | boolean | null)[] = [];
    const eventData: Record<string, unknown> = { lineId: input.lineId.toString() };

    if (input.quantity !== undefined) {
      updates.push("quantity = ?");
      values.push(input.quantity);
      eventData.quantity = input.quantity;
    }

    if (input.unitPrice !== undefined) {
      updates.push("unit_price = ?");
      values.push(input.unitPrice);
      eventData.unitPrice = input.unitPrice;
    }

    if (input.discountAmount !== undefined) {
      updates.push("discount_amount = ?");
      values.push(input.discountAmount);
      eventData.discountAmount = input.discountAmount;
    }

    if (input.taxAmount !== undefined) {
      updates.push("tax_amount = ?");
      values.push(input.taxAmount);
      eventData.taxAmount = input.taxAmount;
    }

    if (input.notes !== undefined) {
      updates.push("notes = ?");
      values.push(input.notes);
      eventData.notes = input.notes;
    }

    if (input.isVoided !== undefined) {
      updates.push("is_voided = ?, voided_at = ?");
      values.push(input.isVoided ? 1 : 0);
      values.push(input.isVoided ? new Date().toISOString() : null);
      eventData.isVoided = input.isVoided;
    }

    if (input.voidReason !== undefined) {
      updates.push("void_reason = ?");
      values.push(input.voidReason);
      eventData.voidReason = input.voidReason;
    }

    // Recalculate line total if price-related fields changed
    if (input.quantity !== undefined || input.unitPrice !== undefined || 
        input.discountAmount !== undefined || input.taxAmount !== undefined) {
      const quantity = input.quantity ?? existingLine.quantity;
      const unitPrice = input.unitPrice ?? parseFloat(existingLine.unit_price);
      const discountAmount = input.discountAmount ?? parseFloat(existingLine.discount_amount);
      const taxAmount = input.taxAmount ?? parseFloat(existingLine.tax_amount);
      const lineTotal = (quantity * unitPrice) - discountAmount + taxAmount;
      
      updates.push("line_total = ?");
      values.push(lineTotal);
      eventData.lineTotal = lineTotal;
    }

    updates.push("updated_at = NOW()");

    // 5. Execute update
    if (updates.length > 1) { // > 1 because we always add updated_at
      values.push(input.lineId);
      await connection.execute(
        `UPDATE table_service_session_lines
         SET ${updates.join(", ")}
         WHERE id = ?`,
        values
      );
    }

    // 6. Log the event
    await logTableEventWithConnection(connection, {
      companyId: input.companyId,
      outletId: input.outletId,
      tableId: BigInt(sessionRow.table_id),
      eventTypeId: TableEventType.SESSION_LINE_UPDATED,
      clientTxId: input.clientTxId,
      serviceSessionId: input.sessionId,
      eventData,
      createdBy: input.updatedBy
    });

    await connection.commit();

    // 7. Return updated line
    const [lineRows] = await connection.execute<SessionLineDbRow[]>(
      `SELECT * FROM table_service_session_lines WHERE id = ?`,
      [input.lineId]
    );

    if (lineRows.length === 0) {
      throw new Error("Failed to retrieve updated line");
    }

    return mapDbRowToSessionLine(lineRows[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Remove a session line
 * - Checks session status is ACTIVE
 * - Deletes from table_service_session_lines
 * - Logs SESSION_LINE_REMOVED event
 * - Changes are synced to pos_order_snapshot_lines on session close
 */
export async function removeSessionLine(
  input: RemoveSessionLineInput
): Promise<{ success: boolean; lineId: bigint }> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const isDuplicate = await checkClientTxIdExists(connection, input.companyId, input.outletId, input.clientTxId);
    if (isDuplicate) {
      await connection.commit();
      return { success: true, lineId: input.lineId };
    }

    // 1. Get session with company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    if (!sessionRow) {
      throw new SessionNotFoundError(input.sessionId);
    }

    // 2. Check session status is ACTIVE
    if (sessionRow.status_id !== ServiceSessionStatus.ACTIVE) {
      throw new InvalidSessionStatusError(
        sessionRow.status_id,
        ServiceSessionStatus.ACTIVE,
        `Cannot remove line from session with status ${sessionRow.status_id}`
      );
    }

    // 3. Verify the line exists with scoping
    const existingLine = await getSessionLineWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId,
      input.lineId
    );

    if (!existingLine) {
      throw new SessionNotFoundError(`Line ${input.lineId} in session ${input.sessionId}`);
    }

    // 4. Delete the line
    await connection.execute(
      `DELETE FROM table_service_session_lines WHERE id = ?`,
      [input.lineId]
    );

    // 5. Log the event
    await logTableEventWithConnection(connection, {
      companyId: input.companyId,
      outletId: input.outletId,
      tableId: BigInt(sessionRow.table_id),
      eventTypeId: TableEventType.SESSION_LINE_REMOVED,
      clientTxId: input.clientTxId,
      serviceSessionId: input.sessionId,
      eventData: {
        lineId: input.lineId.toString(),
        productId: existingLine.product_id.toString(),
        productName: existingLine.product_name,
        quantity: existingLine.quantity,
        lineTotal: parseFloat(existingLine.line_total)
      },
      createdBy: input.updatedBy
    });

    await connection.commit();

    return { success: true, lineId: input.lineId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function finalizeSessionBatch(
  input: FinalizeSessionBatchInput
): Promise<FinalizeSessionBatchResult> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingCheckpointRows] = await connection.execute<RowDataPacket[]>(
      `SELECT session_id, batch_no
       FROM table_service_session_checkpoints
       WHERE company_id = ?
         AND outlet_id = ?
         AND client_tx_id = ?
       LIMIT 1`,
      [input.companyId, input.outletId, input.clientTxId]
    );

    if (existingCheckpointRows.length > 0) {
      const batchNo = Number(existingCheckpointRows[0].batch_no);
      const sessionVersion = await getSessionVersionWithConnection(
        connection,
        input.companyId,
        input.outletId,
        BigInt(existingCheckpointRows[0].session_id)
      );
      const [countRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS count
         FROM table_service_session_lines
         WHERE session_id = ?
           AND batch_no = ?
           AND is_voided = 0`,
        [input.sessionId, batchNo]
      );

      await connection.commit();
      return {
        sessionId: input.sessionId,
        batchNo,
        sessionVersion,
        syncedLinesCount: Number(countRows[0]?.count ?? 0)
      };
    }

    const sessionRow = await getSessionWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    if (!sessionRow) {
      throw new SessionNotFoundError(input.sessionId);
    }

    if (sessionRow.status_id !== ServiceSessionStatus.ACTIVE) {
      throw new InvalidSessionStatusError(
        sessionRow.status_id,
        ServiceSessionStatus.ACTIVE,
        `Session must be ACTIVE to finalize batch. Current status: ${sessionRow.status_id}`
      );
    }

    const snapshotId = sessionRow.pos_order_snapshot_id;
    if (!snapshotId) {
      throw new SessionValidationError("Cannot finalize batch without linked pos order snapshot");
    }

    const [batchRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COALESCE(last_finalized_batch_no, 0) + 1 AS next_batch_no
       FROM table_service_sessions
       WHERE id = ?
         AND company_id = ?
         AND outlet_id = ?
       LIMIT 1`,
      [input.sessionId, input.companyId, input.outletId]
    );
    const nextBatchNo = Number(batchRows[0]?.next_batch_no ?? 1);

    const [finalizeResult] = await connection.execute<ResultSetHeader>(
      `UPDATE table_service_session_lines
       SET batch_no = ?,
           line_state = ?,
           updated_at = NOW()
       WHERE session_id = ?
         AND is_voided = 0
         AND COALESCE(line_state, ?) = ?`,
      [
        nextBatchNo,
        ServiceSessionLineState.FINALIZED,
        input.sessionId,
        ServiceSessionLineState.OPEN,
        ServiceSessionLineState.OPEN
      ]
    );

    if (finalizeResult.affectedRows === 0) {
      throw new SessionValidationError("No open lines to finalize");
    }

    const syncedLinesCount = await syncSnapshotLinesFromSession(connection, {
      snapshotId,
      companyId: input.companyId,
      outletId: input.outletId,
      sessionId: input.sessionId,
      onlyFinalized: true,
    });

    await connection.execute(
      `INSERT INTO table_service_session_checkpoints
       (company_id, outlet_id, session_id, batch_no, snapshot_id, finalized_at, finalized_by, client_tx_id)
       VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [
        input.companyId,
        input.outletId,
        input.sessionId,
        nextBatchNo,
        snapshotId,
        input.updatedBy,
        input.clientTxId
      ]
    );

    await connection.execute(
      `UPDATE table_service_sessions
       SET last_finalized_batch_no = ?,
           session_version = COALESCE(session_version, 1) + 1,
           updated_at = NOW(),
           updated_by = ?
       WHERE id = ?
         AND company_id = ?
         AND outlet_id = ?`,
      [nextBatchNo, input.updatedBy, input.sessionId, input.companyId, input.outletId]
    );

    const sessionVersion = await getSessionVersionWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    await logSessionEvent(connection, {
      companyId: input.companyId,
      outletId: input.outletId,
      tableId: BigInt(sessionRow.table_id),
      sessionId: input.sessionId,
      eventTypeId: TableEventType.SESSION_BATCH_FINALIZED,
      clientTxId: input.clientTxId,
      eventData: {
        batchNo: nextBatchNo,
        syncedLinesCount,
        snapshotId,
        notes: input.notes ?? null,
      },
      createdBy: input.updatedBy,
    });

    await connection.commit();

    return {
      sessionId: input.sessionId,
      batchNo: nextBatchNo,
      sessionVersion,
      syncedLinesCount,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function adjustSessionLine(
  input: AdjustSessionLineInput
): Promise<AdjustSessionLineResult> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const isDuplicate = await checkClientTxIdExists(connection, input.companyId, input.outletId, input.clientTxId);
    if (isDuplicate) {
      const lineOnRetry = await getSessionLineWithConnection(
        connection,
        input.companyId,
        input.outletId,
        input.sessionId,
        input.lineId
      );
      const sessionVersion = await getSessionVersionWithConnection(
        connection,
        input.companyId,
        input.outletId,
        input.sessionId
      );

      await connection.commit();

      if (!lineOnRetry) {
        throw new SessionConflictError("Duplicate adjust transaction but line not found");
      }
      return {
        line: mapDbRowToSessionLine(lineOnRetry),
        sessionVersion,
      };
    }

    const sessionRow = await getSessionWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    if (!sessionRow) {
      throw new SessionNotFoundError(input.sessionId);
    }

    if (sessionRow.status_id !== ServiceSessionStatus.ACTIVE) {
      throw new InvalidSessionStatusError(
        sessionRow.status_id,
        ServiceSessionStatus.ACTIVE,
        `Cannot adjust line in session with status ${sessionRow.status_id}`
      );
    }

    const existingLine = await getSessionLineWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId,
      input.lineId
    );

    if (!existingLine) {
      throw new SessionNotFoundError(`Line ${input.lineId} in session ${input.sessionId}`);
    }

    if (existingLine.is_voided === 1) {
      throw new SessionValidationError("Cannot adjust a voided line");
    }

    const currentLineState = Number(existingLine.line_state ?? ServiceSessionLineState.OPEN);

    if (input.action === "CANCEL") {
      await connection.execute(
        `UPDATE table_service_session_lines
         SET is_voided = 1,
             voided_at = NOW(),
             void_reason = ?,
             line_state = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [input.reason, ServiceSessionLineState.VOIDED, input.lineId]
      );
    } else {
      if (!input.qtyDelta || input.qtyDelta <= 0) {
        throw new SessionValidationError("qtyDelta is required for REDUCE_QTY adjustment");
      }
      if (input.qtyDelta >= existingLine.quantity) {
        throw new SessionValidationError("qtyDelta must be less than current quantity");
      }

      const newQuantity = existingLine.quantity - input.qtyDelta;
      const unitPrice = parseFloat(existingLine.unit_price);
      const currentDiscount = parseFloat(existingLine.discount_amount);
      const currentTax = parseFloat(existingLine.tax_amount);
      const perUnitDiscount = currentDiscount / existingLine.quantity;
      const perUnitTax = currentTax / existingLine.quantity;
      const newDiscount = perUnitDiscount * newQuantity;
      const newTax = perUnitTax * newQuantity;
      const newLineTotal = (newQuantity * unitPrice) - newDiscount + newTax;

      await connection.execute(
        `UPDATE table_service_session_lines
         SET quantity = ?,
             discount_amount = ?,
             tax_amount = ?,
             line_total = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [newQuantity, newDiscount, newTax, newLineTotal, input.lineId]
      );
    }

    await connection.execute(
      `UPDATE table_service_sessions
       SET session_version = COALESCE(session_version, 1) + 1,
           updated_at = NOW(),
           updated_by = ?
       WHERE id = ?
         AND company_id = ?
         AND outlet_id = ?`,
      [input.updatedBy, input.sessionId, input.companyId, input.outletId]
    );

    const snapshotId = sessionRow.pos_order_snapshot_id;
    if (snapshotId && currentLineState === ServiceSessionLineState.FINALIZED) {
      await syncSnapshotLinesFromSession(connection, {
        snapshotId,
        companyId: input.companyId,
        outletId: input.outletId,
        sessionId: input.sessionId,
        onlyFinalized: true,
      });
    }

    const sessionVersion = await getSessionVersionWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    await logSessionEvent(connection, {
      companyId: input.companyId,
      outletId: input.outletId,
      tableId: BigInt(sessionRow.table_id),
      sessionId: input.sessionId,
      eventTypeId: TableEventType.SESSION_LINE_ADJUSTED,
      clientTxId: input.clientTxId,
      eventData: {
        lineId: input.lineId.toString(),
        action: input.action,
        qtyDelta: input.qtyDelta ?? null,
        reason: input.reason,
      },
      createdBy: input.updatedBy,
    });

    const updatedLine = await getSessionLineWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId,
      input.lineId
    );

    if (!updatedLine) {
      throw new SessionNotFoundError(`Line ${input.lineId} in session ${input.sessionId}`);
    }

    await connection.commit();

    return {
      line: mapDbRowToSessionLine(updatedLine),
      sessionVersion,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ============================================================================
// SESSION CONTROL OPERATIONS
// ============================================================================

/**
 * Get session lines within a transaction context
 */
async function getSessionLinesWithConnection(
  connection: PoolConnection,
  sessionId: bigint
): Promise<SessionLine[]> {
  const [rows] = await connection.execute<SessionLineDbRow[]>(
    `SELECT 
      id,
      session_id,
      line_number,
      product_id,
      product_name,
      product_sku,
      quantity,
      unit_price,
      discount_amount,
      tax_amount,
      line_total,
      notes,
      is_voided,
      voided_at,
      void_reason,
      created_at,
      updated_at
    FROM table_service_session_lines
    WHERE session_id = ?
    ORDER BY line_number ASC, id ASC`,
    [sessionId]
  );

  return rows.map(mapDbRowToSessionLine);
}

/**
 * Log a session event within a transaction
 */
async function logSessionEvent(
  connection: PoolConnection,
  event: {
    companyId: bigint;
    outletId: bigint;
    tableId: bigint;
    sessionId: bigint;
    eventTypeId: number;
    clientTxId: string;
    eventData: Record<string, unknown> | null;
    createdBy: string;
  }
): Promise<void> {
  await connection.execute(
    `INSERT INTO table_events
     (company_id, outlet_id, table_id, event_type_id, client_tx_id,
      service_session_id, event_data, occurred_at, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)`,
    [
      event.companyId,
      event.outletId,
      event.tableId,
      event.eventTypeId,
      event.clientTxId,
      event.sessionId,
      event.eventData ? JSON.stringify(event.eventData) : null,
      event.createdBy
    ]
  );
}

async function getSessionVersionWithConnection(
  connection: PoolConnection,
  companyId: bigint,
  outletId: bigint,
  sessionId: bigint
): Promise<number> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT COALESCE(session_version, 1) AS session_version
     FROM table_service_sessions
     WHERE id = ?
       AND company_id = ?
       AND outlet_id = ?
     LIMIT 1`,
    [sessionId, companyId, outletId]
  );

  return rows.length > 0 ? Number(rows[0].session_version) : 1;
}

async function syncSnapshotLinesFromSession(
  connection: PoolConnection,
  params: {
    snapshotId: string;
    companyId: bigint;
    outletId: bigint;
    sessionId: bigint;
    onlyFinalized: boolean;
  }
): Promise<number> {
  await connection.execute(
    `DELETE FROM pos_order_snapshot_lines
     WHERE order_id = ?
       AND company_id = ?
       AND outlet_id = ?`,
    [params.snapshotId, params.companyId, params.outletId]
  );

  const finalizedFilter = params.onlyFinalized ? "AND COALESCE(l.line_state, 1) = ?" : "";
  const queryParams: (string | bigint | number)[] = [
    params.snapshotId,
    params.companyId,
    params.outletId,
    params.sessionId,
  ];

  if (params.onlyFinalized) {
    queryParams.push(ServiceSessionLineState.FINALIZED);
  }

  const [insertResult] = await connection.execute<ResultSetHeader>(
    `INSERT INTO pos_order_snapshot_lines
     (order_id, company_id, outlet_id, item_id, sku_snapshot, name_snapshot,
      item_type_snapshot, unit_price_snapshot, qty, discount_amount, updated_at, created_at)
     SELECT
       ? AS order_id,
       ? AS company_id,
       ? AS outlet_id,
       l.product_id AS item_id,
       MAX(l.product_sku) AS sku_snapshot,
       MAX(l.product_name) AS name_snapshot,
       'PRODUCT' AS item_type_snapshot,
       ROUND(MAX(l.unit_price), 2) AS unit_price_snapshot,
       SUM(l.quantity) AS qty,
       ROUND(SUM(l.discount_amount), 2) AS discount_amount,
       NOW() AS updated_at,
       NOW() AS created_at
     FROM table_service_session_lines l
     WHERE l.session_id = ?
       AND l.is_voided = 0
       ${finalizedFilter}
     GROUP BY l.product_id`,
    queryParams
  );

  return insertResult.affectedRows;
}

/**
 * Lock a session for payment
 * Transitions: ACTIVE (1) -> LOCKED_FOR_PAYMENT (2)
 * Logs SESSION_LOCKED event to table_events
 * Idempotent: duplicate clientTxId returns existing session without mutation
 */
export async function lockSessionForPayment(
  params: LockSessionInput
): Promise<ServiceSession> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Check idempotency - duplicate clientTxId?
    const isDuplicate = await checkClientTxIdExists(connection, params.companyId, params.outletId, params.clientTxId);
    if (isDuplicate) {
      // Return current session state (idempotency - return same result for same request)
      const sessionRow = await getSessionWithConnection(
        connection,
        params.companyId,
        params.outletId,
        params.sessionId
      );

      if (!sessionRow) {
        throw new SessionNotFoundError(params.sessionId);
      }

      const lines = await getSessionLinesWithConnection(connection, params.sessionId);

      await connection.commit();

      return mapDbRowToServiceSession(sessionRow, lines);
    }

    // 2. Get current session with strict company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      connection,
      params.companyId,
      params.outletId,
      params.sessionId
    );

    if (!sessionRow) {
      throw new SessionNotFoundError(params.sessionId);
    }

    const currentStatus = sessionRow.status_id;

    // 3. Validate status transition - must be ACTIVE
    if (currentStatus !== ServiceSessionStatus.ACTIVE) {
      throw new InvalidSessionStatusError(
        currentStatus,
        ServiceSessionStatus.ACTIVE,
        `Session must be ACTIVE to lock for payment. Current status: ${currentStatus}`
      );
    }

    // 4. Update session status to LOCKED_FOR_PAYMENT
    // Preserve existing snapshot link when not explicitly provided (COALESCE pattern)
    await connection.execute<ResultSetHeader>(
      `UPDATE table_service_sessions
       SET status_id = ?,
           locked_at = NOW(),
           updated_at = NOW(),
           updated_by = ?,
           notes = COALESCE(?, notes),
           pos_order_snapshot_id = COALESCE(?, pos_order_snapshot_id)
       WHERE id = ?
         AND company_id = ?
         AND outlet_id = ?
         AND status_id = ?`,
      [
        ServiceSessionStatus.LOCKED_FOR_PAYMENT,
        params.updatedBy,
        params.notes ?? null,
        params.posOrderSnapshotId ?? null,
        params.sessionId,
        params.companyId,
        params.outletId,
        ServiceSessionStatus.ACTIVE
      ]
    );

    // 5. Log SESSION_LOCKED event to table_events
    await logSessionEvent(connection, {
      companyId: params.companyId,
      outletId: params.outletId,
      tableId: BigInt(sessionRow.table_id),
      sessionId: params.sessionId,
      eventTypeId: TableEventType.SESSION_LOCKED,
      clientTxId: params.clientTxId,
      eventData: {
        reason: "Session locked for payment",
        previousStatus: ServiceSessionStatus.ACTIVE,
        newStatus: ServiceSessionStatus.LOCKED_FOR_PAYMENT,
        notes: params.notes
      },
      createdBy: params.updatedBy
    });

    await connection.commit();

    // 6. Return updated session with lines
    const lines = await getSessionLinesWithConnection(connection, params.sessionId);
    
    // Fetch updated session row
    const updatedRow = await getSessionWithConnection(
      connection,
      params.companyId,
      params.outletId,
      params.sessionId
    );

    if (!updatedRow) {
      throw new SessionNotFoundError(params.sessionId);
    }

    return mapDbRowToServiceSession(updatedRow, lines);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Close a session
 * Transitions: ACTIVE (1) or LOCKED_FOR_PAYMENT (2) -> CLOSED (3)
 * Atomic transaction that:
 * 1. Checks idempotency (duplicate clientTxId) and returns existing closed session if found
 * 2. Updates session status to CLOSED
 * 3. Finalizes pos_order_snapshots (persisted linkage from session state)
 * 4. Syncs session lines to pos_order_snapshot_lines
 * 5. Releases table occupancy
 * 6. Logs SESSION_CLOSED event
 */
export async function closeSession(
  params: CloseSessionInput
): Promise<ServiceSession> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Check idempotency - duplicate clientTxId?
    const isDuplicate = await checkClientTxIdExists(connection, params.companyId, params.outletId, params.clientTxId);
    if (isDuplicate) {
      // Return existing closed session (idempotency - return same result for same request)
      const sessionRow = await getSessionWithConnection(
        connection,
        params.companyId,
        params.outletId,
        params.sessionId
      );

      if (!sessionRow) {
        throw new SessionNotFoundError(params.sessionId);
      }

      // Session already closed, return stable result
      if (sessionRow.status_id === ServiceSessionStatus.CLOSED) {
        const lines = await getSessionLinesWithConnection(connection, params.sessionId);
        await connection.commit();
        return mapDbRowToServiceSession(sessionRow, lines);
      }

      // Duplicate transaction but session not closed - this is an error
      throw new SessionConflictError("Duplicate transaction but session not in CLOSED state");
    }

    // 2. Get current session with strict company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      connection,
      params.companyId,
      params.outletId,
      params.sessionId
    );

    if (!sessionRow) {
      throw new SessionNotFoundError(params.sessionId);
    }

    const currentStatus = sessionRow.status_id;
    const validCloseStatuses: number[] = [ServiceSessionStatus.ACTIVE, ServiceSessionStatus.LOCKED_FOR_PAYMENT];

    // 3. Validate status transition - must be ACTIVE or LOCKED_FOR_PAYMENT
    if (!validCloseStatuses.includes(currentStatus)) {
      throw new InvalidSessionStatusError(
        currentStatus,
        validCloseStatuses,
        `Session must be ACTIVE or LOCKED_FOR_PAYMENT to close. Current status: ${currentStatus}`
      );
    }

    const snapshotId = sessionRow.pos_order_snapshot_id;

    // Validate that session has a persisted snapshot before closing
    // This ensures lock-payment was called and snapshot was created
    if (!snapshotId) {
      throw new SessionValidationError("Session must be locked with a finalized snapshot before closing");
    }

    // 4. Update session status to CLOSED
    await connection.execute<ResultSetHeader>(
      `UPDATE table_service_sessions
       SET status_id = ?,
           closed_at = NOW(),
           updated_at = NOW(),
           updated_by = ?,
           notes = COALESCE(?, notes)
       WHERE id = ?
         AND company_id = ?
         AND outlet_id = ?`,
      [
        ServiceSessionStatus.CLOSED,
        params.updatedBy,
        params.notes ?? null,
        params.sessionId,
        params.companyId,
        params.outletId
      ]
    );

    // 5. Finalize pos_order_snapshots and sync lines if snapshot exists
    if (snapshotId) {
      // 5a. Finalize the snapshot header
      const [snapshotUpdateResult] = await connection.execute<ResultSetHeader>(
        `UPDATE pos_order_snapshots
         SET is_finalized = 1,
             order_state = 'CLOSED',
             order_status = 'COMPLETED',
             closed_at = NOW(),
             updated_at = NOW()
         WHERE order_id = ?
           AND company_id = ?
           AND outlet_id = ?`,
        [
          snapshotId,
          params.companyId,
          params.outletId
        ]
      );

      if (snapshotUpdateResult.affectedRows === 0) {
        throw new SessionValidationError("Linked pos order snapshot not found for finalization");
      }

      // 5b. Sync session lines to pos_order_snapshot_lines
      await syncSnapshotLinesFromSession(connection, {
        snapshotId,
        companyId: params.companyId,
        outletId: params.outletId,
        sessionId: params.sessionId,
        onlyFinalized: false,
      });
    }

    // 6. Update table_occupancy to AVAILABLE and clear session reference
    await connection.execute<ResultSetHeader>(
      `UPDATE table_occupancy
       SET status_id = ?,
           service_session_id = NULL,
           guest_count = NULL,
           occupied_at = NULL,
           updated_at = NOW(),
           updated_by = ?
       WHERE table_id = ?
         AND company_id = ?
         AND outlet_id = ?`,
      [
        TableOccupancyStatus.AVAILABLE,
        params.updatedBy,
        sessionRow.table_id,
        params.companyId,
        params.outletId
      ]
    );

    // 7. Log SESSION_CLOSED event to table_events
    await logSessionEvent(connection, {
      companyId: params.companyId,
      outletId: params.outletId,
      tableId: BigInt(sessionRow.table_id),
      sessionId: params.sessionId,
      eventTypeId: TableEventType.SESSION_CLOSED,
      clientTxId: params.clientTxId,
      eventData: {
        reason: "Session closed",
        previousStatus: currentStatus,
        newStatus: ServiceSessionStatus.CLOSED,
        notes: params.notes,
        posOrderSnapshotId: snapshotId
      },
      createdBy: params.updatedBy
    });

    await connection.commit();

    // 8. Return closed session with lines
    const lines = await getSessionLinesWithConnection(connection, params.sessionId);
    
    // Fetch updated session row
    const updatedRow = await getSessionWithConnection(
      connection,
      params.companyId,
      params.outletId,
      params.sessionId
    );

    if (!updatedRow) {
      throw new SessionNotFoundError(params.sessionId);
    }

    return mapDbRowToServiceSession(updatedRow, lines);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  ServiceSessionStatus
};

// Re-export types from shared for convenience
export type { ServiceSessionStatusType };
