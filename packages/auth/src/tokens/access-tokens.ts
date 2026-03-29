/**
 * Access token manager using JWT (jose)
 */

import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { AuthConfig, AccessTokenUser } from "../types.js";

const accessTokenClaimsSchema = z.object({
  sub: z.string().trim().min(1),
  company_id: z.coerce.number().int().positive(),
  email: z.string().trim().email().or(z.literal('')).optional()
});

export class AccessTokenManager {
  constructor(private config: AuthConfig) {}

  async sign(user: AccessTokenUser): Promise<string> {
    const secret = new TextEncoder().encode(this.config.tokens.accessTokenSecret);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = nowSeconds + this.config.tokens.accessTokenTtlSeconds;

    let jwt = new SignJWT({
      email: user.email,
      company_id: user.company_id
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(String(user.id))
      .setIssuedAt(nowSeconds)
      .setNotBefore(nowSeconds)
      .setExpirationTime(expiresAt);

    if (this.config.tokens.issuer) {
      jwt = jwt.setIssuer(this.config.tokens.issuer);
    }

    if (this.config.tokens.audience) {
      jwt = jwt.setAudience(this.config.tokens.audience);
    }

    return jwt.sign(secret);
  }

  async verify(token: string): Promise<AccessTokenUser> {
    const secret = new TextEncoder().encode(this.config.tokens.accessTokenSecret);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: this.config.tokens.issuer ?? undefined,
      audience: this.config.tokens.audience ?? undefined,
      typ: "JWT"
    });

    const claims = accessTokenClaimsSchema.parse(payload);
    const userId = Number(claims.sub);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new Error("Invalid sub claim");
    }

    return {
      id: userId,
      company_id: claims.company_id,
      email: claims.email ?? ""
    };
  }
}
