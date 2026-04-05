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

export class RoleNotFoundError extends Error {
  constructor(message = "Role not found") {
    super(message);
    this.name = "RoleNotFoundError";
  }
}

export class RoleLevelViolationError extends Error {
  constructor(message = "Insufficient role level") {
    super(message);
    this.name = "RoleLevelViolationError";
  }
}

export class RoleScopeViolationError extends Error {
  constructor(message = "Role scope violation") {
    super(message);
    this.name = "RoleScopeViolationError";
  }
}

export class OutletNotFoundError extends Error {
  constructor(message = "Outlet not found") {
    super(message);
    this.name = "OutletNotFoundError";
  }
}

export class SuperAdminProtectionError extends Error {
  constructor(message = "SuperAdmin protection violation") {
    super(message);
    this.name = "SuperAdminProtectionError";
  }
}

export class CrossCompanyAccessError extends Error {
  constructor(message = "Cannot access users from another company") {
    super(message);
    this.name = "CrossCompanyAccessError";
  }
}

export class ModuleRoleNotFoundError extends Error {
  constructor(message = "Module role not found") {
    super(message);
    this.name = "ModuleRoleNotFoundError";
  }
}

export class SuperAdminAlreadyExistsError extends Error {
  constructor(message = "A SUPER_ADMIN user already exists. Only one SUPER_ADMIN is allowed.") {
    super(message);
    this.name = "SuperAdminAlreadyExistsError";
  }
}