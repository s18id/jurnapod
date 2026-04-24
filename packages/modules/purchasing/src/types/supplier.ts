// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplier types for purchasing module.
 */

import type { SupplierContact, SupplierContactRow } from "./supplier-contact.js";

export type { SupplierContact, SupplierContactRow } from "./supplier-contact.js";

export interface SupplierRow {
  id: number;
  company_id: number;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  currency: string;
  credit_limit: string;
  payment_terms_days: number | null;
  notes: string | null;
  is_active: number;
  created_by_user_id: number;
  updated_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface SupplierListParams {
  companyId: number;
  isActive?: boolean;
  search?: string;
  limit: number;
  offset: number;
}

export interface SupplierListResult {
  suppliers: Supplier[];
  total: number;
  limit: number;
  offset: number;
}

export interface Supplier {
  id: number;
  company_id: number;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  currency: string;
  credit_limit: string;
  payment_terms_days: number | null;
  notes: string | null;
  is_active: boolean;
  created_by_user_id: number;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierWithContacts extends Supplier {
  contacts: SupplierContact[];
}

export interface CreateSupplierInput {
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
}

export interface UpdateSupplierInput {
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
}

export interface SoftDeleteSupplierInput {
  companyId: number;
  supplierId: number;
  userId: number;
}

export interface SupplierOpenDocumentsError {
  code: "SUPPLIER_HAS_OPEN_DOCUMENTS";
  message: string;
  detail: { openDocumentType: string };
}
