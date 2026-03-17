// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  calculateRecipeCost,
  DatabaseReferenceError
} from "@/lib/recipe-composition";

// Parse recipe ID from URL pathname
function parseRecipeId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/inventory\/recipes\/([^/]+)\/cost\/?$/);
  return NumericIdSchema.parse(match?.[1]);
}

// GET /api/inventory/recipes/[recipeId]/cost
export const GET = withAuth(
  async (request, auth) => {
    try {
      const recipeId = parseRecipeId(request);
      const costBreakdown = await calculateRecipeCost(auth.companyId, recipeId);
      return successResponse(costBreakdown);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid recipe ID", 400);
      }
      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      console.error("GET recipe cost failed", error);
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
