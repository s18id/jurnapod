import { createHmac } from "node:crypto";
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

    const placeholders = keys.map(() => "?").join(", ");
    const rows = await this.adapter.query<{ key_hash: string; failure_count: number }>(
      `SELECT key_hash, failure_count
       FROM auth_login_throttles
       WHERE key_hash IN (${placeholders})`,
      keys.map((k) => k.hash)
    );

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
    const values = params.keys.flatMap((k) => [k.hash, ipAddress, userAgent]);
    const placeholders = params.keys.map(() => "(?, 1, NOW(), ?, ?)").join(", ");

    await this.adapter.execute(
      `INSERT INTO auth_login_throttles (
        key_hash, failure_count, last_failed_at, last_ip, last_user_agent
      ) VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        failure_count = failure_count + 1,
        last_failed_at = NOW(),
        last_ip = VALUES(last_ip),
        last_user_agent = VALUES(last_user_agent)`,
      values
    );
  }

  async recordSuccess(keys: LoginThrottleKey[]): Promise<void> {
    if (keys.length === 0) return;

    const placeholders = keys.map(() => "?").join(", ");
    await this.adapter.execute(
      `DELETE FROM auth_login_throttles WHERE key_hash IN (${placeholders})`,
      keys.map((k) => k.hash)
    );
  }
}
