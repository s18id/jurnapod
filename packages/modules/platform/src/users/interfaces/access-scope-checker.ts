// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Interface for access scope validation.
 * Used to check if an actor has permission to access company/outlet resources.
 */
export interface AccessScopeChecker {
  /**
   * Assert that the actor can access a company's data with the given permission.
   * @throws CrossCompanyAccessError if access is denied
   */
  assertCompanyAccess(input: {
    actorUserId: number;
    companyId: number;
    permission: string;
  }): Promise<void>;

  /**
   * Assert that the actor can access a specific outlet's data with the given permission.
   * @throws CrossCompanyAccessError if access is denied
   */
  assertOutletAccess(input: {
    actorUserId: number;
    companyId: number;
    outletId: number;
    permission: string;
  }): Promise<void>;
}