/**
 * Core type definitions for @jurnapod/auth
 */

// ---------------------------------------------------------------------------
// Database Adapter Interfaces
// ---------------------------------------------------------------------------

import type { Kysely } from 'kysely';
import type { DB } from '@jurnapod/db/kysely';

/**
 * Database adapter interface for auth package.
 * 
 * Provides direct Kysely instance for type-safe query building.
 * Modules should use: this.adapter.db.selectFrom(), .insertInto(), .updateTable(), .deleteFrom()
 */
export interface AuthDbAdapter {
  /**
   * Kysely instance for type-safe query building.
   * Use: this.adapter.db.selectFrom('table').where(...).execute()
   */
  db: Kysely<DB>;

  /**
   * Execute a function within a database transaction.
   * @param fn - Function to execute within transaction
   * @returns Result of the function
   */
  transaction<T>(fn: (trx: AuthDbAdapter) => Promise<T>): Promise<T>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Complete configuration for the auth package.
 * All values must be explicitly provided—no environment variable access.
 */
export interface AuthConfig {
  /** Token configuration */
  tokens: {
    /** HS256 secret for signing access tokens */
    accessTokenSecret: string;
    /** Access token TTL in seconds */
    accessTokenTtlSeconds: number;
    /** Secret for hashing refresh tokens */
    refreshTokenSecret: string;
    /** Refresh token TTL in seconds */
    refreshTokenTtlSeconds: number;
    /** Optional JWT issuer claim */
    issuer?: string;
    /** Optional JWT audience claim */
    audience?: string;
    /** Cookie cross-site setting for refresh tokens */
    refreshCookieCrossSite?: boolean;
  };

  /** Password hashing configuration */
  password: {
    /** Default algorithm for new hashes */
    defaultAlgorithm: 'bcrypt' | 'argon2id';
    /** bcrypt cost factor (e.g., 12) */
    bcryptRounds: number;
    /** Argon2 memory cost in KB */
    argon2MemoryKb: number;
    /** Argon2 time cost iterations */
    argon2TimeCost: number;
    /** Argon2 parallelism threads */
    argon2Parallelism: number;
    /** Whether to rehash passwords on successful login */
    rehashOnLogin: boolean;
  };

  /** Login throttling configuration */
  throttle: {
    /** Base delay in ms for first retry (doubles each failure) */
    baseDelayMs: number;
    /** Maximum delay cap in ms */
    maxDelayMs: number;
  };

  /** OAuth provider configuration (optional) */
  oauth?: {
    google?: {
      clientId: string;
      clientSecret: string;
      /** Allowed redirect URIs */
      redirectUris: string[];
    };
  };

