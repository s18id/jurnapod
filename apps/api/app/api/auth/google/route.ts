// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError, z } from "zod";
import { issueAccessTokenForUser } from "../../../../src/lib/auth";
import { getAppEnv } from "../../../../src/lib/env";
import {
  exchangeGoogleAuthorizationCode,
  findGoogleLoginUser,
  linkGoogleAccount,
  verifyGoogleIdToken
} from "../../../../src/lib/google-oauth";
import { createRefreshTokenCookie, issueRefreshToken } from "../../../../src/lib/refresh-tokens";
import { errorResponse, successResponse } from "../../../../src/lib/response";

const googleLoginRequestSchema = z
  .object({
    companyCode: z.string().trim().min(1).max(32).optional(),
    company_code: z.string().trim().min(1).max(32).optional(),
    code: z.string().trim().min(1),
    redirectUri: z.string().trim().min(1).optional(),
    redirect_uri: z.string().trim().min(1).optional()
  })
  .transform((value) => ({
    companyCode: value.companyCode ?? value.company_code ?? "",
    code: value.code,
    redirectUri: value.redirectUri ?? value.redirect_uri ?? ""
  }))
  .refine((value) => value.companyCode.length > 0, {
    message: "companyCode is required",
    path: ["companyCode"]
  })
  .refine((value) => value.redirectUri.length > 0, {
    message: "redirectUri is required",
    path: ["redirectUri"]
  });

function readClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ip = forwardedFor.split(",")[0]?.trim();
    if (ip) {
      return ip;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp && realIp.length > 0 ? realIp : null;
}

function readUserAgent(request: Request): string | null {
  const userAgent = request.headers.get("user-agent")?.trim();
  return userAgent && userAgent.length > 0 ? userAgent : null;
}

export async function POST(request: Request) {
  const ipAddress = readClientIp(request);
  const userAgent = readUserAgent(request);

  try {
    const payload = await request.json();
    const input = googleLoginRequestSchema.parse(payload);

    let profile;
    try {
      const tokens = await exchangeGoogleAuthorizationCode(input.code, input.redirectUri);
      profile = await verifyGoogleIdToken(tokens.idToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("redirect_uri")) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      if (message.includes("not configured")) {
        return errorResponse("INTERNAL_SERVER_ERROR", "Login failed", 500);
      }

      return errorResponse("INVALID_CREDENTIALS", "Invalid credentials", 401);
    }

    const user = await findGoogleLoginUser(input.companyCode, profile.email);
    if (!user) {
      return errorResponse(
        "GOOGLE_USER_NOT_FOUND",
        "No account found for this Google email. Please contact your administrator to create an account or register first.",
        404
      );
    }

    const linkResult = await linkGoogleAccount({
      companyId: user.companyId,
      userId: user.userId,
      providerUserId: profile.sub,
      emailSnapshot: profile.email
    });

    if ("reason" in linkResult) {
      return errorResponse("OAUTH_CONFLICT", "OAuth account is linked to another user", 409);
    }

    const tokenResult = await issueAccessTokenForUser({
      id: user.userId,
      company_id: user.companyId,
      email: user.email
    });
    const refreshToken = await issueRefreshToken({
      userId: user.userId,
      companyId: user.companyId,
      ipAddress,
      userAgent
    });
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
      createRefreshTokenCookie(refreshToken.token, env.auth.refreshTokenTtlSeconds)
    );

    return response;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("POST /auth/google failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Login failed", 500);
  }
}
