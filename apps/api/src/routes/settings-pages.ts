// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Settings Static Pages Routes
 *
 * Routes for static page management:
 * - GET /settings/pages - List pages (admin)
 * - POST /settings/pages - Create page
 * - PATCH /settings/pages/:id - Update page
 * - POST /settings/pages/:id/publish - Publish page
 * - POST /settings/pages/:id/unpublish - Unpublish page
 * - GET /pages/:slug - Get page by slug (public)
 */

import { Hono } from "hono";
import { z } from "zod";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { NumericIdSchema } from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import {
  listStaticPages,
  createStaticPage,
  updateStaticPage,
  publishStaticPage,
  unpublishStaticPage,
  StaticPageNotFoundError,
  StaticPageSlugExistsError,
  StaticPageSlugInvalidError
} from "../lib/static-pages-admin.js";
import { getPublishedStaticPage as getPublicPage } from "../lib/static-pages.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Request Schemas
// =============================================================================

export const CreatePageSchema = z.object({
  slug: z.string().min(1).max(100),
  title: z.string().min(1).max(191),
  content_md: z.string(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional().default("DRAFT"),
  meta_json: z.record(z.any()).optional()
});

export const UpdatePageSchema = z.object({
  slug: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(191).optional(),
  content_md: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  meta_json: z.record(z.any()).optional()
});

// =============================================================================
// Admin Pages Routes (/settings/pages)
// =============================================================================

const adminPagesRoutes = new Hono();

// Auth middleware
adminPagesRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /settings/pages - List pages
adminPagesRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "platform", resource: "settings",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const searchQuery = url.searchParams.get("q") || undefined;

    const pages = await listStaticPages(searchQuery);
    return successResponse(pages);
  } catch (error) {
    console.error("GET /settings/pages failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to list pages", 500);
  }
});

// POST /settings/pages - Create page
adminPagesRoutes.post("/", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "platform", resource: "settings",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = CreatePageSchema.parse(payload);

    const page = await createStaticPage({
      slug: input.slug,
      title: input.title,
      content_md: input.content_md,
      status: input.status,
      meta_json: input.meta_json,
      actor: {
        companyId: auth.companyId,
        userId: auth.userId
      }
    });

    return successResponse({ id: page.id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof StaticPageSlugInvalidError) {
      return errorResponse("INVALID_SLUG", "Slug is invalid (use lowercase letters, numbers, and hyphens only)", 400);
    }

    if (error instanceof StaticPageSlugExistsError) {
      return errorResponse("DUPLICATE_SLUG", "A page with this slug already exists", 409);
    }

    console.error("POST /settings/pages failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create page", 500);
  }
});

// PATCH /settings/pages/:id - Update page
adminPagesRoutes.patch("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "platform", resource: "settings",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const pageId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = UpdatePageSchema.parse(payload);

    const page = await updateStaticPage({
      pageId,
      slug: input.slug,
      title: input.title,
      content_md: input.content_md,
      meta_json: input.meta_json,
      metaJsonProvided: "meta_json" in input,
      actor: {
        companyId: auth.companyId,
        userId: auth.userId
      }
    });

    return successResponse(page);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof StaticPageSlugInvalidError) {
      return errorResponse("INVALID_SLUG", "Slug is invalid (use lowercase letters, numbers, and hyphens only)", 400);
    }

    if (error instanceof StaticPageSlugExistsError) {
      return errorResponse("DUPLICATE_SLUG", "A page with this slug already exists", 409);
    }

    if (error instanceof StaticPageNotFoundError) {
      return errorResponse("NOT_FOUND", "Page not found", 404);
    }

    console.error("PATCH /settings/pages/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update page", 500);
  }
});

// POST /settings/pages/:id/publish - Publish page
adminPagesRoutes.post("/:id/publish", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "platform", resource: "settings",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const pageId = NumericIdSchema.parse(c.req.param("id"));

    const page = await publishStaticPage({
      pageId,
      actor: {
        companyId: auth.companyId,
        userId: auth.userId
      }
    });

    if (!page) {
      return errorResponse("NOT_FOUND", "Page not found", 404);
    }

    return successResponse(page);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid page ID", 400);
    }

    if (error instanceof StaticPageNotFoundError) {
      return errorResponse("NOT_FOUND", "Page not found", 404);
    }

    console.error("POST /settings/pages/:id/publish failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to publish page", 500);
  }
});

