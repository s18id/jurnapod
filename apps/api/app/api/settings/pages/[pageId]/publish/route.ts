// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../../src/lib/request-meta";
import {
  publishStaticPage,
  StaticPageNotFoundError
} from "../../../../../../src/lib/static-pages-admin";

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
    message: "Static page not found"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Static page request failed"
  }
};

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
      const page = await publishStaticPage({
        pageId,
        actor: {
          companyId: auth.companyId,
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return Response.json({ ok: true, page }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof StaticPageNotFoundError) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      console.error("POST /api/settings/pages/:id/publish failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN"], module: "settings", permission: "update" })]
);
