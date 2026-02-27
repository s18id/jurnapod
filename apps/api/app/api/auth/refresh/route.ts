import { findActiveUserTokenProfile, issueAccessTokenForUser } from "../../../../src/lib/auth";
import { getAppEnv } from "../../../../src/lib/env";
import {
  createRefreshTokenClearCookie,
  createRefreshTokenCookie,
  readRefreshTokenFromRequest,
  revokeRefreshToken,
  rotateRefreshToken
} from "../../../../src/lib/refresh-tokens";

const UNAUTHORIZED_RESPONSE = {
  ok: false,
  error: {
    code: "UNAUTHORIZED",
    message: "Invalid refresh token"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Refresh failed"
  }
};

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
    const response = Response.json(UNAUTHORIZED_RESPONSE, { status: 401 });
    response.headers.set("Set-Cookie", createRefreshTokenClearCookie());
    return response;
  }

  try {
    const rotation = await rotateRefreshToken(refreshToken, { ipAddress, userAgent });
    if (!rotation.ok) {
      const response = Response.json(UNAUTHORIZED_RESPONSE, { status: 401 });
      response.headers.set("Set-Cookie", createRefreshTokenClearCookie());
      return response;
    }

    const user = await findActiveUserTokenProfile(rotation.userId, rotation.companyId);
    if (!user) {
      await revokeRefreshToken(rotation.token);
      const response = Response.json(UNAUTHORIZED_RESPONSE, { status: 401 });
      response.headers.set("Set-Cookie", createRefreshTokenClearCookie());
      return response;
    }

    const tokenResult = await issueAccessTokenForUser(user);
    const env = getAppEnv();
    const response = Response.json(
      {
        ok: true,
        access_token: tokenResult.accessToken,
        token_type: "Bearer",
        expires_in: tokenResult.expiresInSeconds
      },
      { status: 200 }
    );

    response.headers.set(
      "Set-Cookie",
      createRefreshTokenCookie(rotation.token, env.auth.refreshTokenTtlSeconds)
    );

    return response;
  } catch (error) {
    console.error("POST /auth/refresh failed", error);
    const response = Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    response.headers.set("Set-Cookie", createRefreshTokenClearCookie());
    return response;
  }
}
