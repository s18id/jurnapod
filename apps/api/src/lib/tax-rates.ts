// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Re-export all tax-related functions and types from taxes library
export type { TaxRate, TaxRateRecord } from "./taxes.js";
export { TaxRateNotFoundError, TaxRateConflictError, TaxRateValidationError, TaxRateReferenceError } from "./taxes.js";
export { findTaxRateById, createTaxRate, updateTaxRate, deleteTaxRate, listTaxRates } from "./taxes.js";
export { listCompanyTaxRates, listCompanyDefaultTaxRateIds, listCompanyDefaultTaxRates, setCompanyDefaultTaxRates } from "./taxes.js";
export { resolveCombinedTaxConfig, calculateTaxLines, withTaxExecutor } from "./taxes.js";

// Re-export Kysely-based functions for library-first pattern
export { 
  listCompanyTaxRatesKysely, 
  listCompanyDefaultTaxRateIdsKysely, 
  listCompanyDefaultTaxRatesKysely, 
  setCompanyDefaultTaxRatesKysely 
} from "./taxes-kysely.js";
