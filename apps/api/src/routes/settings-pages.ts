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

const CreatePageSchema = z.object({
  slug: z.string().min(1).max(100),
  title: z.string().min(1).max(191),
  content_md: z.string(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional().default("DRAFT"),
  meta_json: z.record(z.any()).optional()
});

const UpdatePageSchema = z.object({
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
      module: "settings",
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
      module: "settings",
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
      module: "settings",
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
      module: "settings",
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
      module: "settings",
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
