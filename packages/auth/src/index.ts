/**
 * @jurnapod/auth
 * Standalone, framework-agnostic authentication library for Jurnapod.
 */

// Re-export all types
export type {
  AuthDbAdapter,
  AuthConfig,
  RoleCode,
  ModulePermission,
  AccessTokenUser,
  AuthenticatedUser,
  EmailTokenType,
  OAuthProvider,
  GoogleOAuthProfile,
  RefreshTokenIssueContext,
  RefreshTokenRotateResult,
  AccessCheckOptions,
  AccessCheckResult,
  LoginThrottleKey,
  LoginAuditRecord,
  AuthClient,
} from './types.js';

export {
  ROLE_CODES,
  MODULE_PERMISSION_BITS,
} from './types.js';

// Re-export rbac utilities
export { buildPermissionMask, hasPermissionBit } from './rbac/permissions.js';

// Re-export all errors
export {
  AuthError,
  InvalidCredentialsError,
  UserInactiveError,
  TokenExpiredError,
  TokenInvalidError,
  TokenRevokedError,
  ThrottledError,
  EmailTokenNotFoundError,
  EmailTokenExpiredError,
  EmailTokenUsedError,
  EmailTokenInvalidError,
  OAuthConfigError,
  OAuthExchangeError,
  OAuthVerificationError,
  OAuthAccountLinkedError,
} from './errors.js';

// Re-export createAuthClient
export { createAuthClient } from './lib/client.js';
