// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Auth session model: silent token refresh, foreground re-auth trigger, and
// session-expiry affordances. Also exports canonical permission helpers.
//
// All helpers MUST NOT log tokens or PII.

// Session helpers
export { silentRefresh, setAccessTokenExpiry, getSessionState, type SessionState } from "./silent-refresh";
export { requestReAuth, isReAuthRequired, markReAuthenticated, type ReAuthContext } from "./re-auth";
export { computeSessionEndingSoon, DEFAULT_SESSION_WARNING_THRESHOLD_MS, type SessionExpiryInfo } from "./session-expiry";

// Re-export existing auth utilities for convenience
export { getStoredAccessToken, storeAccessToken, clearAccessToken } from "@/lib/auth-storage";
export { requestRefreshToken } from "@/lib/auth-refresh";

// Canonical permission helpers (Epic 39 ACL model)
export {
  PERMISSION_BITS,
  BIT_TO_NAME,
  PERMISSION_MASKS,
  MASK_TO_LABEL,
  CANONICAL_MODULES,
  CANONICAL_MODULE_RESOURCES,
  SYSTEM_ROLE_CODES,
  isSystemRole,
  nameToBit,
  maskToBits,
  maskToPermissionNames,
  bitNamesToMask,
  formatMaskLabel,
  formatBitLabel,
  hasMinimumPermission,
  userHasPermission,
  calculatePermissionDiff,
  formatPermissionDiff,
  actionGates,
  requireReadPermission,
  permissionsFromRoleCodes,
  userSatisfiesRoutePermission,
} from "./permissions";

export type {
  PermissionBit,
  PermissionMaskLabel,
  CanonicalModule,
  SystemRoleCode,
  UserPermissionEntry,
  PermissionDiff,
  ActionPermission,
  NavPermissionRequirement,
} from "./permissions";
