// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Company not found error.
 */
export class CompanyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanyNotFoundError";
  }
}

/**
 * Company code already exists error.
 */
export class CompanyCodeExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanyCodeExistsError";
  }
}

/**
 * Company is deactivated error.
 */
export class CompanyDeactivatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanyDeactivatedError";
  }
}

/**
 * Company is already active error.
 */
export class CompanyAlreadyActiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanyAlreadyActiveError";
  }
}
