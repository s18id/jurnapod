import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import { getOutlet, updateOutlet, deleteOutlet, OutletNotFoundError } from "../../../../src/lib/outlets";

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Outlet request failed"
  }
};

function parseOutletId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const outletIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(outletIdRaw);
}

export const GET = withAuth(
  async (request, _auth) => {
    try {
      const outletId = parseOutletId(request);
      const outlet = await getOutlet(outletId);
      return Response.json({ success: true, data: outlet }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      if (error instanceof OutletNotFoundError) {
        return Response.json({
          ok: false,
          error: { code: "NOT_FOUND", message: error.message }
        }, { status: 404 });
      }
      console.error("GET /api/outlets/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN"])]
);

export const PATCH = withAuth(
  async (request, _auth) => {
    try {
      const outletId = parseOutletId(request);
      const body = await request.json();
      const { name } = body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return Response.json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Outlet name is required" }
        }, { status: 400 });
      }

      const outlet = await updateOutlet({
        outletId,
        name: name.trim()
      });

      return Response.json({ success: true, data: outlet }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      if (error instanceof OutletNotFoundError) {
        return Response.json({
          ok: false,
          error: { code: "NOT_FOUND", message: error.message }
        }, { status: 404 });
      }
      console.error("PATCH /api/outlets/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN"])]
);

export const DELETE = withAuth(
  async (request, _auth) => {
    try {
      const outletId = parseOutletId(request);
      await deleteOutlet({ outletId });
      return Response.json({ ok: true }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      if (error instanceof OutletNotFoundError) {
        return Response.json({
          ok: false,
          error: { code: "NOT_FOUND", message: error.message }
        }, { status: 404 });
      }
      if (error instanceof Error && error.message.includes("Cannot delete outlet")) {
        return Response.json({
          ok: false,
          error: { code: "OUTLET_IN_USE", message: error.message }
        }, { status: 409 });
      }
      console.error("DELETE /api/outlets/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN"])]
);
