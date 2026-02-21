import { ZodError } from "zod";
import { authenticateLogin, parseLoginRequest, recordLoginAudit } from "../../../../src/lib/auth";

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

async function writeLoginAuditOrWarn(params: {
  result: "SUCCESS" | "FAIL";
  companyId: number | null;
  userId: number | null;
  companyCode: string;
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  reason: "success" | "invalid_credentials" | "invalid_request" | "internal_error";
}): Promise<void> {
  try {
    await recordLoginAudit(params);
  } catch (error) {
    console.error("POST /auth/login audit write failed", error);
  }
}

export async function POST(request: Request) {
  const ipAddress = readClientIp(request);
  const userAgent = readUserAgent(request);

  try {
    const payload = await request.json();
    const credentials = parseLoginRequest(payload);
    const authResult = await authenticateLogin(credentials);

    if (!authResult.ok) {
      await writeLoginAuditOrWarn({
        result: "FAIL",
        companyId: authResult.companyId,
        userId: authResult.userId,
        companyCode: credentials.companyCode,
        email: credentials.email,
        ipAddress,
        userAgent,
        reason: "invalid_credentials"
      });
      return Response.json(INVALID_CREDENTIALS_RESPONSE, { status: 401 });
    }

    await writeLoginAuditOrWarn({
      result: "SUCCESS",
      companyId: authResult.companyId,
      userId: authResult.userId,
      companyCode: credentials.companyCode,
      email: credentials.email,
      ipAddress,
      userAgent,
      reason: "success"
    });

    return Response.json(
      {
        ok: true,
        access_token: authResult.accessToken,
        token_type: "Bearer",
        expires_in: authResult.expiresInSeconds
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      await writeLoginAuditOrWarn({
        result: "FAIL",
        companyId: null,
        userId: null,
        companyCode: "",
        email: "",
        ipAddress,
        userAgent,
        reason: "invalid_request"
      });
      return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
    }

    await writeLoginAuditOrWarn({
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
