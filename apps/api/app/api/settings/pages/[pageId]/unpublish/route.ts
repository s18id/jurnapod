// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import {
  StaticPageNotFoundError,
  unpublishStaticPage
} from "../../../../../../src/lib/static-pages-admin";

function parsePageId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const pageIdRaw = parts[parts.indexOf("pages") + 1];
  return NumericIdSchema.parse(pageIdRaw);
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const pageId = parsePageId(request);
      const page = await unpublishStaticPage({
        pageId,
        actor: {
          companyId: auth.companyId,
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(page);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof StaticPageNotFoundError) {
        return errorResponse("NOT_FOUND", "Static page not found", 404);
      }

      console.error("POST /api/settings/pages/:id/unpublish failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Static page request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN"], module: "settings", permission: "update" })]
);
