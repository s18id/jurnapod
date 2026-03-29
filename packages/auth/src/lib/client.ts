/**
 * Auth client factory - assembles all managers into a unified AuthClient
 */
import type {
  AuthDbAdapter,
  AuthConfig,
  AuthClient,
  AccessTokenUser,
  RefreshTokenIssueContext,
  RefreshTokenRotateResult,
  LoginAuditRecord,
  LoginThrottleKey,
  EmailTokenType,
  AuthDbConnection,
  AccessCheckOptions,
  AccessCheckResult,
  AuthenticatedUser,
  ModulePermission,
  GoogleOAuthProfile,
} from '../types.js';
import { AccessTokenManager } from '../tokens/index.js';
import { RefreshTokenManager } from '../tokens/index.js';
import { PasswordHasher } from '../passwords/index.js';
import { RBACManager } from '../rbac/index.js';
import { LoginThrottle } from '../throttle/index.js';
import { EmailTokenManager } from '../email/index.js';
import { GoogleOAuthProvider } from '../oauth/index.js';

/**
 * Create the auth client with adapter and configuration.
 * Returns a fully configured AuthClient with all managers wired up.
 */
export function createAuthClient(
  adapter: AuthDbAdapter,
  config: AuthConfig
): AuthClient {
  // Instantiate all managers
  const accessTokens = new AccessTokenManager(config);
  const refreshTokens = new RefreshTokenManager(adapter, config);
  const passwords = new PasswordHasher(config);
  const rbac = new RBACManager(adapter, config);
  const throttle = new LoginThrottle(adapter, config);
  const emailTokens = new EmailTokenManager(adapter, config);

  // OAuth is optional - only instantiate if configured
  const oauthProviders = config.oauth?.google
    ? { google: new GoogleOAuthProvider(adapter, config) }
    : undefined;

  // Build the AuthClient object
  const client: AuthClient = {
    // Configuration reference
    config: Object.freeze(config) as AuthConfig,

    // Token operations - delegate to managers
    tokens: {
      async signAccessToken(user: AccessTokenUser): Promise<string> {
        return accessTokens.sign(user);
      },

      async verifyAccessToken(token: string): Promise<AccessTokenUser> {
        return accessTokens.verify(token);
      },

      async issueRefreshToken(context: RefreshTokenIssueContext): Promise<{
        token: string;
        expiresAt: Date;
        tokenId: number;
      }> {
        return refreshTokens.issue(context);
      },

      async rotateRefreshToken(
        token: string,
        meta: { ipAddress: string | null; userAgent: string | null }
      ): Promise<RefreshTokenRotateResult> {
        return refreshTokens.rotate(token, meta);
      },

      async revokeRefreshToken(token: string): Promise<boolean> {
        return refreshTokens.revoke(token);
      },

      createRefreshTokenCookie(token: string, maxAgeSeconds: number): string {
        return refreshTokens.createCookie(token, maxAgeSeconds);
      },

      createRefreshTokenClearCookie(): string {
        return refreshTokens.createClearCookie();
      },
    },

    // Password operations
    passwords: {
      async hash(plain: string): Promise<string> {
        return passwords.hash(plain);
      },

      async verify(plain: string, storedHash: string): Promise<boolean> {
        return passwords.verify(plain, storedHash);
      },

      needsRehash(storedHash: string): boolean {
        return passwords.needsRehash(storedHash);
      },
    },

    // RBAC operations
    rbac: {
      async getUserWithRoles(userId: number, companyId: number): Promise<AuthenticatedUser | null> {
        return rbac.getUserWithRoles(userId, companyId);
      },

      async getUserForTokenVerification(userId: number, companyId: number): Promise<AccessTokenUser | null> {
        return rbac.getUserForTokenVerification(userId, companyId);
      },

      async hasOutletAccess(userId: number, companyId: number, outletId: number): Promise<boolean> {
        return rbac.hasOutletAccess(userId, companyId, outletId);
      },

      async checkAccess(options: AccessCheckOptions): Promise<AccessCheckResult | null> {
        return rbac.checkAccess(options);
      },

      async listUserOutletIds(userId: number, companyId: number): Promise<number[]> {
        return rbac.listUserOutletIds(userId, companyId);
      },

      async canManageCompanyDefaults(
        userId: number,
        companyId: number,
        module: string,
        permission?: ModulePermission
      ): Promise<boolean> {
        return rbac.canManageCompanyDefaults(userId, companyId, module, permission);
      },

      buildPermissionMask(params: {
        canCreate?: boolean;
        canRead?: boolean;
        canUpdate?: boolean;
        canDelete?: boolean;
        canReport?: boolean;
      }): number {
        // Use imported helper from permissions
        const bits: Record<string, number> = {
          create: 1,
          read: 2,
          update: 4,
          delete: 8,
          report: 16,
        };
        let mask = 0;
        if (params.canCreate) mask |= bits.create;
        if (params.canRead) mask |= bits.read;
        if (params.canUpdate) mask |= bits.update;
        if (params.canDelete) mask |= bits.delete;
        if (params.canReport) mask |= bits.report;
        return mask;
      },
    },

    // Login throttling
    throttle: {
      buildKeys(params: {
        companyCode: string;
        email: string;
        ipAddress: string | null;
      }): LoginThrottleKey[] {
        return throttle.buildKeys(params);
      },

      async getDelay(keys: LoginThrottleKey[]): Promise<number> {
        return throttle.getDelay(keys);
      },

      async recordFailure(params: {
        keys: LoginThrottleKey[];
        ipAddress: string | null;
        userAgent: string | null;
      }): Promise<void> {
        return throttle.recordFailure(params);
      },

      async recordSuccess(keys: LoginThrottleKey[]): Promise<void> {
        return throttle.recordSuccess(keys);
      },
    },

    // Email token operations
    emailTokens: {
      async create(params: {
        companyId: number;
        userId: number;
        email: string;
        type: EmailTokenType;
        createdBy: number;
      }): Promise<{ token: string; expiresAt: Date }> {
        return emailTokens.create(params);
      },

      async validate(token: string, type: EmailTokenType): Promise<{
        userId: number;
        companyId: number;
        email: string;
      }> {
        return emailTokens.validate(token, type);
      },

      async validateAndConsume(
        connection: AuthDbConnection,
        token: string,
        type: EmailTokenType
      ): Promise<{ userId: number; companyId: number; email: string }> {
        return emailTokens.validateAndConsume(connection, token, type);
      },

      async invalidate(token: string, type: EmailTokenType): Promise<void> {
        return emailTokens.invalidate(token, type);
      },

      async getInfo(token: string, type: EmailTokenType): Promise<{
        userId: number;
        companyId: number;
        email: string;
        expiresAt: Date;
      } | null> {
        return emailTokens.getInfo(token, type);
      },
    },

    // OAuth - conditionally added only if configured
    oauth: oauthProviders,

    // Audit logging - uses adapter directly to insert into audit_logs
    audit: {
      async recordLogin(record: LoginAuditRecord): Promise<void> {
        await adapter.execute(
          `INSERT INTO audit_logs (
            company_id,
            user_id,
            action,
            result,
            ip_address,
            user_agent,
            metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            record.companyId,
            record.userId,
            'LOGIN',
            record.result,
            record.ipAddress,
            record.userAgent,
            JSON.stringify({
              company_code: record.companyCode,
              email: record.email,
              reason: record.reason,
            }),
          ]
        );
      },
    },
  };

  return client;
}
