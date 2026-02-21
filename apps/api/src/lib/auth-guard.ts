import { jwtVerify } from "jose";
import { z } from "zod";
import { ROLE_CODES, userHasAnyRole, userHasOutletAccess, type RoleCode } from "./auth";
import { getAppEnv } from "./env";

const BEARER_TOKEN_PATTERN = /^Bearer\s+(\S+)$/i;

const unauthorizedResponseBody = {
  ok: false,
  error: {
    code: "UNAUTHORIZED",
    message: "Missing or invalid access token"
  }
};

const forbiddenResponseBody = {
  ok: false,
  error: {
    code: "FORBIDDEN",
    message: "Forbidden"
  }
};

const accessTokenClaimsSchema = z.object({
  sub: z.string().trim().min(1),
  company_id: z.coerce.number().int().positive(),
  email: z.string().trim().email().optional()
});

export type AuthContext = {
  userId: number;
  companyId: number;
  email: string | null;
};

type AuthSuccess = {
  ok: true;
  auth: AuthContext;
};

type AuthFailure = {
  ok: false;
  response: Response;
};

type AuthResult = AuthSuccess | AuthFailure;

export type AuthenticatedRouteHandler = (
  request: Request,
  auth: AuthContext
) => Promise<Response> | Response;

export type AuthenticatedRouteGuard = (
  request: Request,
  auth: AuthContext
) => Promise<Response | null> | Response | null;

type OutletIdResolver = (request: Request, auth: AuthContext) => number | Promise<number>;

const roleCodeSet = new Set<string>(ROLE_CODES);

function createUnauthorizedResponse(): Response {
  return Response.json(unauthorizedResponseBody, { status: 401 });
}

function createForbiddenResponse(): Response {
  return Response.json(forbiddenResponseBody, { status: 403 });
}

function parseBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  const match = BEARER_TOKEN_PATTERN.exec(headerValue.trim());
  return match?.[1] ?? null;
}

async function verifyAccessToken(accessToken: string): Promise<AuthContext> {
  const env = getAppEnv();
  const secret = new TextEncoder().encode(env.auth.accessTokenSecret);
  const verificationOptions = {
    algorithms: ["HS256"],
    issuer: env.auth.issuer ?? undefined,
    audience: env.auth.audience ?? undefined,
    typ: "JWT"
  };

  const { payload } = await jwtVerify(accessToken, secret, verificationOptions);
  const claims = accessTokenClaimsSchema.parse(payload);
  const userId = Number(claims.sub);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("Invalid sub claim");
  }

  return {
    userId,
    companyId: claims.company_id,
    email: claims.email ?? null
  };
}

export async function authenticateRequest(request: Request): Promise<AuthResult> {
  const accessToken = parseBearerToken(request.headers.get("authorization"));
  if (!accessToken) {
    return {
      ok: false,
      response: createUnauthorizedResponse()
    };
  }

  try {
    const auth = await verifyAccessToken(accessToken);
    return { ok: true, auth };
  } catch {
    return {
      ok: false,
      response: createUnauthorizedResponse()
    };
  }
}

export function withAuth(
  handler: AuthenticatedRouteHandler,
  guards: readonly AuthenticatedRouteGuard[] = []
) {
  return async function authenticatedRoute(request: Request): Promise<Response> {
    const authResult = await authenticateRequest(request);
    if (!authResult.ok) {
      return authResult.response;
    }

    for (const guard of guards) {
      const guardResponse = await guard(request, authResult.auth);
      if (guardResponse) {
        return guardResponse;
      }
    }

    return handler(request, authResult.auth);
  };
}

export function requireRole(allowedRoles: readonly RoleCode[]): AuthenticatedRouteGuard {
  const uniqueAllowedRoles = [...new Set(allowedRoles)].filter((role) => roleCodeSet.has(role));

  return async (_request, auth) => {
    const hasRole = await userHasAnyRole(auth.userId, auth.companyId, uniqueAllowedRoles);
    if (!hasRole) {
      return createForbiddenResponse();
    }

    return null;
  };
}

export function requireOutletAccess(
  outletIdOrResolver: number | OutletIdResolver
): AuthenticatedRouteGuard {
  return async (request, auth) => {
    const outletId =
      typeof outletIdOrResolver === "function"
        ? await outletIdOrResolver(request, auth)
        : outletIdOrResolver;

    if (!Number.isSafeInteger(outletId) || outletId <= 0) {
      return createForbiddenResponse();
    }

    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, outletId);
    if (!hasAccess) {
      return createForbiddenResponse();
    }

    return null;
  };
}

export function unauthorizedResponse(): Response {
  return createUnauthorizedResponse();
}
