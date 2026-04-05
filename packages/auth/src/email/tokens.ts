import { createHash, randomBytes } from "node:crypto";
import type {
  AuthDbAdapter,
  AuthConfig,
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
  ) { }

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
    let token = this.generateToken();
    let tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const rows = await this.adapter.db
      .selectFrom('email_tokens')
      .select(['user_id', 'company_id', 'email', 'used_at', 'expires_at'])
      .where('token_hash', '=', tokenHash)
      .where('type', '=', params.type)
      .execute();

    if (rows.length > 0) {
      token = this.generateToken()
      tokenHash = this.hashToken(token)
    }

    await this.adapter.db
      .insertInto('email_tokens')
      .values({
        company_id: params.companyId,
        user_id: params.userId,
        email: params.email,
        token_hash: tokenHash,
        type: params.type,
        expires_at: expiresAt,
        created_by: params.createdBy
      })
      .execute();

    return { token, expiresAt };
  }

  async validate(
    token: string,
    type: EmailTokenType
  ): Promise<{ userId: number; companyId: number; email: string }> {
    const tokenHash = this.hashToken(token);

    const row = await this.adapter.db
      .selectFrom('email_tokens')
      .select(['user_id', 'company_id', 'email', 'used_at', 'expires_at'])
      .where('token_hash', '=', tokenHash)
      .where('type', '=', type)
      .executeTakeFirst();

    if (!row) {
      throw new EmailTokenInvalidError("Invalid token");
    }

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
    token: string,
    type: EmailTokenType
  ): Promise<{ userId: number; companyId: number; email: string }> {
    const tokenHash = this.hashToken(token);

    // Use transaction for atomic consumption
    const result = await this.adapter.db.transaction().execute(async (trx) => {
      // Determine specific error - fetch the token to see why it failed
      const exists = await trx
        .selectFrom('email_tokens')
        .where('token_hash', '=', tokenHash)
        .where('type', '=', type)
        .forUpdate()
        .select(['user_id', 'company_id', 'email', 'used_at', 'expires_at'])
        .executeTakeFirst();

      if (!exists) {
        throw new EmailTokenInvalidError("Invalid token");
      }

      if (exists.used_at) {
        throw new EmailTokenUsedError("Token has already been used");
      }

      // Check expiry BEFORE attempting update
      const expiresAt = exists.expires_at instanceof Date
        ? exists.expires_at
        : new Date(exists.expires_at);

      if (expiresAt < new Date()) {
        throw new EmailTokenExpiredError("Token has expired");
      }

      // Atomically update - set used_at where it's NULL
      const updateResult: any = await trx
        .updateTable('email_tokens')
        .set({ used_at: new Date() })
        .where('token_hash', '=', tokenHash)
        .where('type', '=', type)
        .where('used_at', 'is', null)
        .executeTakeFirst();

      const numAffected = updateResult.numUpdatedRows || 0;

      if (numAffected === 0) {
        // Race condition - another transaction consumed it first
        throw new EmailTokenUsedError("Token has already been used");
      }

      // Get consumed token details
      const consumed = await trx
        .selectFrom('email_tokens')
        .where('token_hash', '=', tokenHash)
        .where('type', '=', type)
        .select(['user_id', 'company_id', 'email'])
        .executeTakeFirst();

      return consumed!;
    });

    return {
      userId: result.user_id,
      companyId: result.company_id,
      email: result.email
    };
  }

  async invalidate(token: string, type: EmailTokenType): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.adapter.db
      .updateTable('email_tokens')
      .set({ used_at: new Date() })
      .where('token_hash', '=', tokenHash)
      .where('type', '=', type)
      .execute();
  }

  /**
   * Expire a token by setting expires_at to the past.
   * FOR TESTING PURPOSES ONLY.
   */
  async expireToken(token: string, type: EmailTokenType): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.adapter.db
      .updateTable('email_tokens')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('token_hash', '=', tokenHash)
      .where('type', '=', type)
      .execute();
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

    const row = await this.adapter.db
      .selectFrom('email_tokens')
      .where('token_hash', '=', tokenHash)
      .where('type', '=', type)
      .select(['user_id', 'company_id', 'email', 'expires_at'])
      .executeTakeFirst();

    if (!row) return null;

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
