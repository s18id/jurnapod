// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Feature Flags Routes
 *
 * HTTP API for managing feature flags with explicit typed columns:
 * - GET /features - List all feature flags for the company
 * - GET /features/:key - Get a specific feature flag
 * - POST /features - Create a new feature flag
 * - PUT /features/:key - Update a feature flag
 * - DELETE /features/:key - Delete a feature flag
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import {
  listFeatureFlags,
  getFeatureFlag,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  FeatureFlagNotFoundError,
  FeatureFlagValidationError
} from "../lib/features.js";
import { FeatureFlagKeySchema } from "@jurnapod/shared";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Request Schemas
// =============================================================================

const CreateFeatureFlagSchema = z.object({
  key: FeatureFlagKeySchema,
  enabled: z.boolean().default(true),
  config_json: z.string().optional(),
  rollout_percentage: z.number().int().min(0).max(100).optional(),
  target_segments: z.array(z.string()).nullable().optional(),
  start_at: z.string().datetime().nullable().optional(),
  end_at: z.string().datetime().nullable().optional()
});

const UpdateFeatureFlagSchema = z.object({
  enabled: z.boolean().optional(),
  config_json: z.string().optional(),
  rollout_percentage: z.number().int().min(0).max(100).optional(),
  target_segments: z.array(z.string()).nullable().optional(),
  start_at: z.string().datetime().nullable().optional(),
  end_at: z.string().datetime().nullable().optional()
});

// =============================================================================
// Feature Flags Routes
// =============================================================================

const featureFlagsRoutes = new Hono();

// Auth middleware
featureFlagsRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /features - List all feature flags for the company
featureFlagsRoutes.get("/", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "platform", resource: "settings",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const url = new URL(c.req.raw.url);
    const prefix = url.searchParams.get("prefix") ?? undefined;

    const flags = await listFeatureFlags({
      companyId: auth.companyId,
      prefix
    });

    return successResponse({
      data: flags
    });
  } catch (error) {
    console.error("GET /features failed", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch feature flags", 500);
  }
});

// GET /features/:key - Get a specific feature flag
featureFlagsRoutes.get("/:key", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "platform", resource: "settings",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const key = c.req.param("key");

    if (!key) {
      return errorResponse("INVALID_REQUEST", "Feature flag key is required", 400);
    }

    const flag = await getFeatureFlag({
      companyId: auth.companyId,
      key
    });

    if (!flag) {
      return errorResponse("NOT_FOUND", `Feature flag '${key}' not found`, 404);
    }

    return successResponse({
      data: flag
    });
  } catch (error) {
    if (error instanceof FeatureFlagValidationError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }
    console.error("GET /features/:key failed", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch feature flag", 500);
  }
});

// POST /features - Create a new feature flag
featureFlagsRoutes.post("/", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "platform", resource: "settings",
    permission: "create"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = CreateFeatureFlagSchema.parse(payload);

    // Check if flag already exists
    const existing = await getFeatureFlag({
      companyId: auth.companyId,
      key: input.key
    });

    if (existing) {
      return errorResponse("CONFLICT", `Feature flag '${input.key}' already exists`, 409);
    }

    const flag = await createFeatureFlag({
      companyId: auth.companyId,
      key: input.key,
      enabled: input.enabled,
      configJson: input.config_json,
      rolloutPercentage: input.rollout_percentage,
      targetSegments: input.target_segments,
      startAt: input.start_at,
      endAt: input.end_at
    });

    return successResponse({
      data: flag
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof FeatureFlagValidationError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }
    console.error("POST /features failed", error);
    return errorResponse("INTERNAL_ERROR", "Failed to create feature flag", 500);
  }
});

// PUT /features/:key - Update a feature flag
featureFlagsRoutes.put("/:key", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "platform", resource: "settings",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const key = c.req.param("key");

    if (!key) {
      return errorResponse("INVALID_REQUEST", "Feature flag key is required", 400);
    }

    const payload = await c.req.json();
    const input = UpdateFeatureFlagSchema.parse(payload);

    const flag = await updateFeatureFlag({
      companyId: auth.companyId,
      key,
      enabled: input.enabled,
      configJson: input.config_json,
      rolloutPercentage: input.rollout_percentage,
      targetSegments: input.target_segments,
      startAt: input.start_at,
      endAt: input.end_at
    });

    return successResponse({
      data: flag
    });
  } catch (error) {
    if (error instanceof FeatureFlagNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    if (error instanceof FeatureFlagValidationError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    console.error("PUT /features/:key failed", error);
    return errorResponse("INTERNAL_ERROR", "Failed to update feature flag", 500);
  }
});

// DELETE /features/:key - Delete a feature flag
featureFlagsRoutes.delete("/:key", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "platform", resource: "settings",
    permission: "delete"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const key = c.req.param("key");

    if (!key) {
      return errorResponse("INVALID_REQUEST", "Feature flag key is required", 400);
    }

    // Check if flag exists
    const existing = await getFeatureFlag({
      companyId: auth.companyId,
      key
    });

    if (!existing) {
      return errorResponse("NOT_FOUND", `Feature flag '${key}' not found`, 404);
    }

    await deleteFeatureFlag({
      companyId: auth.companyId,
      key
    });

    return successResponse({
      message: `Feature flag '${key}' deleted successfully`
    });
  } catch (error) {
    if (error instanceof FeatureFlagValidationError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }
    console.error("DELETE /features/:key failed", error);
    return errorResponse("INTERNAL_ERROR", "Failed to delete feature flag", 500);
  }
});

export { featureFlagsRoutes };