// POST /settings/pages/:id/unpublish - Unpublish page
adminPagesRoutes.post("/:id/unpublish", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "platform", resource: "settings",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const pageId = NumericIdSchema.parse(c.req.param("id"));

    const page = await unpublishStaticPage({
      pageId,
      actor: {
        companyId: auth.companyId,
        userId: auth.userId
      }
    });

    return successResponse(page);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid page ID", 400);
    }

    if (error instanceof StaticPageNotFoundError) {
      return errorResponse("NOT_FOUND", "Page not found", 404);
    }

    console.error("POST /settings/pages/:id/unpublish failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to unpublish page", 500);
  }
});

export { adminPagesRoutes };

// =============================================================================
// Public Pages Routes (/pages/:slug)
// =============================================================================

const publicPagesRoutes = new Hono();

// GET /pages/:slug - Get page by slug (public, no auth required)
publicPagesRoutes.get("/:slug", async (c) => {
  try {
    const slug = c.req.param("slug");

    const page = await getPublicPage(slug);

    if (!page) {
      return errorResponse("NOT_FOUND", "Page not found", 404);
    }

    return successResponse(page);
  } catch (error) {
    console.error("GET /pages/:slug failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch page", 500);
  }
});

export { publicPagesRoutes };

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

type OpenAPIHonoInterface = {
  openapi: OpenAPIHono["openapi"];
};

const StaticPageSchema = z.object({
  id: z.number(),
  slug: z.string(),
  title: z.string(),
  content_md: z.string(),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  meta_json: z.record(z.any()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  published_at: z.string().nullable()
}).openapi("StaticPage");

const StaticPagesResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(StaticPageSchema)
}).openapi("StaticPagesResponse");

const StaticPageResponseSchema = z.object({
  success: z.boolean(),
  data: StaticPageSchema
}).openapi("StaticPageResponse");

const ErrorResponseSchema = z.object({
  success: z.boolean(),
  error: z.object({
    code: z.string(),
    message: z.string()
  })
}).openapi("ErrorResponse");

