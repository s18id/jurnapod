// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplier contact API adapter.
 *
 * Delegates to @jurnapod/modules-purchasing services.
 * This file is a thin adapter — all business logic lives in the package.
 */

import { getDb } from "../../lib/db.js";
import { toUtcIso } from "@/lib/date-helpers";
import { SupplierContactService } from "@jurnapod/modules-purchasing";
import type {
  ListSupplierContactsParams,
  GetSupplierContactParams,
  CreateSupplierContactInput,
  UpdateSupplierContactInput,
  DeleteSupplierContactInput,
  SupplierContact,
} from "@jurnapod/modules-purchasing";

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return toUtcIso.dateLike(value) as string;
}

function toApiContact(contact: SupplierContact): unknown {
  return {
    id: contact.id,
    supplier_id: contact.supplier_id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    role: contact.role,
    is_primary: contact.is_primary,
    notes: contact.notes,
    created_at: toIso(contact.created_at),
    updated_at: toIso(contact.updated_at),
  };
}

export interface SupplierContactListParams {
  companyId: number;
  supplierId: number;
}

export async function listSupplierContacts(params: SupplierContactListParams): Promise<unknown[]> {
  const db = getDb();
  const service = new SupplierContactService(db);

  const contacts = await service.listContacts(params as ListSupplierContactsParams);
  return contacts.map((c) => toApiContact(c));
}

export async function getSupplierContactById(params: {
  companyId: number;
  supplierId: number;
  contactId: number;
}): Promise<unknown | null> {
  const db = getDb();
  const service = new SupplierContactService(db);

  const contact = await service.getContactById(params as GetSupplierContactParams);
  return contact ? toApiContact(contact) : null;
}

export async function createSupplierContact(input: {
  companyId: number;
  supplierId: number;
  payload: {
    name: string;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    is_primary: boolean;
    notes?: string | null;
  };
}): Promise<unknown> {
  const db = getDb();
  const service = new SupplierContactService(db);

  try {
    const contact = await service.createContact(input as CreateSupplierContactInput);
    return toApiContact(contact);
  } catch (error: unknown) {
    // Re-throw supplier-not-found error in original shape
    if (error instanceof Error && error.name === "SupplierNotFoundError") {
      throw { code: "SUPPLIER_NOT_FOUND", message: error.message };
    }
    throw error;
  }
}

export async function updateSupplierContact(input: {
  companyId: number;
  supplierId: number;
  contactId: number;
  payload: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    notes?: string | null;
    is_primary?: boolean;
  };
}): Promise<unknown | null> {
  const db = getDb();
  const service = new SupplierContactService(db);

  const contact = await service.updateContact(input as UpdateSupplierContactInput);
  return contact ? toApiContact(contact) : null;
}

export async function deleteSupplierContact(input: {
  companyId: number;
  supplierId: number;
  contactId: number;
}): Promise<boolean> {
  const db = getDb();
  const service = new SupplierContactService(db);

  return service.deleteContact(input as DeleteSupplierContactInput);
}

export async function verifySupplierAccess(
  companyId: number,
  supplierId: number
): Promise<boolean> {
  const db = getDb();
  const service = new SupplierContactService(db);
  return service.verifySupplierAccess(companyId, supplierId);
}
