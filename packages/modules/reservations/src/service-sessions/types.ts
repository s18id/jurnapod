// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Service Sessions Module - Error Classes and Types
 *
 * Domain types and error classes for service session management.
 */

import type { ServiceSessionStatusType, ServiceSessionLineStateType } from "@jurnapod/shared";

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
 * Maps to table_service_session_lines fields
 */
export interface SessionLine {
  id: bigint;
  sessionId: bigint;
  lineNumber: number;
  lineState: ServiceSessionLineStateType;
  productId: bigint;
  productName: string;
  productSku: string | null;
  quantity: number;
  unitPrice: number;
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

export interface ServiceSessionDbRow {
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

export interface SessionLineDbRow {
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
// SESSION EVENT TYPES
// ============================================================================

export interface SessionEvent {
  id: bigint;
  eventTypeId: number;
  eventTypeLabel: string;
  clientTxId: string;
  eventData: Record<string, unknown> | null;
  occurredAt: Date;
  createdBy: string;
}

export interface SessionEventDbRow {
  id: number;
  event_type_id: number;
  client_tx_id: string;
  event_data: string | null;
  occurred_at: string;
  created_by: string;
}
