// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  addIngredientToRecipe,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  getRecipeIngredients
} from "@/lib/recipe-composition";

// Parse recipe ID from URL pathname
function parseRecipeId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/inventory\/recipes\/([^/]+)\/ingredients\/?$/);
  return NumericIdSchema.parse(match?.[1]);
}

// GET /api/inventory/recipes/[recipeId]/ingredients
export const GET = withAuth(
  async (request, auth) => {
    try {
      const recipeId = parseRecipeId(request);
      const ingredients = await getRecipeIngredients(auth.companyId, recipeId);
      return successResponse(ingredients);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid recipe ID", 400);
      }
      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      console.error("GET recipe ingredients failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "inventory",
      permission: "read"
    })
  ]
);

// POST /api/inventory/recipes/[recipeId]/ingredients
export const POST = withAuth(
  async (request, auth) => {
    try {
      const recipeId = parseRecipeId(request);
      const payload = await request.json();

      // Import Zod schema from shared package
      const { CreateRecipeIngredientSchema } = await import("@jurnapod/shared");
      const input = CreateRecipeIngredientSchema.parse(payload);

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

      return successResponse(ingredient, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }
      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", error.message, 403);
      }
      console.error("POST recipe ingredient failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "inventory",
      permission: "create"
    })
  ]
);