export const registerSettingsPageRoutes = (app: OpenAPIHonoInterface): void => {
  // GET /settings/pages - List pages
  app.openapi(
    createRoute({
      method: "get",
      path: "/settings/pages",
      tags: ["Settings"],
      summary: "List pages",
      description: "List all static pages",
      security: [{ BearerAuth: [] }],
      responses: {
        200: { content: { "application/json": { schema: StaticPagesResponseSchema } }, description: "List of pages" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "platform", resource: "settings", permission: "read" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const url = new URL(c.req.raw.url);
        const searchQuery = url.searchParams.get("q") || undefined;

        const pages = await listStaticPages(searchQuery);
        return c.json({ success: true, data: pages });
      } catch (error) {
        console.error("GET /settings/pages failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to list pages" } }, 500);
      }
    }
  );

  // POST /settings/pages - Create page
  app.openapi(
    createRoute({
      method: "post",
      path: "/settings/pages",
      tags: ["Settings"],
      summary: "Create page",
      description: "Create a new static page",
      security: [{ BearerAuth: [] }],
      request: {
        body: {
          content: {
            "application/json": { schema: CreatePageSchema }
          }
        }
      },
      responses: {
        201: { content: { "application/json": { schema: z.object({ success: z.boolean(), data: z.object({ id: z.number() }) }) } }, description: "Page created" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Duplicate slug" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "platform", resource: "settings", permission: "create" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const payload = await c.req.json();
        const input = CreatePageSchema.parse(payload);

        const page = await createStaticPage({
          slug: input.slug,
          title: input.title,
          content_md: input.content_md,
          status: input.status,
          meta_json: input.meta_json,
          actor: { companyId: auth.companyId, userId: auth.userId }
        });

        return c.json({ success: true, data: { id: page.id } }, 201);
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid request body" } }, 400);
        }
        if (error instanceof StaticPageSlugInvalidError) {
          return c.json({ success: false, error: { code: "INVALID_SLUG", message: "Slug is invalid (use lowercase letters, numbers, and hyphens only)" } }, 400);
        }
        if (error instanceof StaticPageSlugExistsError) {
          return c.json({ success: false, error: { code: "DUPLICATE_SLUG", message: "A page with this slug already exists" } }, 409);
        }
        console.error("POST /settings/pages failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to create page" } }, 500);
      }
    }
  );

  // PATCH /settings/pages/:id - Update page
  app.openapi(
    createRoute({
      method: "patch",
      path: "/settings/pages/{id}",
      tags: ["Settings"],
      summary: "Update page",
      description: "Update an existing static page",
      security: [{ BearerAuth: [] }],
      request: {
        params: z.object({ id: z.string() }),
        body: {
          content: {
            "application/json": { schema: UpdatePageSchema }
          }
        }
      },
      responses: {
        200: { content: { "application/json": { schema: StaticPageResponseSchema } }, description: "Page updated" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" },
        409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Duplicate slug" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "platform", resource: "settings", permission: "update" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const pageId = NumericIdSchema.parse(c.req.param("id"));
        const payload = await c.req.json();
        const input = UpdatePageSchema.parse(payload);

        const page = await updateStaticPage({
          pageId,
          slug: input.slug,
          title: input.title,
          content_md: input.content_md,
          meta_json: input.meta_json,
          metaJsonProvided: "meta_json" in input,
          actor: { companyId: auth.companyId, userId: auth.userId }
        });

        return c.json({ success: true, data: page });
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid request body" } }, 400);
        }
        if (error instanceof StaticPageSlugInvalidError) {
          return c.json({ success: false, error: { code: "INVALID_SLUG", message: "Slug is invalid (use lowercase letters, numbers, and hyphens only)" } }, 400);
        }
        if (error instanceof StaticPageSlugExistsError) {
          return c.json({ success: false, error: { code: "DUPLICATE_SLUG", message: "A page with this slug already exists" } }, 409);
        }
        if (error instanceof StaticPageNotFoundError) {
          return c.json({ success: false, error: { code: "NOT_FOUND", message: "Page not found" } }, 404);
        }
        console.error("PATCH /settings/pages/:id failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to update page" } }, 500);
      }
    }
  );

  // POST /settings/pages/:id/publish - Publish page
  app.openapi(
    createRoute({
      method: "post",
      path: "/settings/pages/{id}/publish",
      tags: ["Settings"],
      summary: "Publish page",
      description: "Publish a static page",
      security: [{ BearerAuth: [] }],
      request: {
        params: z.object({ id: z.string() })
      },
      responses: {
        200: { content: { "application/json": { schema: StaticPageResponseSchema } }, description: "Page published" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "platform", resource: "settings", permission: "update" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const pageId = NumericIdSchema.parse(c.req.param("id"));

        const page = await publishStaticPage({
          pageId,
          actor: { companyId: auth.companyId, userId: auth.userId }
        });

        if (!page) {
          return c.json({ success: false, error: { code: "NOT_FOUND", message: "Page not found" } }, 404);
        }

        return c.json({ success: true, data: page });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid page ID" } }, 400);
        }
        if (error instanceof StaticPageNotFoundError) {
          return c.json({ success: false, error: { code: "NOT_FOUND", message: "Page not found" } }, 404);
        }
        console.error("POST /settings/pages/:id/publish failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to publish page" } }, 500);
      }
    }
  );

  // POST /settings/pages/:id/unpublish - Unpublish page
  app.openapi(
    createRoute({
      method: "post",
      path: "/settings/pages/{id}/unpublish",
      tags: ["Settings"],
      summary: "Unpublish page",
      description: "Unpublish a static page",
      security: [{ BearerAuth: [] }],
      request: {
        params: z.object({ id: z.string() })
      },
      responses: {
        200: { content: { "application/json": { schema: StaticPageResponseSchema } }, description: "Page unpublished" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "platform", resource: "settings", permission: "update" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const pageId = NumericIdSchema.parse(c.req.param("id"));

        const page = await unpublishStaticPage({
          pageId,
          actor: { companyId: auth.companyId, userId: auth.userId }
        });

        return c.json({ success: true, data: page });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid page ID" } }, 400);
        }
        if (error instanceof StaticPageNotFoundError) {
          return c.json({ success: false, error: { code: "NOT_FOUND", message: "Page not found" } }, 404);
        }
        console.error("POST /settings/pages/:id/unpublish failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to unpublish page" } }, 500);
      }
    }
  );

  // GET /pages/:slug - Get page by slug (public)
  app.openapi(
    createRoute({
      method: "get",
      path: "/pages/{slug}",
      tags: ["Settings"],
      summary: "Get page by slug",
      description: "Get a public static page by its slug",
      security: [],
      request: {
        params: z.object({ slug: z.string() })
      },
      responses: {
        200: { content: { "application/json": { schema: StaticPageResponseSchema } }, description: "Page found" },
        404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const slug = c.req.param("slug");
        const page = await getPublicPage(slug);

        if (!page) {
          return c.json({ success: false, error: { code: "NOT_FOUND", message: "Page not found" } }, 404);
        }

        return c.json({ success: true, data: page });
      } catch (error) {
        console.error("GET /pages/:slug failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch page" } }, 500);
      }
    }
  );
};