  /** Email token TTL configuration */
  emailTokens?: {
    passwordResetTtlMinutes: number;
    inviteTtlMinutes: number;
    verifyEmailTtlMinutes: number;
  };
}

// ---------------------------------------------------------------------------
// Role & Permission Types
// ---------------------------------------------------------------------------

/** Canonical role codes used throughout the system */
export const ROLE_CODES = [
  "SUPER_ADMIN",
  "OWNER",
  "COMPANY_ADMIN",
  "ADMIN",
  "CASHIER",
  "ACCOUNTANT"
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

/** Module-level permissions (bitmask values) */
export type ModulePermission = "create" | "read" | "update" | "delete" | "report";

/** Permission bit values for module_roles.permission_mask */
export const MODULE_PERMISSION_BITS: Record<ModulePermission, number> = {
  create: 1,   // 00001
  read: 2,     // 00010
  update: 4,   // 00100
  delete: 8,   // 01000
  report: 16   // 10000
};

// ---------------------------------------------------------------------------
// User & Token Types
// ---------------------------------------------------------------------------

/** Minimal user data for JWT claims */
export interface AccessTokenUser {
  id: number;
  company_id: number;
  email: string;
}

/** Complete authenticated user profile */
export interface AuthenticatedUser {
  id: number;
  company_id: number;
  email: string;
  company_timezone: string | null;
  roles: RoleCode[];
  global_roles: RoleCode[];
  outlet_role_assignments: {
    outlet_id: number;
    outlet_code: string;
    outlet_name: string;
    role_codes: RoleCode[];
  }[];
  outlets: {
    id: number;
    code: string;
    name: string;
  }[];
}

/** Email token types */
export type EmailTokenType = "PASSWORD_RESET" | "INVITE" | "VERIFY_EMAIL";

/** OAuth provider identifiers */
export type OAuthProvider = "google";

/** Google OAuth profile after ID token verification */
export interface GoogleOAuthProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
}

/** Refresh token issue context */
export interface RefreshTokenIssueContext {
  userId: number;
  companyId: number;
  ipAddress: string | null;
  userAgent: string | null;
}

/** Refresh token rotation result */
export type RefreshTokenRotateResult =
  | {
      success: true;
      token: string;
      expiresAt: Date;
      tokenId: number;
      userId: number;
      companyId: number;
      rotatedFromId: number;
    }
  | {
      success: false;
      reason: "not_found" | "revoked" | "expired";
    };

// ---------------------------------------------------------------------------
// Access Control Types
// ---------------------------------------------------------------------------

/** Access check options for RBAC */
export interface AccessCheckOptions {
  userId: number;
  companyId: number;
  allowedRoles?: readonly RoleCode[];
  module?: string;
  permission?: ModulePermission;
  outletId?: number;
}

/** Access check result */
export interface AccessCheckResult {
  isSuperAdmin: boolean;
  hasGlobalRole: boolean;
  hasRole: boolean;
  hasPermission: boolean;
  hasOutletAccess: boolean;
}

// ---------------------------------------------------------------------------
// Throttle Types
// ---------------------------------------------------------------------------

/** Login throttle key structure */
export interface LoginThrottleKey {
  scope: "primary" | "ip";
  raw: string;
  hash: string;
}

/** Login audit record for logging */
export interface LoginAuditRecord {
  result: "SUCCESS" | "FAIL";
  companyId: number | null;
  userId: number | null;
  companyCode: string;
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  reason: "success" | "invalid_credentials" | "invalid_request" | "internal_error";
}

// ---------------------------------------------------------------------------
// Auth Client Interface
// ---------------------------------------------------------------------------

/**
 * Primary interface for consumers of @jurnapod/auth
 */
export interface AuthClient {
  /** Configuration reference */
  readonly config: AuthConfig;

  /** Token operations */
  tokens: {
    /** Sign a new access token for a user */
    signAccessToken(user: AccessTokenUser): Promise<string>;
    
    /** Verify and decode an access token */
    verifyAccessToken(token: string): Promise<AccessTokenUser>;
    
    /** Issue a new refresh token */
    issueRefreshToken(context: RefreshTokenIssueContext): Promise<{
      token: string;
      expiresAt: Date;
      tokenId: number;
    }>;
    
    /** Rotate a refresh token (revoke old, issue new) */
    rotateRefreshToken(
      token: string,
      meta: { ipAddress: string | null; userAgent: string | null }
    ): Promise<RefreshTokenRotateResult>;
    
    /** Revoke a refresh token */
    revokeRefreshToken(token: string): Promise<boolean>;
    
    /** Create cookie string for setting refresh token */
    createRefreshTokenCookie(token: string, maxAgeSeconds: number): string;
    
    /** Create cookie string for clearing refresh token */
    createRefreshTokenClearCookie(): string;
  };

  /** Password operations */
  passwords: {
    /** Hash a plaintext password */
    hash(plain: string): Promise<string>;
    
    /** Verify a password against a stored hash */
    verify(plain: string, storedHash: string): Promise<boolean>;
    
    /** Check if password needs rehashing */
    needsRehash(storedHash: string): boolean;
  };

