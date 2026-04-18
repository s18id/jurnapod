// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { KyselySchema } from "@jurnapod/db";
import { toRfc3339Required, CUSTOMER_TYPE } from "@jurnapod/shared";
import { withTransactionRetry } from "@jurnapod/db";

import type {
  CustomerRow,
  CustomerDetail,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerListFilters,
  CustomerActor
} from "../types/customers.js";

import type { CustomerRepository } from "../interfaces/customer-repository.js";
import type { AccessScopeChecker } from "../../users/interfaces/access-scope-checker.js";

import {
  CustomerNotFoundError,
  CustomerCodeConflictError,
  CustomerValidationError
} from "./errors.js";

/**
 * Build audit context for customer operations.
 */
function buildAuditContext(
  companyId: number,
  actor: CustomerActor
) {
  return {
    company_id: companyId,
    user_id: actor.userId,
    outlet_id: actor.outletId ?? null,
    ip_address: actor.ipAddress ?? null
  };
}

/**
 * Normalize a customer database row to CustomerDetail format.
 * Converts DB integer type (1 or 2) to domain string ("PERSON" or "BUSINESS").
 */
function normalizeCustomerRow(row: CustomerRow): CustomerDetail {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: row.code,
    type: row.type === CUSTOMER_TYPE.PERSON ? "PERSON" : "BUSINESS",
    display_name: row.display_name,
    company_name: row.company_name,
    tax_id: row.tax_id,
    email: row.email,
    phone: row.phone,
    address_line1: row.address_line1,
    address_line2: row.address_line2,
    city: row.city,
    postal_code: row.postal_code,
    notes: row.notes,
    is_active: row.is_active === 1,
    created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    updated_by_user_id: row.updated_by_user_id ? Number(row.updated_by_user_id) : null,
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  };
}

// =============================================================================
// CustomerService
// =============================================================================

export interface CustomerService {
  /**
   * List customers for a company with pagination and filtering.
   */
  listCustomers(
    params: {
      companyId: number;
      filters?: CustomerListFilters;
      actor: CustomerActor;
    }
  ): Promise<{
    customers: CustomerDetail[];
    total: number;
  }>;

  /**
   * Get a customer by ID.
   */
  getCustomer(params: {
    companyId: number;
    customerId: number;
    actor: CustomerActor;
  }): Promise<CustomerDetail>;

  /**
   * Create a new customer.
   */
  createCustomer(params: {
    companyId: number;
    input: CreateCustomerInput;
    actor: CustomerActor;
  }): Promise<CustomerDetail>;

  /**
   * Update an existing customer.
   */
  updateCustomer(params: {
    companyId: number;
    customerId: number;
    input: UpdateCustomerInput;
    actor: CustomerActor;
  }): Promise<CustomerDetail>;

  /**
   * Soft delete a customer.
   */
  deleteCustomer(params: {
    companyId: number;
    customerId: number;
    actor: CustomerActor;
  }): Promise<void>;
}

export interface CustomerServiceDeps {
  db: KyselySchema;
  customerRepository: CustomerRepository;
  accessScopeChecker: AccessScopeChecker;
}

/**
 * Factory to create CustomerService instance.
 */
export function createCustomerService(deps: CustomerServiceDeps): CustomerService {
  const { db, customerRepository, accessScopeChecker } = deps;

  return new CustomerServiceImpl(db, customerRepository, accessScopeChecker);
}

class CustomerServiceImpl implements CustomerService {
  constructor(
    private readonly db: KyselySchema,
    private readonly customerRepository: CustomerRepository,
    private readonly accessScopeChecker: AccessScopeChecker
  ) {}

  async listCustomers(params: {
    companyId: number;
    filters?: CustomerListFilters;
    actor: CustomerActor;
  }): Promise<{ customers: CustomerDetail[]; total: number }> {
    const { companyId, filters, actor } = params;

    await this.accessScopeChecker.assertCompanyAccess({
      actorUserId: actor.userId,
      companyId,
      permission: "platform.customers.READ"
    });

    const [rows, total] = await Promise.all([
      this.customerRepository.list(companyId, filters),
      this.customerRepository.count(companyId, filters)
    ]);

    return {
      customers: rows.map((row) => normalizeCustomerRow(row)),
      total
    };
  }

  async getCustomer(params: {
    companyId: number;
    customerId: number;
    actor: CustomerActor;
  }): Promise<CustomerDetail> {
    const { companyId, customerId, actor } = params;

    await this.accessScopeChecker.assertCompanyAccess({
      actorUserId: actor.userId,
      companyId,
      permission: "platform.customers.READ"
    });

    const row = await this.customerRepository.findById(companyId, customerId);
    if (!row) {
      throw new CustomerNotFoundError(`Customer with id ${customerId} not found`);
    }

    return normalizeCustomerRow(row);
  }

  async createCustomer(params: {
    companyId: number;
    input: CreateCustomerInput;
    actor: CustomerActor;
  }): Promise<CustomerDetail> {
    const { companyId, input, actor } = params;

    await this.accessScopeChecker.assertCompanyAccess({
      actorUserId: actor.userId,
      companyId,
      permission: "platform.customers.CREATE"
    });

    // Validate business type requires company_name
    if (input.type === "BUSINESS" && !input.companyName) {
      throw new CustomerValidationError(
        "Business type customers require a company name"
      );
    }

    return await withTransactionRetry(this.db, async (trx) => {
      // Check for duplicate code within company
      const existing = await this.customerRepository.findByCode(companyId, input.code);
      if (existing) {
        throw new CustomerCodeConflictError(
          `Customer with code ${input.code} already exists`
        );
      }

      const customerId = await this.customerRepository.create(input, actor.userId);

      const row = await this.customerRepository.findById(companyId, customerId);
      if (!row) {
        throw new CustomerNotFoundError("Customer not found after creation");
      }

      return normalizeCustomerRow(row);
    });
  }

  async updateCustomer(params: {
    companyId: number;
    customerId: number;
    input: UpdateCustomerInput;
    actor: CustomerActor;
  }): Promise<CustomerDetail> {
    const { companyId, customerId, input, actor } = params;

    await this.accessScopeChecker.assertCompanyAccess({
      actorUserId: actor.userId,
      companyId,
      permission: "platform.customers.UPDATE"
    });

    // Validate business type requires company_name
    if (input.type === "BUSINESS" && !input.companyName) {
      throw new CustomerValidationError(
        "Business type customers require a company name"
      );
    }

    return await withTransactionRetry(this.db, async (trx) => {
      const existing = await this.customerRepository.findById(companyId, customerId);
      if (!existing) {
        throw new CustomerNotFoundError(`Customer with id ${customerId} not found`);
      }

      await this.customerRepository.update(companyId, customerId, input, actor.userId);

      const updated = await this.customerRepository.findById(companyId, customerId);
      if (!updated) {
        throw new CustomerNotFoundError("Customer not found after update");
      }

      return normalizeCustomerRow(updated);
    });
  }

  async deleteCustomer(params: {
    companyId: number;
    customerId: number;
    actor: CustomerActor;
  }): Promise<void> {
    const { companyId, customerId, actor } = params;

    await this.accessScopeChecker.assertCompanyAccess({
      actorUserId: actor.userId,
      companyId,
      permission: "platform.customers.DELETE"
    });

    const existing = await this.customerRepository.findById(companyId, customerId);
    if (!existing) {
      throw new CustomerNotFoundError(`Customer with id ${customerId} not found`);
    }

    await this.customerRepository.softDelete(companyId, customerId, actor.userId);
  }
}