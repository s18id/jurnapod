// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { findActiveUserTokenProfile, issueAccessTokenForUser } from "../../../../src/lib/auth";
import { getAppEnv } from "../../../../src/lib/env";
import {
  createRefreshTokenClearCookie,
  createRefreshTokenCookie,
  readRefreshTokenFromRequest,
  revokeRefreshToken,
  rotateRefreshToken
} from "../../../../src/lib/refresh-tokens";
import { errorResponse, successResponse } from "../../../../src/lib/response";

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
  const refreshToken = readRefreshTokenFromRequest(request);
  const ipAddress = readClientIp(request);
  const userAgent = readUserAgent(request);

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
}