  /** RBAC operations */
  rbac: {
    /** Get user profile with all roles and outlets */
    getUserWithRoles(userId: number, companyId: number): Promise<AuthenticatedUser | null>;
    
    /** Get minimal user data for token verification */
    getUserForTokenVerification(userId: number, companyId: number): Promise<AccessTokenUser | null>;
    
    /** Check if user has a specific outlet access */
    hasOutletAccess(userId: number, companyId: number, outletId: number): Promise<boolean>;
    
    /** Comprehensive access check */
    checkAccess(options: AccessCheckOptions): Promise<AccessCheckResult | null>;
    
    /** Get list of outlet IDs user has access to */
    listUserOutletIds(userId: number, companyId: number): Promise<number[]>;
    
    /** Check if user can manage company defaults for a module */
    canManageCompanyDefaults(
      userId: number,
      companyId: number,
      module: string,
      permission?: ModulePermission
    ): Promise<boolean>;
    
    /** Build a permission mask from boolean flags */
    buildPermissionMask(params: {
      canCreate?: boolean;
      canRead?: boolean;
      canUpdate?: boolean;
      canDelete?: boolean;
      canReport?: boolean;
    }): number;
  };

  /** Login throttling */
  throttle: {
    /** Build throttle keys for a login attempt */
    buildKeys(params: {
      companyCode: string;
      email: string;
      ipAddress: string | null;
    }): LoginThrottleKey[];
    
    /** Get current delay for throttle keys (0 if not throttled) */
    getDelay(keys: LoginThrottleKey[]): Promise<number>;
    
    /** Record a failed login attempt */
    recordFailure(params: {
      keys: LoginThrottleKey[];
      ipAddress: string | null;
      userAgent: string | null;
    }): Promise<void>;
    
    /** Record a successful login (clears throttle) */
    recordSuccess(keys: LoginThrottleKey[]): Promise<void>;
  };

  /** Email token operations */
  emailTokens: {
    /** Create a new email token (reset, invite, verify) */
    create(params: {
      companyId: number;
      userId: number;
      email: string;
      type: EmailTokenType;
      createdBy: number;
    }): Promise<{ token: string; expiresAt: Date }>;
    
    /** Validate a token without consuming it */
    validate(token: string, type: EmailTokenType): Promise<{
      userId: number;
      companyId: number;
      email: string;
    }>;
    
    /** Validate and atomically consume a token */
    validateAndConsume(
      token: string,
      type: EmailTokenType
    ): Promise<{ userId: number; companyId: number; email: string }>;
    
    /** Mark a token as used */
    invalidate(token: string, type: EmailTokenType): Promise<void>;
    
    /** Get token info without validation */
    getInfo(token: string, type: EmailTokenType): Promise<{
      userId: number;
      companyId: number;
      email: string;
      expiresAt: Date;
    } | null>;
  };

  /** OAuth providers (only if configured) */
  oauth?: {
    google?: {
      /** Verify redirect URI is in allowlist */
      assertRedirectUriAllowed(redirectUri: string): void;
      
      /** Exchange authorization code for tokens */
      exchangeCode(code: string, redirectUri: string): Promise<{
        idToken: string;
        accessToken: string | null;
        expiresInSeconds: number | null;
      }>;
      
      /** Verify Google ID token */
      verifyIdToken(idToken: string): Promise<GoogleOAuthProfile>;
      
      /** Find existing user by email for Google login */
      findUser(companyCode: string, email: string): Promise<{
        userId: number;
        companyId: number;
        email: string;
      } | null>;
      
      /** Link Google account to user */
      linkAccount(params: {
        companyId: number;
        userId: number;
        providerUserId: string;
        emailSnapshot: string;
      }): Promise<
        | { success: true; linked: boolean }
        | { success: false; reason: "linked_to_another_user" }
      >;
    };
  };

  /** Audit logging */
  audit: {
    /** Record a login attempt */
    recordLogin(record: LoginAuditRecord): Promise<void>;
  };
}
