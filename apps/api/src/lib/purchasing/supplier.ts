// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplier API adapter.
 *
 * Delegates to @jurnapod/modules-purchasing services.
 * This file is a thin adapter — all business logic lives in the package.
 */

import { getDb } from "../db.js";
import { toUtcIso } from "@/lib/date-helpers";
import { SupplierService } from "@jurnapod/modules-purchasing";
import type {
  SupplierListParams,
  CreateSupplierInput,
  UpdateSupplierInput,
  SoftDeleteSupplierInput,
} from "@jurnapod/modules-purchasing";
import type { SupplierWithContacts } from "@jurnapod/modules-purchasing";

// Note: return types intentionally match existing API contract (unknown vs typed)
// to avoid breaking changes in this batch.

function formatDecimal(value: unknown): string {
  if (value === null || value === undefined) return "0";
  return String(value);
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return toUtcIso.dateLike(value) as string;
}

// Transform package response to API contract (adds contacts array if missing)
function toApiSupplier(supplier: SupplierWithContacts): unknown {
  return {
    id: supplier.id,
    company_id: supplier.company_id,
    code: supplier.code,
    name: supplier.name,
    email: supplier.email,
    phone: supplier.phone,
    address_line1: supplier.address_line1,
    address_line2: supplier.address_line2,
    city: supplier.city,
    postal_code: supplier.postal_code,
    country: supplier.country,
    currency: supplier.currency,
    credit_limit: formatDecimal(supplier.credit_limit),
    payment_terms_days: supplier.payment_terms_days,
    notes: supplier.notes,
    is_active: supplier.is_active,
    created_by_user_id: supplier.created_by_user_id,
    updated_by_user_id: supplier.updated_by_user_id,
    created_at: toIso(supplier.created_at),
    updated_at: toIso(supplier.updated_at),
    contacts: supplier.contacts?.map((ct) => ({
      id: ct.id,
      supplier_id: ct.supplier_id,
      name: ct.name,
      email: ct.email,
      phone: ct.phone,
      role: ct.role,
      is_primary: ct.is_primary,
      notes: ct.notes,
      created_at: toIso(ct.created_at),
      updated_at: toIso(ct.updated_at),
    })),
  };
}

function toApiSupplierListItem(supplier: SupplierWithContacts): unknown {
  const detail = toApiSupplier(supplier) as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { contacts, ...listItem } = detail;
  return listItem;
}

export async function listSuppliers(params: SupplierListParams): Promise<{
  suppliers: unknown[];
  total: number;
  limit: number;
  offset: number;
}> {
  const db = getDb();
  const service = new SupplierService(db);

  const result = await service.listSuppliers(params);

  return {
    suppliers: result.suppliers.map((s) => toApiSupplierListItem(s as SupplierWithContacts)),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  };
}

export async function getSupplierById(companyId: number, supplierId: number, includeInactive = false): Promise<unknown | null> {
  const db = getDb();
  const service = new SupplierService(db);

  const supplier = await service.getSupplierById(companyId, supplierId, includeInactive);
  return supplier ? toApiSupplier(supplier) : null;
}

export async function createSupplier(input: {
  companyId: number;
  userId: number;
  payload: {
    code: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postal_code?: string | null;
    country?: string | null;
    currency: string;
    credit_limit: string;
    payment_terms_days?: number | null;
    notes?: string | null;
  };
}): Promise<unknown> {
  const db = getDb();
  const service = new SupplierService(db);

  const supplier = await service.createSupplier(input as CreateSupplierInput);
  return toApiSupplier(supplier);
}

export async function updateSupplier(input: {
  companyId: number;
  supplierId: number;
  userId: number;
  payload: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postal_code?: string | null;
    country?: string | null;
    currency?: string;
    credit_limit?: string;
    payment_terms_days?: number | null;
    notes?: string | null;
    is_active?: boolean;
  };
}): Promise<unknown | null> {
  const db = getDb();
  const service = new SupplierService(db);

  try {
    const supplier = await service.updateSupplier(input as UpdateSupplierInput);
    return supplier ? toApiSupplier(supplier) : null;
  } catch (error: unknown) {
    // Re-throw supplier-has-open-documents error in original shape
    if (error instanceof Error && error.name === "SupplierHasOpenDocumentsError") {
      const e = error as unknown as { code: string; detail: { openDocumentType: string } };
      throw {
        code: e.code,
        message: error.message,
        detail: e.detail,
      };
    }
    throw error;
  }
}

export async function softDeleteSupplier(input: {
  companyId: number;
  supplierId: number;
  userId: number;
}): Promise<boolean> {
  const db = getDb();
  const service = new SupplierService(db);

  try {
    return await service.softDeleteSupplier(input as SoftDeleteSupplierInput);
  } catch (error: unknown) {
    // Re-throw supplier-has-open-documents error in original shape
    if (error instanceof Error && error.name === "SupplierHasOpenDocumentsError") {
      const e = error as unknown as { code: string; detail: { openDocumentType: string } };
      throw {
        code: e.code,
        message: error.message,
        detail: e.detail,
      };
    }
    throw error;
  }
}
