import { NumericIdSchema, RoleSchema } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireRole, withAuth } from "../../../src/lib/auth-guard";
import { readClientIp } from "../../../src/lib/request-meta";
import {
  createUser,
  listUsers,
  OutletNotFoundError,
  RoleNotFoundError,
  UserEmailExistsError
} from "../../../src/lib/users";

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const DUPLICATE_EMAIL_RESPONSE = {
  ok: false,
  error: {
    code: "DUPLICATE_EMAIL",
    message: "Email already exists"
  }
};

const ROLE_NOT_FOUND_RESPONSE = {
  ok: false,
  error: {
    code: "ROLE_NOT_FOUND",
    message: "Role not found"
  }
};

const OUTLET_NOT_FOUND_RESPONSE = {
  ok: false,
  error: {
    code: "OUTLET_NOT_FOUND",
    message: "Outlet not found"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Users request failed"
  }
};

const createUserSchema = z
  .object({
    company_id: NumericIdSchema.optional(),
    email: z.string().trim().email().max(191),
    password: z.string().min(8).max(255),
    role_codes: z.array(RoleSchema).optional(),
    outlet_ids: z.array(NumericIdSchema).optional(),
    is_active: z.boolean().optional()
  })
  .strict();

function parseOptionalIsActive(value: string | null): boolean | undefined {
  if (value == null) {
    return undefined;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new ZodError([]);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const companyIdRaw = url.searchParams.get("company_id");
      if (companyIdRaw != null) {
        const companyId = NumericIdSchema.parse(companyIdRaw);
        if (companyId !== auth.companyId) {
          return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
        }
      }

      const isActive = parseOptionalIsActive(url.searchParams.get("is_active"));
      const search = url.searchParams.get("search")?.trim() || undefined;
      const users = await listUsers(auth.companyId, { isActive, search });

      return Response.json({ ok: true, users }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("GET /api/users failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN"])]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = createUserSchema.parse(payload);
      const companyId = input.company_id ?? auth.companyId;

      if (companyId !== auth.companyId) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      const user = await createUser({
        companyId,
        email: input.email,
        password: input.password,
        roleCodes: input.role_codes,
        outletIds: input.outlet_ids,
        isActive: input.is_active,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return Response.json({ ok: true, user }, { status: 201 });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof UserEmailExistsError) {
        return Response.json(DUPLICATE_EMAIL_RESPONSE, { status: 409 });
      }

      if (error instanceof RoleNotFoundError) {
        return Response.json(ROLE_NOT_FOUND_RESPONSE, { status: 400 });
      }

      if (error instanceof OutletNotFoundError) {
        return Response.json(OUTLET_NOT_FOUND_RESPONSE, { status: 400 });
      }

      console.error("POST /api/users failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN"])]
);
