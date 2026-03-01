import { z, ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../src/lib/request-meta";
import {
  createStaticPage,
  listStaticPages,
  StaticPageSlugExistsError,
  StaticPageSlugInvalidError
} from "../../../../src/lib/static-pages-admin";

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
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
    message: "Static pages request failed"
  }
};

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
      return Response.json({ ok: true, pages }, { status: 200 });
    } catch (error) {
      console.error("GET /api/settings/pages failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN"], module: "settings", permission: "read" })]
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

      return Response.json({ ok: true, page }, { status: 201 });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof StaticPageSlugInvalidError) {
        return Response.json(INVALID_SLUG_RESPONSE, { status: 400 });
      }

      if (error instanceof StaticPageSlugExistsError) {
        return Response.json(DUPLICATE_SLUG_RESPONSE, { status: 409 });
      }

      console.error("POST /api/settings/pages failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN"], module: "settings", permission: "create" })]
);
