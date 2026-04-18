// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { CustomerRow, CreateCustomerInput, UpdateCustomerInput, CustomerListFilters } from "../types/customers.js";

/**
 * Repository interface for customer data access.
 * Implemented by the DB adapter layer.
 */
export interface CustomerRepository {
  /**
   * Find a customer by ID within a company.
   */
  findById(companyId: number, customerId: number): Promise<CustomerRow | null>;

  /**
   * Find a customer by code within a company.
   */
  findByCode(companyId: number, code: string): Promise<CustomerRow | null>;

  /**
   * List customers for a company with optional filters.
   */
  list(companyId: number, filters?: CustomerListFilters): Promise<CustomerRow[]>;

  /**
   * Count customers for a company with optional filters (for pagination).
   */
  count(companyId: number, filters?: CustomerListFilters): Promise<number>;

  /**
   * Create a new customer.
   * Returns the inserted customer ID.
   */
  create(data: CreateCustomerInput, actorUserId: number): Promise<number>;

  /**
   * Update an existing customer.
   * Returns the updated customer ID.
   */
  update(companyId: number, customerId: number, data: UpdateCustomerInput, actorUserId: number): Promise<number>;

  /**
   * Soft delete a customer (sets deleted_at and is_active=0).
   */
  softDelete(companyId: number, customerId: number, actorUserId: number): Promise<void>;
}