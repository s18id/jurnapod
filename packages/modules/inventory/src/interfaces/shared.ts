// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Shared types for inventory module.
 */

/**
 * Actor performing a mutation, used for audit logging.
 */
export type MutationAuditActor = {
  userId: number;
  canManageCompanyDefaults?: boolean;
};
