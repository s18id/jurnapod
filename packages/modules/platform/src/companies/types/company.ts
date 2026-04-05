// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { RoleCode } from "../constants/role-definitions.js";

/**
 * Company response type for API output.
 */
export type CompanyResponse = {
  id: number;
  code: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  timezone: string | null;
  currency_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/**
 * Internal company row type from database.
 */
export type CompanyRow = {
  id: number;
  code: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  timezone: string | null;
  currency_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

/**
 * Actor performing company operations.
 */
export type CompanyActor = {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
};

/**
 * Input for creating a company.
 */
export type CreateCompanyInput = {
  code: string;
  name: string;
  legal_name?: string | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  timezone?: string | null;
  currency_code?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
};

/**
 * Input for creating a company with actor (for audit).
 */
export type CreateCompanyInputWithActor = CreateCompanyInput & {
  actor: CompanyActor;
};

/**
 * Input for updating a company.
 */
export type UpdateCompanyInput = {
  companyId: number;
  name?: string | null;
  legal_name?: string | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  timezone?: string | null;
  currency_code?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  actor: CompanyActor;
};

/**
 * Options for fetching companies.
 */
export type ListCompaniesInput = {
  companyId?: number;
  includeDeleted?: boolean;
};

/**
 * Options for getting a single company.
 */
export type GetCompanyInput = {
  companyId: number;
  includeDeleted?: boolean;
};

/**
 * Input for deactivating a company.
 */
export type DeactivateCompanyInput = {
  companyId: number;
  actor: CompanyActor;
};

/**
 * Input for reactivating a company.
 */
export type ReactivateCompanyInput = {
  companyId: number;
  actor: CompanyActor;
};
