import { NumericIdSchema } from "@jurnapod/shared";
import { z, ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../src/lib/request-meta";
import {
  getStaticPageDetail,
  StaticPageNotFoundError,
  StaticPageSlugExistsError,
  StaticPageSlugInvalidError,
  updateStaticPage
} from "../../../../../src/lib/static-pages-admin";

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

const DUPLICATE_SLUG_RESPONSE = {
  ok: false,
  error: {
    code: "DUPLICATE_SLUG",
    message: "Slug already exists"
  }
};

const INVALID_SLUG_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_SLUG",
    message: "Slug is invalid"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Static page request failed"
  }
};

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
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
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

      return Response.json({ ok: true, page }, { status: 200 });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof StaticPageNotFoundError) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      if (error instanceof StaticPageSlugInvalidError) {
        return Response.json(INVALID_SLUG_RESPONSE, { status: 400 });
      }

      if (error instanceof StaticPageSlugExistsError) {
        return Response.json(DUPLICATE_SLUG_RESPONSE, { status: 409 });
      }

      console.error("PATCH /api/settings/pages/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN"], module: "settings", permission: "update" })]
);

export const GET = withAuth(
  async (request) => {
    try {
      const pageId = parsePageId(request);
      const page = await getStaticPageDetail(pageId);
      if (!page) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, page }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("GET /api/settings/pages/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN"], module: "settings", permission: "read" })]
);
