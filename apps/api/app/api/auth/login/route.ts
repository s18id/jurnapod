// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError } from "zod";
import { authenticateLogin, parseLoginRequest, recordLoginAudit } from "../../../../src/lib/auth";
import {
  buildLoginThrottleKeys,
  delay,
  getLoginThrottleDelay,
  recordLoginFailure,
  recordLoginSuccess,
  type LoginThrottleKey
} from "../../../../src/lib/auth-throttle";
import { getAppEnv } from "../../../../src/lib/env";
import { createRefreshTokenCookie, issueRefreshToken } from "../../../../src/lib/refresh-tokens";

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request body"
  }
};

const INVALID_CREDENTIALS_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_CREDENTIALS",
    message: "Invalid credentials"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Login failed"
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

export async function POST(request: Request) {
  const ipAddress = readClientIp(request);
  const userAgent = readUserAgent(request);
  let throttleKeys: LoginThrottleKey[] = [];

  try {
    const payload = await request.json();
    const credentials = parseLoginRequest(payload);
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

    if (!authResult.ok) {
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
        return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
      }

      return Response.json(INVALID_CREDENTIALS_RESPONSE, { status: 401 });
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
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }

    const refreshToken = await issueRefreshToken({
      userId: authResult.userId,
      companyId: authResult.companyId,
      ipAddress,
      userAgent
    });
    const env = getAppEnv();
    const response = Response.json(
      {
        ok: true,
        access_token: authResult.accessToken,
        token_type: "Bearer",
        expires_in: authResult.expiresInSeconds
      },
      { status: 200 }
    );

    response.headers.set(
      "Set-Cookie",
      createRefreshTokenCookie(refreshToken.token, env.auth.refreshTokenTtlSeconds)
    );

    return response;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
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
        return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
      }

      return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
    }

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
    return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
  }
}
