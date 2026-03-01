import { jwtVerify } from "jose";
import { z } from "zod";
import { ROLE_CODES, checkUserAccess, type RoleCode, type ModulePermission } from "./auth";
import { getAppEnv } from "./env";

const BEARER_TOKEN_PATTERN = /^Bearer\s+(\S+)$/i;

const unauthorizedResponseBody = {
  success: false,
  error: {
    code: "UNAUTHORIZED",
    message: "Missing or invalid access token"
  }
};

const forbiddenResponseBody = {
  success: false,
  error: {
    code: "FORBIDDEN",
    message: "Forbidden"
  }
};

const invalidRequestResponseBody = {
  success: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
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

type AccessGuardOptions = {
  roles?: readonly RoleCode[];
  module?: string;
  permission?: ModulePermission;
  outletId?: number | OutletIdResolver;
};

const roleCodeSet = new Set<string>(ROLE_CODES);

function createUnauthorizedResponse(): Response {
  return Response.json(unauthorizedResponseBody, { status: 401 });
}

function createForbiddenResponse(): Response {
  return Response.json(forbiddenResponseBody, { status: 403 });
}

function createInvalidRequestResponse(): Response {
  return Response.json(invalidRequestResponseBody, { status: 400 });
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
      let guardResponse: Response | null;
      try {
        guardResponse = await guard(request, authResult.auth);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return createInvalidRequestResponse();
        }

        throw error;
      }

      if (guardResponse) {
        return guardResponse;
      }
    }

    return handler(request, authResult.auth);
  };
}

export function requireAccess(options: AccessGuardOptions): AuthenticatedRouteGuard {
  const uniqueAllowedRoles = options.roles
    ? [...new Set(options.roles)].filter((role) => roleCodeSet.has(role))
    : [];
  const needsRoleCheck = options.roles !== undefined;
  const needsModuleCheck = Boolean(options.module && options.permission);
  const needsOutletCheck = options.outletId !== undefined;

  return async (request, auth) => {
    if (needsRoleCheck && uniqueAllowedRoles.length === 0) {
      return createForbiddenResponse();
    }

    let outletId: number | undefined;
    if (needsOutletCheck) {
      const outletSource = options.outletId;
      if (outletSource === undefined) {
        return createForbiddenResponse();
      }

      const resolvedOutletId =
        typeof outletSource === "function"
          ? await outletSource(request, auth)
          : outletSource;

      if (!Number.isSafeInteger(resolvedOutletId) || resolvedOutletId <= 0) {
        return createForbiddenResponse();
      }

      outletId = resolvedOutletId;
    }

    if (!needsRoleCheck && !needsModuleCheck && !needsOutletCheck) {
      return null;
    }

    const access = await checkUserAccess({
      userId: auth.userId,
      companyId: auth.companyId,
      allowedRoles: needsRoleCheck ? uniqueAllowedRoles : undefined,
      module: needsModuleCheck ? options.module : undefined,
      permission: needsModuleCheck ? options.permission : undefined,
      outletId: needsOutletCheck ? outletId : undefined
    });

    if (!access) {
      return createForbiddenResponse();
    }

    if (needsRoleCheck && !access.hasRole) {
      return createForbiddenResponse();
    }

    if (needsModuleCheck && !access.hasPermission && !access.isSuperAdmin) {
      return createForbiddenResponse();
    }

    if (needsOutletCheck && !access.hasOutletAccess) {
      return createForbiddenResponse();
    }

    return null;
  };
}

export function requireRole(allowedRoles: readonly RoleCode[]): AuthenticatedRouteGuard {
  return requireAccess({ roles: allowedRoles });
}

export function requireModulePermission(
  module: string,
  permission: ModulePermission
): AuthenticatedRouteGuard {
  return requireAccess({ module, permission });
}

export function requireOutletAccess(
  outletIdOrResolver: number | OutletIdResolver
): AuthenticatedRouteGuard {
  return requireAccess({ outletId: outletIdOrResolver });
}

export function unauthorizedResponse(): Response {
  return createUnauthorizedResponse();
}
