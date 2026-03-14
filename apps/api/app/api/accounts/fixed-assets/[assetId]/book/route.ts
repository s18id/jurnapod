// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import { getAssetBook } from "../../../../../../src/lib/fixed-assets-lifecycle";
import { findFixedAssetById } from "../../../../../../src/lib/master-data";

function parseAssetId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const assetIdRaw = pathname.split("/").filter(Boolean).slice(-2)[0];
  return NumericIdSchema.parse(assetIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const assetId = parseAssetId(request);

      const asset = await findFixedAssetById(auth.companyId, assetId);
      if (!asset) {
        return errorResponse("NOT_FOUND", "Fixed asset not found", 404);
      }

      const book = await getAssetBook(auth.companyId, assetId, { userId: auth.userId });

      return successResponse(book);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      const err = error as { code?: string; message?: string };
      if (err.code === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", err.message || "Fixed asset not found", 404);
      }

      console.error("GET /api/accounts/fixed-assets/:id/book failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Book request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "read" })]
);
