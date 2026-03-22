// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Auth Routes
 *
 * Routes for authentication.
 * POST /auth/login - User login with email/password
 * POST /auth/logout - User logout
 * POST /auth/refresh - Token refresh
 */

import { Hono } from "hono";
import { z } from "zod";
import { authenticateLogin, recordLoginAudit } from "@/lib/auth";
import {
  buildLoginThrottleKeys,
  delay,
  getLoginThrottleDelay,
  recordLoginFailure,
  recordLoginSuccess,
  type LoginThrottleKey
} from "@/lib/auth-throttle";
import { getAppEnv } from "@/lib/env";
import {
  createRefreshTokenClearCookie,
  createRefreshTokenCookie,
  issueRefreshToken,
  readRefreshTokenFromRequest,
  revokeRefreshToken,
  rotateRefreshToken
} from "@/lib/refresh-tokens";
import { findActiveUserTokenProfile, issueAccessTokenForUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/response";

const authRoutes = new Hono();

// ============================================================================
// Login Request Schema
// ============================================================================

const loginRequestSchema = z
  .object({
    companyCode: z.string().trim().min(1).max(32).optional(),
    company_code: z.string().trim().min(1).max(32).optional(),
    email: z.string().trim().email().max(191),
    password: z.string().min(1).max(255)
  })
  .transform((value) => ({
    companyCode: value.companyCode ?? value.company_code ?? "",
    email: value.email.toLowerCase(),
    password: value.password
  }))
  .refine((value) => value.companyCode.length > 0, {
    message: "companyCode is required",
    path: ["companyCode"]
  });

// ============================================================================
// Shared Helper Functions
// ============================================================================

function readClientIp(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    const ip = forwardedFor.split(",")[0]?.trim();
    if (ip) {
      return ip;
    }
  }

  const realIp = c.req.header("x-real-ip")?.trim();
  return realIp && realIp.length > 0 ? realIp : null;
}

function readUserAgent(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const userAgent = c.req.header("user-agent")?.trim();
  return userAgent && userAgent.length > 0 ? userAgent : null;
}

async function writeLoginAuditRequired(params: {
  result: "SUCCESS" | "FAIL";
  companyId: number | null;
  userId: number | null;
  companyCode: string;
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  reason: "success" | "invalid_credentials" | "invalid_request" | "internal_error";
}): Promise<boolean> {
  try {
    await recordLoginAudit(params);
    return true;
  } catch (error) {
    console.error("POST /auth/login audit write failed", error);
    return false;
  }
}

// ============================================================================
// POST /auth/login
// ============================================================================

authRoutes.post("/login", async (c) => {
  const ipAddress = readClientIp(c);
  const userAgent = readUserAgent(c);
  let throttleKeys: LoginThrottleKey[] = [];

  try {
    // Manual validation (instead of zValidator) to ensure audit logging for invalid requests
    let credentials;
    try {
      const rawBody = await c.req.json();
      credentials = loginRequestSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const auditWritten = await writeLoginAuditRequired({
          result: "FAIL",
          companyId: null,
          userId: null,
          companyCode: "",
          email: "",
          ipAddress,
          userAgent,
          reason: "invalid_request"
        });

        if (!auditWritten) {
          return errorResponse("INTERNAL_SERVER_ERROR", "Login failed", 500);
        }

        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      // Re-throw non-ZodError (e.g., SyntaxError from invalid JSON)
      throw error;
    }

    throttleKeys = buildLoginThrottleKeys({
      companyCode: credentials.companyCode,
      email: credentials.email,
      ipAddress
    });

    try {
      const throttleDelayMs = await getLoginThrottleDelay(throttleKeys);
      await delay(throttleDelayMs);
    } catch (error) {
      console.error("POST /auth/login throttle read failed", error);
    }

    const authResult = await authenticateLogin(credentials);

    if (!("accessToken" in authResult)) {
      try {
        await recordLoginFailure({
          keys: throttleKeys,
          ipAddress,
          userAgent
        });
      } catch (error) {
        console.error("POST /auth/login throttle update failed", error);
      }

      const auditWritten = await writeLoginAuditRequired({
        result: "FAIL",
        companyId: authResult.companyId,
        userId: authResult.userId,
        companyCode: credentials.companyCode,
        email: credentials.email,
        ipAddress,
        userAgent,
        reason: "invalid_credentials"
      });

      if (!auditWritten) {
        return errorResponse("INTERNAL_SERVER_ERROR", "Login failed", 500);
      }

      return errorResponse("INVALID_CREDENTIALS", "Invalid credentials", 401);
    }

    try {
      await recordLoginSuccess(throttleKeys);
    } catch (error) {
      console.error("POST /auth/login throttle clear failed", error);
    }

    const auditWritten = await writeLoginAuditRequired({
      result: "SUCCESS",
      companyId: authResult.companyId,
      userId: authResult.userId,
      companyCode: credentials.companyCode,
      email: credentials.email,
      ipAddress,
      userAgent,
      reason: "success"
    });

    if (!auditWritten) {
      return errorResponse("INTERNAL_SERVER_ERROR", "Login failed", 500);
    }

    const refreshToken = await issueRefreshToken({
      userId: authResult.userId,
      companyId: authResult.companyId,
      ipAddress,
      userAgent
    });
    const env = getAppEnv();

    const responseBody = {
      success: true as const,
      data: {
        access_token: authResult.accessToken,
        token_type: "Bearer",
        expires_in: authResult.expiresInSeconds
      }
    };

    const setCookieHeader = createRefreshTokenCookie(
      refreshToken.token,
      env.auth.refreshTokenTtlSeconds
    );

    return c.json(responseBody, 200, {
      "Set-Cookie": setCookieHeader
    });
  } catch (error) {
    await writeLoginAuditRequired({
      result: "FAIL",
      companyId: null,
      userId: null,
      companyCode: "",
      email: "",
      ipAddress,
      userAgent,
      reason: "internal_error"
    });

    console.error("POST /auth/login failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Login failed", 500);
  }
});

