import { createHash, randomBytes } from "node:crypto";
import type {
  AuthDbAdapter,
  AuthConfig,
  AuthDbConnection,
  EmailTokenType
} from "../types.js";
import {
  EmailTokenInvalidError,
  EmailTokenExpiredError,
  EmailTokenUsedError
} from "../errors.js";

interface EmailTokenRow {
  user_id: number;
  company_id: number;
  email: string;
  used_at: string | Date | null;
  expires_at: string | Date;
}

interface EmailTokenRowWithoutUsed {
  user_id: number;
  company_id: number;
  email: string;
  expires_at: string | Date;
}

export class EmailTokenManager {
  constructor(
    private adapter: AuthDbAdapter,
    private config: AuthConfig
  ) {}

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private generateToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private getTtlMinutes(type: EmailTokenType): number {
    const ttl = this.config.emailTokens;
    if (!ttl) return 60;

    switch (type) {
      case "PASSWORD_RESET":
        return ttl.passwordResetTtlMinutes;
      case "INVITE":
        return ttl.inviteTtlMinutes;
      case "VERIFY_EMAIL":
        return ttl.verifyEmailTtlMinutes;
      default:
        return 60;
    }
  }

  async create(params: {
    companyId: number;
    userId: number;
    email: string;
    type: EmailTokenType;
    createdBy: number;
  }): Promise<{ token: string; expiresAt: Date }> {
    const ttlMinutes = this.getTtlMinutes(params.type);
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.adapter.execute(
      `INSERT INTO email_tokens (
        company_id, user_id, email, token_hash, type, expires_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        params.companyId,
        params.userId,
        params.email,
        tokenHash,
        params.type,
        expiresAt,
        params.createdBy
      ]
    );

    return { token, expiresAt };
  }

  async validate(
    token: string,
    type: EmailTokenType
  ): Promise<{ userId: number; companyId: number; email: string }> {
    const tokenHash = this.hashToken(token);

    const rows = await this.adapter.queryAll<EmailTokenRow>(
      `SELECT user_id, company_id, email, used_at, expires_at
       FROM email_tokens
       WHERE token_hash = ? AND type = ?
       LIMIT 1`,
      [tokenHash, type]
    );

    if (rows.length === 0) {
      throw new EmailTokenInvalidError("Invalid token");
    }

    const row = rows[0];

    if (row.used_at) {
      throw new EmailTokenUsedError("Token has already been used");
    }

    const expiresAt = row.expires_at instanceof Date
      ? row.expires_at
      : new Date(row.expires_at);

    if (expiresAt < new Date()) {
      throw new EmailTokenExpiredError("Token has expired");
    }

    return {
      userId: row.user_id,
      companyId: row.company_id,
      email: row.email
    };
  }

  async validateAndConsume(
    connection: AuthDbConnection,
    token: string,
    type: EmailTokenType
  ): Promise<{ userId: number; companyId: number; email: string }> {
    const tokenHash = this.hashToken(token);

    // Atomically consume token
    const updateResult = await connection.execute(
      `UPDATE email_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE token_hash = ? AND type = ?
         AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash, type]
    );

    if (updateResult.affectedRows === 0) {
      // Determine specific error
      const rows = await connection.queryAll<EmailTokenRow>(
        `SELECT user_id, company_id, email, used_at, expires_at
         FROM email_tokens
         WHERE token_hash = ? AND type = ?
         LIMIT 1`,
        [tokenHash, type]
      );

      if (rows.length === 0) {
        throw new EmailTokenInvalidError("Invalid token");
      }

      const row = rows[0];

      if (row.used_at) {
        throw new EmailTokenUsedError("Token has already been used");
      }

      const expiresAt = row.expires_at instanceof Date
        ? row.expires_at
        : new Date(row.expires_at);

      if (expiresAt < new Date()) {
        throw new EmailTokenExpiredError("Token has expired");
      }

      throw new EmailTokenInvalidError("Token validation failed");
    }

    // Get consumed token details
    const rows = await connection.queryAll<{ user_id: number; company_id: number; email: string }>(
      `SELECT user_id, company_id, email
       FROM email_tokens
       WHERE token_hash = ? AND type = ?
       LIMIT 1`,
      [tokenHash, type]
    );

    const row = rows[0];
    return {
      userId: row.user_id,
      companyId: row.company_id,
      email: row.email
    };
  }

  async invalidate(token: string, type: EmailTokenType): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.adapter.execute(
      `UPDATE email_tokens SET used_at = CURRENT_TIMESTAMP
       WHERE token_hash = ? AND type = ?`,
      [tokenHash, type]
    );
  }

  async getInfo(
    token: string,
    type: EmailTokenType
  ): Promise<{
    userId: number;
    companyId: number;
    email: string;
    expiresAt: Date;
  } | null> {
    const tokenHash = this.hashToken(token);

    const rows = await this.adapter.queryAll<EmailTokenRowWithoutUsed>(
      `SELECT user_id, company_id, email, expires_at
       FROM email_tokens
       WHERE token_hash = ? AND type = ?
       LIMIT 1`,
      [tokenHash, type]
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      userId: row.user_id,
      companyId: row.company_id,
      email: row.email,
      expiresAt: row.expires_at instanceof Date
        ? row.expires_at
        : new Date(row.expires_at)
    };
  }
}
