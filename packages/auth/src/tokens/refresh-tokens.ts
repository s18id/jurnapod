/**
 * Refresh token manager with rotation and revocation support
 */

import { createHmac, randomBytes } from "node:crypto";
import type {
  AuthDbAdapter,
  AuthConfig,
  RefreshTokenIssueContext,
  RefreshTokenRotateResult
} from "../types.js";

export const REFRESH_TOKEN_COOKIE_NAME = "jp_refresh_token";
const COOKIE_PATH = "/";
const COOKIE_USER_AGENT_MAX_LENGTH = 255;

export class RefreshTokenManager {
  constructor(
    private adapter: AuthDbAdapter,
    private config: AuthConfig
  ) {}

  private generateToken(): string {
    return randomBytes(48).toString("base64url");
  }

  private hashToken(token: string): string {
    return createHmac("sha256", this.config.tokens.refreshTokenSecret)
      .update(token)
      .digest("hex");
  }

  private normalizeUserAgent(userAgent: string | null): string | null {
    if (!userAgent) return null;
    const trimmed = userAgent.trim();
    if (!trimmed) return null;
    return trimmed.length > COOKIE_USER_AGENT_MAX_LENGTH
      ? trimmed.slice(0, COOKIE_USER_AGENT_MAX_LENGTH)
      : trimmed;
  }

  private normalizeIpAddress(ipAddress: string | null): string | null {
    if (!ipAddress) return null;
    const trimmed = ipAddress.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private toCookieExpiry(maxAgeSeconds: number): string {
    const expiry = new Date(Date.now() + maxAgeSeconds * 1000);
    return expiry.toUTCString();
  }

  private getCookieSettings(): { sameSite: string; secure: boolean } {
    if (this.config.tokens.refreshCookieCrossSite) {
      return { sameSite: "None", secure: true };
    }
    const isProduction = process.env.NODE_ENV === "production";
    return { sameSite: "Lax", secure: isProduction };
  }

  async issue(context: RefreshTokenIssueContext): Promise<{
    token: string;
    expiresAt: Date;
    tokenId: number;
  }> {
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.config.tokens.refreshTokenTtlSeconds * 1000);
    const ipAddress = this.normalizeIpAddress(context.ipAddress);
    const userAgent = this.normalizeUserAgent(context.userAgent);

    const result = await this.adapter.db
      .insertInto('auth_refresh_tokens')
      .values({
        company_id: context.companyId,
        user_id: context.userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        ip_address: ipAddress,
        user_agent: userAgent
      })
      .executeTakeFirst();

    return {
      token,
      expiresAt,
      tokenId: Number(result.insertId)
    };
  }

  async rotate(
    refreshToken: string,
    meta: { ipAddress: string | null; userAgent: string | null }
  ): Promise<RefreshTokenRotateResult> {
    const tokenHash = this.hashToken(refreshToken);

    return this.adapter.db.transaction().execute(async (trx) => {
      // Find existing token with FOR UPDATE lock
      const current = await trx
        .selectFrom('auth_refresh_tokens')
        .where('token_hash', '=', tokenHash)
        .forUpdate()
        .select(['id', 'user_id', 'company_id', 'expires_at', 'revoked_at'])
        .executeTakeFirst();

      if (!current) {
        return { success: false, reason: "not_found" };
      }

      if (current.revoked_at) {
        return { success: false, reason: "revoked" };
      }

      const expiresAt = current.expires_at instanceof Date
        ? current.expires_at
        : new Date(current.expires_at);

      if (expiresAt.getTime() <= Date.now()) {
        return { success: false, reason: "expired" };
      }

      // Revoke old token
      await trx.updateTable("auth_refresh_tokens")
      .set({ revoked_at: new Date()})
        .where('id', '=', current.id)
        .executeTakeFirst();

      // Issue new token
      const nextToken = this.generateToken();
      const nextTokenHash = this.hashToken(nextToken);
      const nextExpiresAt = new Date(Date.now() + this.config.tokens.refreshTokenTtlSeconds * 1000);
      const ipAddress = this.normalizeIpAddress(meta.ipAddress);
      const userAgent = this.normalizeUserAgent(meta.userAgent);

      const insertResult = await trx
        .insertInto('auth_refresh_tokens')
        .values({
          company_id: current.company_id,
          user_id: current.user_id,
          token_hash: nextTokenHash,
          expires_at: nextExpiresAt,
          rotated_from_id: current.id,
          ip_address: ipAddress,
          user_agent: userAgent
        })
        .executeTakeFirst();

      return {
        success: true,
        token: nextToken,
        expiresAt: nextExpiresAt,
        tokenId: Number(insertResult.insertId),
        userId: current.user_id,
        companyId: current.company_id,
        rotatedFromId: current.id
      };
    });
  }

  async revoke(refreshToken: string): Promise<boolean> {
    const tokenHash = this.hashToken(refreshToken);
    const result = await this.adapter.db
      .updateTable('auth_refresh_tokens')
      .set({ revoked_at: new Date() })
      .where('token_hash', '=', tokenHash)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return (result.numUpdatedRows ?? 0) > 0;
  }

  createCookie(token: string, maxAgeSeconds: number): string {
    const settings = this.getCookieSettings();
    const attributes = [
      `${REFRESH_TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}`,
      `Path=${COOKIE_PATH}`,
      "HttpOnly",
      `SameSite=${settings.sameSite}`,
      `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
      `Expires=${this.toCookieExpiry(maxAgeSeconds)}`
    ];

    if (settings.secure) {
      attributes.push("Secure");
    }

    return attributes.join("; ");
  }

  createClearCookie(): string {
    const settings = this.getCookieSettings();
    const attributes = [
      `${REFRESH_TOKEN_COOKIE_NAME}=`,
      `Path=${COOKIE_PATH}`,
      "HttpOnly",
      `SameSite=${settings.sameSite}`,
      "Max-Age=0",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    ];

    if (settings.secure) {
      attributes.push("Secure");
    }

    return attributes.join("; ");
  }
}
