// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Recipe Routes
 *
 * Routes for recipe management:
 * - GET /recipes/:id/ingredients - List recipe ingredients
 * - POST /recipes/:id/ingredients - Add recipe ingredient
 * - PUT /recipes/ingredients/:id - Update recipe ingredient
 * - DELETE /recipes/ingredients/:id - Delete recipe ingredient
 * - GET /recipes/:id/cost - Get recipe cost
 *
 * Uses permission bitmask from user_role_assignments for authorization.
 */

import { Hono } from "hono";
import { z } from "zod";
import { z as zodOpenApi, createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import { NumericIdSchema } from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import {
  addIngredientToRecipe,
  getRecipeIngredients,
  updateRecipeIngredient,
  removeIngredientFromRecipe,
  calculateRecipeCost,
  DatabaseConflictError,
  DatabaseReferenceError,
  DatabaseForbiddenError
} from "../lib/recipe-composition.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Request Schemas
// =============================================================================

const RecipeIngredientCreateSchema = z.object({
  ingredient_item_id: z.number().int().positive(),
  quantity: z.number().positive(),
  unit_of_measure: z.string().optional()
});

const RecipeIngredientUpdateSchema = z.object({
  quantity: z.number().positive(),
  unit_of_measure: z.string().optional()
});

// =============================================================================
// Recipe Routes
// =============================================================================

const recipesRoutes = new Hono();

// Auth middleware
recipesRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /recipes/:id/ingredients - List recipe ingredients
recipesRoutes.get("/:id/ingredients", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "inventory",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const recipeId = NumericIdSchema.parse(c.req.param("id"));

    const ingredients = await getRecipeIngredients(auth.companyId, recipeId);
    return successResponse(ingredients);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid recipe ID", 400);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    console.error("GET /recipes/:id/ingredients failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch recipe ingredients", 500);
  }
});

// POST /recipes/:id/ingredients - Add recipe ingredient
recipesRoutes.post("/:id/ingredients", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "inventory",
      resource: "items",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const recipeId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = RecipeIngredientCreateSchema.parse(payload);

    const ingredient = await addIngredientToRecipe(
      auth.companyId,
      recipeId,
      {
        ingredient_item_id: input.ingredient_item_id,
        quantity: input.quantity,
        unit_of_measure: input.unit_of_measure
      },
      { userId: auth.userId }
    );

    return successResponse({ id: ingredient.id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    console.error("POST /recipes/:id/ingredients failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to add recipe ingredient", 500);
  }
});

// PATCH /recipes/ingredients/:id - Update recipe ingredient
recipesRoutes.patch("/ingredients/:id", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "inventory",
      resource: "items",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const ingredientId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = RecipeIngredientUpdateSchema.parse(payload);

    const ingredient = await updateRecipeIngredient(
      auth.companyId,
      ingredientId,
      {
        quantity: input.quantity,
        unit_of_measure: input.unit_of_measure
      },
      { userId: auth.userId }
    );

    return successResponse(ingredient);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    console.error("PUT /recipes/ingredients/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update recipe ingredient", 500);
  }
});

// DELETE /recipes/ingredients/:id - Delete recipe ingredient
recipesRoutes.delete("/ingredients/:id", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "inventory",
      resource: "items",
      permission: "delete"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const ingredientId = NumericIdSchema.parse(c.req.param("id"));

    await removeIngredientFromRecipe(
      auth.companyId,
      ingredientId,
      { userId: auth.userId }
    );

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid ingredient ID", 400);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    console.error("DELETE /recipes/ingredients/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete recipe ingredient", 500);
  }
});

// GET /recipes/:id/cost - Get recipe cost
recipesRoutes.get("/:id/cost", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "inventory",
      resource: "items",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const recipeId = NumericIdSchema.parse(c.req.param("id"));

    const cost = await calculateRecipeCost(auth.companyId, recipeId);
    return successResponse(cost);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid recipe ID", 400);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    console.error("GET /recipes/:id/cost failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to calculate recipe cost", 500);
  }
});

// ============================================================================
// OpenAPI Route Registration (for use with OpenAPIHono)
// ============================================================================

/**
 * Registers recipe routes with an OpenAPIHono instance.
 * This enables auto-generated OpenAPI specs for the recipe endpoints.
 */
export function registerRecipeRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  // GET /recipes/:id/ingredients - List recipe ingredients
  const listIngredientsRoute = createRoute({
    path: "/recipes/{id}/ingredients",
    method: "get",
    tags: ["Inventory"],
    summary: "List recipe ingredients",
    description: "Get ingredients for a recipe",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: NumericIdSchema,
      }),
    },
    responses: {
      200: { description: "List of ingredients" },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      404: { description: "Recipe not found" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(listIngredientsRoute, (async (c: any) => {
    const auth = c.get("auth");
    const { id } = c.req.valid("param");
    const recipeId = NumericIdSchema.parse(id);

    const ingredients = await getRecipeIngredients(auth.companyId, recipeId);
    return c.json({ success: true, data: ingredients });
  }) as any);

  // GET /recipes/:id/cost - Get recipe cost
  const getRecipeCostRoute = createRoute({
    path: "/recipes/{id}/cost",
    method: "get",
    tags: ["Inventory"],
    summary: "Get recipe cost",
    description: "Calculate the total cost of a recipe",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: NumericIdSchema,
      }),
    },
    responses: {
      200: { description: "Recipe cost" },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      404: { description: "Recipe not found" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(getRecipeCostRoute, (async (c: any) => {
    const auth = c.get("auth");
    const { id } = c.req.valid("param");
    const recipeId = NumericIdSchema.parse(id);

    const cost = await calculateRecipeCost(auth.companyId, recipeId);
    return c.json({ success: true, data: cost });
  }) as any);
}

export { recipesRoutes };