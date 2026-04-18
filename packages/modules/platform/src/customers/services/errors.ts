// Copyright (c) 2026 Ahmad Faruk (SignalId #18). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Customer not found error.
 */
export class CustomerNotFoundError extends Error {
  constructor(message = "Customer not found") {
    super(message);
    this.name = "CustomerNotFoundError";
  }
}

/**
 * Customer code conflict error - code already exists in company.
 */
export class CustomerCodeConflictError extends Error {
  constructor(message = "Customer code already exists") {
    super(message);
    this.name = "CustomerCodeConflictError";
  }
}

/**
 * Customer validation error - invalid data for business rules.
 */
export class CustomerValidationError extends Error {
  constructor(message = "Customer validation failed") {
    super(message);
    this.name = "CustomerValidationError";
  }
}