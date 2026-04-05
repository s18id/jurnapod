// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Users module public API
// Types
export * from "./types/index.js";

// Services
export { UserService } from "./services/user-service.js";
export { RoleService } from "./services/role-service.js";

// Errors
export {
  UserNotFoundError,
  UserEmailExistsError,
  CrossCompanyAccessError
} from "./interfaces/errors.js";

export {
  RoleNotFoundError,
  RoleLevelViolationError,
  RoleScopeViolationError,
  OutletNotFoundError,
  SuperAdminProtectionError,
  ModuleRoleNotFoundError,
  SuperAdminAlreadyExistsError
} from "./services/errors.js";