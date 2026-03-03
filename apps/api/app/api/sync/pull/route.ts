// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  NumericIdSchema,
  SyncPullRequestQuerySchema,
  SyncPullPayloadSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { buildSyncPullPayload } from "../../../../src/lib/master-data";
import { errorResponse, successResponse } from "../../../../src/lib/response";

function parseOutletIdForGuard(request: Request): number {
  const outletIdRaw = new URL(request.url).searchParams.get("outlet_id");
  return NumericIdSchema.parse(outletIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const input = SyncPullRequestQuerySchema.parse({
        outlet_id: url.searchParams.get("outlet_id"),
        since_version: url.searchParams.get("since_version") ?? 0
      });

      const payload = await buildSyncPullPayload(auth.companyId, input.outlet_id, input.since_version);
      const response = SyncPullPayloadSchema.parse(payload);

      return successResponse(response);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /sync/pull failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Sync pull failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      outletId: (request) => parseOutletIdForGuard(request)
    })
  ]
);
