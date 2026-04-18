// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Customer type - PERSON or BUSINESS (domain string)
 */
export type CustomerType = "PERSON" | "BUSINESS";

/**
 * Internal customer row type from database.
 * Note: type is stored as integer (1=PERSON, 2=BUSINESS) in DB.
 * The repository returns raw DB integers; conversion to domain string
 * happens in customer-service.ts normalizeCustomerRow().
 */
export type CustomerRow = {
  id: number;
  company_id: number;
  code: string;
  type: number;  // DB stores integer (1 or 2), not domain string
  display_name: string;
  company_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  notes: string | null;
  is_active: number;
  deleted_at: Date | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * Customer detail type for API output (hydrated).
 */
export type CustomerDetail = {
  id: number;
  company_id: number;
  code: string;
  type: CustomerType;
  display_name: string;
  company_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  notes: string | null;
  is_active: boolean;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * Input for creating a customer.
 */
export interface CreateCustomerInput {
  companyId: number;
  code: string;
  type: CustomerType;
  displayName: string;
  companyName?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postalCode?: string | null;
  notes?: string | null;
}

/**
 * Input for updating a customer.
 */
export interface UpdateCustomerInput {
  type?: CustomerType;
  displayName?: string;
  companyName?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

/**
 * Filters for listing customers.
 */
export interface CustomerListFilters {
  isActive?: boolean;
  search?: string;
  type?: CustomerType;
  limit?: number;
  offset?: number;
}

/**
 * Actor performing customer operations.
 */
export type CustomerActor = {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
};