// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplier contact types for purchasing module.
 */

export interface SupplierContactRow {
  id: number;
  supplier_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SupplierContact {
  id: number;
  supplier_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListSupplierContactsParams {
  companyId: number;
  supplierId: number;
}

export interface GetSupplierContactParams {
  companyId: number;
  supplierId: number;
  contactId: number;
}

export interface CreateSupplierContactInput {
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
}

export interface UpdateSupplierContactInput {
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
}

export interface DeleteSupplierContactInput {
  companyId: number;
  supplierId: number;
  contactId: number;
}

export interface SupplierNotFoundError {
  code: "SUPPLIER_NOT_FOUND";
  message: string;
}