// ============================================================================
// POST /auth/logout
// ============================================================================

authRoutes.post("/logout", async (c) => {
  // Read refresh token from cookie using c.req.header() for consistency
  const cookieHeader = c.req.header("cookie");
  const refreshToken = cookieHeader ? readRefreshTokenFromCookie(cookieHeader) : null;

  // Best-effort token revocation (non-blocking)
  if (refreshToken) {
    try {
      await revokeRefreshToken(refreshToken);
    } catch (error) {
      console.error("POST /auth/logout revoke failed", error);
    }
  }

  // Always clear the refresh token cookie
  const clearCookieHeader = createRefreshTokenClearCookie();

  return c.json({ success: true, data: null }, 200, {
    "Set-Cookie": clearCookieHeader
  });
});

// ============================================================================
// POST /auth/refresh
// ============================================================================

authRoutes.post("/refresh", async (c) => {
  // Use c.req.header() consistently with other routes
  const cookieHeader = c.req.header("cookie");
  const refreshToken = cookieHeader ? readRefreshTokenFromCookie(cookieHeader) : null;
  const ipAddress = readClientIp(c);
  const userAgent = readUserAgent(c);

  if (!refreshToken) {
    const response = errorResponse("UNAUTHORIZED", "Invalid refresh token", 401);
    response.headers.set("Set-Cookie", createRefreshTokenClearCookie());
    return response;
  }

  try {
    const rotation = await rotateRefreshToken(refreshToken, { ipAddress, userAgent });
    if (!("token" in rotation)) {
      const response = errorResponse("UNAUTHORIZED", "Invalid refresh token", 401);
      response.headers.set("Set-Cookie", createRefreshTokenClearCookie());
      return response;
    }

    const user = await findActiveUserTokenProfile(rotation.userId, rotation.companyId);
    if (!user) {
      await revokeRefreshToken(rotation.token);
      const response = errorResponse("UNAUTHORIZED", "Invalid refresh token", 401);
      response.headers.set("Set-Cookie", createRefreshTokenClearCookie());
      return response;
    }

    const tokenResult = await issueAccessTokenForUser(user);
    const env = getAppEnv();
    const response = successResponse(
      {
        access_token: tokenResult.accessToken,
        token_type: "Bearer",
        expires_in: tokenResult.expiresInSeconds
      },
      200
    );

    response.headers.set(
      "Set-Cookie",
      createRefreshTokenCookie(rotation.token, env.auth.refreshTokenTtlSeconds)
    );

    return response;
  } catch (error) {
    console.error("POST /auth/refresh failed", error);
    const response = errorResponse("INTERNAL_SERVER_ERROR", "Refresh failed", 500);
    response.headers.set("Set-Cookie", createRefreshTokenClearCookie());
    return response;
  }
});

// ============================================================================
// Cookie Parsing Helper
// ============================================================================

function readRefreshTokenFromCookie(cookieHeader: string): string | null {
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [rawName, ...rest] = pair.split("=");
    if (!rawName) {
      continue;
    }

    const name = rawName.trim();
    if (name !== "jp_refresh_token") {
      continue;
    }

    const rawValue = rest.join("=").trim();
    if (!rawValue) {
      return null;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

export { authRoutes };
