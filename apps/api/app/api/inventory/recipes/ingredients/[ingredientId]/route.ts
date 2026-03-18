// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  removeIngredientFromRecipe,
  updateRecipeIngredient
} from "@/lib/recipe-composition";

// Parse ingredient ID from URL pathname
function parseIngredientId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/inventory\/recipes\/ingredients\/([^/]+)\/?$/);
  return NumericIdSchema.parse(match?.[1]);
}

// PATCH /api/inventory/recipes/ingredients/[ingredientId]
export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const ingredientId = parseIngredientId(request);
      const payload = await request.json();

      // Import Zod schema from shared package
      const { UpdateRecipeIngredientSchema } = await import("@jurnapod/shared");
      const input = UpdateRecipeIngredientSchema.parse(payload);

      const ingredient = await updateRecipeIngredient(
        auth.companyId,
        ingredientId,
        {
          quantity: input.quantity,
          unit_of_measure: input.unit_of_measure,
          is_active: input.is_active
        },
        { userId: auth.userId }
      );

      return successResponse(ingredient);
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
      console.error("PATCH recipe ingredient failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "inventory",
      permission: "update"
    })
  ]
);

// DELETE /api/inventory/recipes/ingredients/[ingredientId]
export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const ingredientId = parseIngredientId(request);

      await removeIngredientFromRecipe(auth.companyId, ingredientId, {
        userId: auth.userId
      });

      return successResponse({ success: true });
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid ingredient ID", 400);
      }
      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      console.error("DELETE recipe ingredient failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "inventory",
      permission: "delete"
    })
  ]
);
