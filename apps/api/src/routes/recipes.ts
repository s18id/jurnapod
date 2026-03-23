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
 * Required role: OWNER, ADMIN, ACCOUNTANT for recipe operations
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

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

const RECIPES_ROLES_READ = ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT", "CASHIER"] as const;
const RECIPES_ROLES_WRITE = ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"] as const;

// =============================================================================
// Request Schemas
// =============================================================================

const RecipeIngredientCreateSchema = z.object({
  ingredient_item_id: z.number().int().positive(),
  quantity: z.number().positive()
});

const RecipeIngredientUpdateSchema = z.object({
  quantity: z.number().positive()
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
    
    // Check access permission
    const accessResult = await requireAccess({
      roles: [...RECIPES_ROLES_READ],
      module: "inventory",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const recipeId = NumericIdSchema.parse(c.req.param("id"));
    
    // For now, return empty array as placeholder
    // TODO: Implement actual recipe ingredients listing
    return successResponse([]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid recipe ID", 400);
    }

    console.error("GET /recipes/:id/ingredients failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch recipe ingredients", 500);
  }
});

// POST /recipes/:id/ingredients - Add recipe ingredient
recipesRoutes.post("/:id/ingredients", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission
    const accessResult = await requireAccess({
      roles: [...RECIPES_ROLES_WRITE],
      module: "inventory",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const recipeId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = RecipeIngredientCreateSchema.parse(payload);

    // For now, return success as placeholder
    // TODO: Implement actual recipe ingredient creation
    return successResponse({ 
      id: Math.floor(Math.random() * 1000000),
      recipe_id: recipeId,
      ingredient_item_id: input.ingredient_item_id,
      quantity: input.quantity
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("POST /recipes/:id/ingredients failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to add recipe ingredient", 500);
  }
});

// PUT /recipes/ingredients/:id - Update recipe ingredient
recipesRoutes.put("/ingredients/:id", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission
    const accessResult = await requireAccess({
      roles: [...RECIPES_ROLES_WRITE],
      module: "inventory",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const ingredientId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = RecipeIngredientUpdateSchema.parse(payload);

    // For now, return success as placeholder
    // TODO: Implement actual recipe ingredient update
    return successResponse({
      id: ingredientId,
      quantity: input.quantity
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("PUT /recipes/ingredients/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update recipe ingredient", 500);
  }
});

// DELETE /recipes/ingredients/:id - Delete recipe ingredient
recipesRoutes.delete("/ingredients/:id", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission
    const accessResult = await requireAccess({
      roles: [...RECIPES_ROLES_WRITE],
      module: "inventory",
      permission: "delete"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const ingredientId = NumericIdSchema.parse(c.req.param("id"));

    // For now, return success as placeholder
    // TODO: Implement actual recipe ingredient deletion
    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid ingredient ID", 400);
    }

    console.error("DELETE /recipes/ingredients/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete recipe ingredient", 500);
  }
});

// GET /recipes/:id/cost - Get recipe cost
recipesRoutes.get("/:id/cost", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission
    const accessResult = await requireAccess({
      roles: [...RECIPES_ROLES_READ],
      module: "inventory",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const recipeId = NumericIdSchema.parse(c.req.param("id"));

    // For now, return placeholder cost
    // TODO: Implement actual recipe cost calculation
    return successResponse({
      recipe_id: recipeId,
      total_cost: 0,
      currency: "IDR",
      ingredients: []
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid recipe ID", 400);
    }

    console.error("GET /recipes/:id/cost failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to calculate recipe cost", 500);
  }
});

export { recipesRoutes };