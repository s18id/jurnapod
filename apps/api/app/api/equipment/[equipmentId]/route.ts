import { EquipmentUpdateRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import {
  DatabaseConflictError,
  DatabaseReferenceError,
  deleteEquipment,
  findEquipmentById,
  updateEquipment
} from "../../../../src/lib/master-data";

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const NOT_FOUND_RESPONSE = {
  ok: false,
  error: {
    code: "NOT_FOUND",
    message: "Equipment not found"
  }
};

const CONFLICT_RESPONSE = {
  ok: false,
  error: {
    code: "CONFLICT",
    message: "Equipment conflict"
  }
};

const REFERENCE_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REFERENCE",
    message: "Invalid equipment reference"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Equipment request failed"
  }
};

function parseEquipmentId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const equipmentIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(equipmentIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const equipmentId = parseEquipmentId(request);
      const equipment = await findEquipmentById(auth.companyId, equipmentId);

      if (!equipment) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, equipment }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("GET /equipment/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const equipmentId = parseEquipmentId(request);
      const payload = await request.json();
      const input = EquipmentUpdateRequestSchema.parse(payload);

      const equipment = await updateEquipment(auth.companyId, equipmentId, {
        outlet_id: input.outlet_id ?? null,
        asset_tag: input.asset_tag,
        name: input.name,
        serial_number: input.serial_number,
        purchase_date: input.purchase_date ?? null,
        purchase_cost: input.purchase_cost ?? null,
        is_active: input.is_active
      }, {
        userId: auth.userId
      });

      if (!equipment) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, equipment }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof DatabaseConflictError) {
        return Response.json(CONFLICT_RESPONSE, { status: 409 });
      }

      if (error instanceof DatabaseReferenceError) {
        return Response.json(REFERENCE_RESPONSE, { status: 400 });
      }

      console.error("PATCH /equipment/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const equipmentId = parseEquipmentId(request);
      const removed = await deleteEquipment(auth.companyId, equipmentId, {
        userId: auth.userId
      });

      if (!removed) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("DELETE /equipment/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
