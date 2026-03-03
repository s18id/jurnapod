// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z, ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import {
  createStaticPage,
  listStaticPages,
  StaticPageSlugExistsError,
  StaticPageSlugInvalidError
} from "../../../../src/lib/static-pages-admin";

const statusSchema = z.enum(["DRAFT", "PUBLISHED"]);

const createPageSchema = z
  .object({
    slug: z.string().trim().min(1).max(128),
    title: z.string().trim().min(1).max(191),
    content_md: z.string().trim().min(1),
    status: statusSchema.optional(),
    meta_json: z.record(z.any()).nullable().optional()
  })
  .strict();

export const GET = withAuth(
  async (request, _auth) => {
    try {
      const url = new URL(request.url);
      const query = url.searchParams.get("q")?.trim();
      const pages = await listStaticPages(query || undefined);
      return successResponse(pages);
    } catch (error) {
      console.error("GET /api/settings/pages failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Static pages request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN"], module: "settings", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = createPageSchema.parse(payload);
      const page = await createStaticPage({
        slug: input.slug,
        title: input.title,
        content_md: input.content_md,
        status: input.status,
        meta_json: input.meta_json,
        actor: {
          companyId: auth.companyId,
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(page, 201);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof StaticPageSlugInvalidError) {
        return errorResponse("INVALID_SLUG", "Slug is invalid", 400);
      }

      if (error instanceof StaticPageSlugExistsError) {
        return errorResponse("DUPLICATE_SLUG", "Slug already exists", 409);
      }

      console.error("POST /api/settings/pages failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Static pages request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN"], module: "settings", permission: "create" })]
);
