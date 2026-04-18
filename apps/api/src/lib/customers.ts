// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Customer Service Factory
 *
 * Provides a singleton CustomerService instance for API routes.
 * Follows the same pattern as lib/companies.ts.
 */

import { getDb } from "./db";
import type { KyselySchema } from "@jurnapod/db";
import { ApiCustomerRepository } from "./modules-platform/platform-db.js";
import { getPlatformAccessScopeChecker } from "./modules-platform/access-scope-checker.js";
import {
  createCustomerService,
  CustomerNotFoundError,
  CustomerCodeConflictError,
  CustomerValidationError
} from "@jurnapod/modules-platform";

// Re-export errors so routes can import them from one place
export { CustomerNotFoundError, CustomerCodeConflictError, CustomerValidationError };

/**
 * Factory to create/get CustomerService instance.
 * Creates a new instance on each call (no caching) to avoid shared state across requests.
 * The underlying repositories are lightweight stateless adapters.
 */
export function getCustomerService(): ReturnType<typeof createCustomerService> {
  const db = getDb() as KyselySchema;
  const customerRepository = new ApiCustomerRepository(db);
  const accessScopeChecker = getPlatformAccessScopeChecker();
  return createCustomerService({ db, customerRepository, accessScopeChecker });
}

/**
 * Lightweight helper for route-layer same-company customer existence checks.
 */
export async function customerExistsInCompany(companyId: number, customerId: number): Promise<boolean> {
  const db = getDb() as KyselySchema;
  const customerRepository = new ApiCustomerRepository(db);
  const customer = await customerRepository.findById(companyId, customerId);
  return customer !== null;
}
