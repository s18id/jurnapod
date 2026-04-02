// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AccessScopeChecker Interface
 * 
 * Injection boundary for authorization checks in the sales module.
 * This interface abstracts ACL logic so that modules-sales has NO direct
 * dependency on @/lib/auth from the API.
 * 
 * The API composes a concrete implementation and injects it at service creation time.
 */

export class SalesAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly code: "FORBIDDEN" | "NOT_FOUND" = "FORBIDDEN"
  ) {
    super(message);
    this.name = "SalesAuthorizationError";
  }
}

export interface AccessScopeChecker {
  /**
   * Assert that an actor has company-level access with the given permission.
   * @throws SalesAuthorizationError if access is denied
   */
  assertCompanyAccess(input: {
    actorUserId: number;
    companyId: number;
    permission: string;
  }): Promise<void>;

  /**
   * Assert that an actor has outlet-level access with the given permission.
   * @throws SalesAuthorizationError if access is denied
   */
  assertOutletAccess(input: {
    actorUserId: number;
    companyId: number;
    outletId: number;
    permission: string;
  }): Promise<void>;
}

/**
 * Permission constants for sales module operations.
 */
export const SalesPermissions = {
  CREATE_ORDER: "sales:create",
  UPDATE_ORDER: "sales:update",
  CANCEL_ORDER: "sales:cancel",
  READ_ORDER: "sales:read",
  CREATE_INVOICE: "sales:create_invoice",
  UPDATE_INVOICE: "sales:update_invoice",
  READ_INVOICE: "sales:read_invoice",
  CREATE_PAYMENT: "payments:create",
  READ_PAYMENT: "payments:read",
  CREATE_CREDIT_NOTE: "credit_notes:create",
  READ_CREDIT_NOTE: "credit_notes:read",
} as const;

export type SalesPermission = typeof SalesPermissions[keyof typeof SalesPermissions];
