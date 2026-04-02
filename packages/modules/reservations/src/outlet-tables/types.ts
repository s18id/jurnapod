// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Outlet Tables Module - Error Classes and Types
 */

export class OutletTableNotFoundError extends Error {
  constructor(message?: string) {
    super(message ?? "Table not found");
  }
}

export class OutletTableCodeExistsError extends Error {
  constructor(message?: string) {
    super(message ?? "Table code already exists");
  }
}

export class OutletTableStatusConflictError extends Error {
  constructor(message?: string) {
    super(message ?? "Table status conflict");
  }
}

export class OutletTableBulkConflictError extends Error {
  constructor(
    message: string,
    public readonly conflictingCodes: string[] = []
  ) {
    super(message);
  }
}

/**
 * Full response for an outlet table
 */
export interface OutletTableFullResponse {
  id: number;
  company_id: number;
  outlet_id: number;
  code: string;
  name: string;
  zone: string | null;
  capacity: number | null;
  status: "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";
  status_id: number;
  created_at: string;
  updated_at: string;
}

/**
 * Actor performing a mutation, used for audit logging
 */
export interface OutletTableActor {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
}

/**
 * Input for creating an outlet table
 */
export interface CreateOutletTableInput {
  company_id: number;
  outlet_id: number;
  code: string;
  name: string;
  zone?: string | null;
  capacity?: number | null;
  status?: "AVAILABLE" | "UNAVAILABLE";
  actor: OutletTableActor;
}

/**
 * Input for updating an outlet table
 */
export interface UpdateOutletTableInput {
  companyId: number;
  outletId: number;
  tableId: number;
  code?: string;
  name?: string;
  zone?: string | null;
  capacity?: number | null;
  status?: "AVAILABLE" | "UNAVAILABLE";
  actor: OutletTableActor;
}

/**
 * Input for bulk creating outlet tables
 */
export interface CreateOutletTablesBulkInput {
  company_id: number;
  outlet_id: number;
  code_template: string;
  name_template: string;
  start_seq: number;
  count: number;
  zone?: string | null;
  capacity?: number | null;
  status?: "AVAILABLE" | "UNAVAILABLE";
  actor: OutletTableActor;
}

// Table status constants
export const OutletTableStatus = {
  AVAILABLE: 1,
  RESERVED: 2,
  OCCUPIED: 3,
  UNAVAILABLE: 7,
} as const;
