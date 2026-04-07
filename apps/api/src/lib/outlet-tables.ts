// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * @deprecated Use @jurnapod/modules-reservations OutletTableService instead.
 * This wrapper is kept for one release cycle for API compatibility.
 * All logic has been moved to @jurnapod/modules-reservations/src/outlet-tables/service.ts
 */

import { getDb } from "./db";
import {
  type OutletTableStatusIdType,
} from "@jurnapod/shared";
import type {
  OutletTableFullResponse as PackageOutletTableFullResponse,
} from "@jurnapod/modules-reservations";
import {
  listOutletTablesByOutlet as pkgListOutletTablesByOutlet,
  getOutletTable as pkgGetOutletTable,
  createOutletTable as pkgCreateOutletTable,
  createOutletTablesBulk as pkgCreateOutletTablesBulk,
  updateOutletTable as pkgUpdateOutletTable,
  deleteOutletTable as pkgDeleteOutletTable,
} from "@jurnapod/modules-reservations";

// Use package types directly for compatibility
export type OutletTableFullResponse = PackageOutletTableFullResponse;

// Re-export error classes for backward compatibility
export {
  OutletTableNotFoundError,
  OutletTableCodeExistsError,
  OutletTableStatusConflictError,
  OutletTableBulkConflictError,
} from "@jurnapod/modules-reservations";

type OutletTableActor = {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
};

/**
 * @deprecated Use @jurnapod/modules-reservations OutletTableService instead.
 * Kept for one release cycle for compatibility.
 */
export async function listOutletTablesByOutlet(
  companyId: number,
  outletId: number
): Promise<OutletTableFullResponse[]> {
  const db = getDb();
  return pkgListOutletTablesByOutlet(db, companyId, outletId);
}

/**
 * @deprecated Use @jurnapod/modules-reservations OutletTableService instead.
 * Kept for one release cycle for compatibility.
 */
export async function getOutletTable(
  companyId: number,
  outletId: number,
  tableId: number
): Promise<OutletTableFullResponse> {
  const db = getDb();
  return pkgGetOutletTable(db, companyId, outletId, tableId);
}

/**
 * @deprecated Use @jurnapod/modules-reservations OutletTableService instead.
 * Kept for one release cycle for compatibility.
 */
export async function createOutletTable(params: {
  company_id: number;
  outlet_id: number;
  code: string;
  name: string;
  zone?: string | null;
  capacity?: number | null;
  status?: "AVAILABLE" | "UNAVAILABLE";
  status_id?: OutletTableStatusIdType;
  actor: OutletTableActor;
}): Promise<OutletTableFullResponse> {
  const db = getDb();
  return pkgCreateOutletTable(db, params);
}

/**
 * @deprecated Use @jurnapod/modules-reservations OutletTableService instead.
 * Kept for one release cycle for compatibility.
 */
export async function createOutletTablesBulk(params: {
  company_id: number;
  outlet_id: number;
  code_template: string;
  name_template: string;
  start_seq: number;
  count: number;
  zone?: string | null;
  capacity?: number | null;
  status?: "AVAILABLE" | "UNAVAILABLE";
  status_id?: OutletTableStatusIdType;
  actor: OutletTableActor;
}): Promise<OutletTableFullResponse[]> {
  const db = getDb();
  return pkgCreateOutletTablesBulk(db, params);
}

/**
 * @deprecated Use @jurnapod/modules-reservations OutletTableService instead.
 * Kept for one release cycle for compatibility.
 */
export async function updateOutletTable(params: {
  companyId: number;
  outletId: number;
  tableId: number;
  code?: string;
  name?: string;
  zone?: string | null;
  capacity?: number | null;
  status?: "AVAILABLE" | "UNAVAILABLE";
  status_id?: OutletTableStatusIdType;
  actor: OutletTableActor;
}): Promise<OutletTableFullResponse> {
  const db = getDb();
  return pkgUpdateOutletTable(db, {
    companyId: params.companyId,
    outletId: params.outletId,
    tableId: params.tableId,
    code: params.code,
    name: params.name,
    zone: params.zone,
    capacity: params.capacity,
    status: params.status,
    actor: params.actor,
  });
}

/**
 * @deprecated Use @jurnapod/modules-reservations OutletTableService instead.
 * Kept for one release cycle for compatibility.
 */
export async function deleteOutletTable(params: {
  companyId: number;
  outletId: number;
  tableId: number;
  actor: OutletTableActor;
}): Promise<void> {
  const db = getDb();
  return pkgDeleteOutletTable(db, {
    companyId: params.companyId,
    outletId: params.outletId,
    tableId: params.tableId,
    actor: params.actor,
  });
}
