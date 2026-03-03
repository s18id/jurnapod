// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { z, ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  getStaticPageDetail,
  StaticPageNotFoundError,
  StaticPageSlugExistsError,
  StaticPageSlugInvalidError,
  updateStaticPage
} from "../../../../../src/lib/static-pages-admin";

const updatePageSchema = z
  .object({
    slug: z.string().trim().min(1).max(128).optional(),
    title: z.string().trim().min(1).max(191).optional(),
    content_md: z.string().trim().min(1).optional(),
    meta_json: z.record(z.any()).nullable().optional()
  })
  .strict();

function parsePageId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const pageIdRaw = parts[parts.indexOf("pages") + 1];
  return NumericIdSchema.parse(pageIdRaw);
}

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const pageId = parsePageId(request);
      const payload = await request.json();
      const input = updatePageSchema.parse(payload);
      const hasPayload = Object.keys(input).length > 0;

      if (!hasPayload) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      const metaJsonProvided = Object.prototype.hasOwnProperty.call(payload, "meta_json");
      const page = await updateStaticPage({
        pageId,
        slug: input.slug,
        title: input.title,
        content_md: input.content_md,
        meta_json: input.meta_json,
        metaJsonProvided,
        actor: {
          companyId: auth.companyId,
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(page);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof StaticPageNotFoundError) {
        return errorResponse("NOT_FOUND", "Static page not found", 404);
      }

      if (error instanceof StaticPageSlugInvalidError) {
        return errorResponse("INVALID_SLUG", "Slug is invalid", 400);
      }

      if (error instanceof StaticPageSlugExistsError) {
        return errorResponse("DUPLICATE_SLUG", "Slug already exists", 409);
      }

      console.error("PATCH /api/settings/pages/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Static page request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN"], module: "settings", permission: "update" })]
);

export const GET = withAuth(
  async (request) => {
    try {
      const pageId = parsePageId(request);
      const page = await getStaticPageDetail(pageId);
      if (!page) {
        return errorResponse("NOT_FOUND", "Static page not found", 404);
      }

      return successResponse(page);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/settings/pages/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Static page request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN"], module: "settings", permission: "read" })]
);
