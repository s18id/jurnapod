// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Errors thrown by user management operations.
 */
export class UserNotFoundError extends Error {
  constructor(message = "User not found") {
    super(message);
    this.name = "UserNotFoundError";
  }
}

export class UserEmailExistsError extends Error {
  constructor(message = "Email already exists") {
    super(message);
    this.name = "UserEmailExistsError";
  }
}

export class CrossCompanyAccessError extends Error {
  constructor(message = "Cannot access users from another company") {
    super(message);
    this.name = "CrossCompanyAccessError";
  }
}