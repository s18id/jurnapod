import { createHmac } from "node:crypto";
import { sql } from "kysely";
import type { AuthDbAdapter, AuthConfig, LoginThrottleKey } from "../types.js";

export class LoginThrottle {
  constructor(
    private adapter: AuthDbAdapter,
    private config: AuthConfig
  ) {}

  private hashKey(raw: string): string {
    return createHmac("sha256", this.config.tokens.accessTokenSecret)
      .update(raw)
      .digest("hex");
  }

  private computeDelayMs(failureCount: number): number {
    if (!Number.isFinite(failureCount) || failureCount <= 1) {
      return 0;
    }
    const delay = this.config.throttle.baseDelayMs * Math.pow(2, failureCount - 2);
    return Math.min(this.config.throttle.maxDelayMs, Math.round(delay));
  }

  buildKeys(params: {
    companyCode: string;
    email: string;
    ipAddress: string | null;
  }): LoginThrottleKey[] {
    const companyCode = params.companyCode.trim().toUpperCase();
    const email = params.email.trim().toLowerCase();
    const ip = params.ipAddress?.trim() || "unknown";

    const primaryRaw = `login:${companyCode}:${email}:${ip}`;
    const ipRaw = `login-ip:${ip}`;

    return [
      { scope: "primary", raw: primaryRaw, hash: this.hashKey(primaryRaw) },
      { scope: "ip", raw: ipRaw, hash: this.hashKey(ipRaw) }
    ];
  }

  async getDelay(keys: LoginThrottleKey[]): Promise<number> {
    if (keys.length === 0) return 0;

    const rows = await this.adapter.db
      .selectFrom('auth_login_throttles')
      .where('key_hash', 'in', keys.map((k) => k.hash))
      .select(['key_hash', 'failure_count'])
      .execute();

    const failureCounts = new Map(rows.map((r) => [r.key_hash, Number(r.failure_count)]));

    let maxDelay = 0;
    for (const key of keys) {
      const count = failureCounts.get(key.hash) ?? 0;
      const delay = this.computeDelayMs(count);
      if (delay > maxDelay) maxDelay = delay;
    }

    return maxDelay;
  }

  async recordFailure(params: {
    keys: LoginThrottleKey[];
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<void> {
    if (params.keys.length === 0) return;

    const ipAddress = params.ipAddress?.trim() || null;
    const userAgent = params.userAgent?.trim() || null;

    // Use Kysely's onDuplicateKeyUpdate for MySQL/MariaDB
    for (const k of params.keys) {
      await this.adapter.db
        .insertInto('auth_login_throttles')
        .values({
          key_hash: k.hash,
          failure_count: 1,
          last_failed_at: new Date(),
          last_ip: ipAddress,
          last_user_agent: userAgent
        })
        .onDuplicateKeyUpdate({
          failure_count: sql`failure_count + 1`,
          last_failed_at: new Date(),
          last_ip: sql`VALUES(last_ip)`,
          last_user_agent: sql`VALUES(last_user_agent)`
        })
        .execute();
    }
  }

  async recordSuccess(keys: LoginThrottleKey[]): Promise<void> {
    if (keys.length === 0) return;

    await this.adapter.db
      .deleteFrom('auth_login_throttles')
      .where('key_hash', 'in', keys.map((k) => k.hash))
      .execute();
  }
}
