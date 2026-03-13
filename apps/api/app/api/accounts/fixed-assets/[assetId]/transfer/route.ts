// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { TransferRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import { recordTransfer } from "../../../../../../src/lib/fixed-assets-lifecycle";
import { findFixedAssetById } from "../../../../../../src/lib/master-data";

function parseAssetId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const assetIdRaw = pathname.split("/").filter(Boolean).slice(-2)[0];
  return NumericIdSchema.parse(assetIdRaw);
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const assetId = parseAssetId(request);
      const payload = await request.json();
      const input = TransferRequestSchema.parse(payload);

      const asset = await findFixedAssetById(auth.companyId, assetId);
      if (!asset) {
        return errorResponse("NOT_FOUND", "Fixed asset not found", 404);
      }

      const result = await recordTransfer(auth.companyId, assetId, input, {
        userId: auth.userId
      });

      return successResponse({
        event_id: result.event_id,
        journal_batch_id: result.journal_batch_id,
        to_outlet_id: result.to_outlet_id
      });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      const err = error as { code?: string; message?: string };
      if (err.code === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", err.message || "Fixed asset not found", 404);
      }
      if (err.code === "ASSET_ALREADY_DISPOSED") {
        return errorResponse("CONFLICT", err.message || "Asset already disposed", 409);
      }
      if (err.code === "INVALID_REFERENCE") {
        return errorResponse("INVALID_REFERENCE", err.message || "Invalid reference", 400);
      }
      if (err.code === "FORBIDDEN") {
        return errorResponse("FORBIDDEN", err.message || "Access denied", 403);
      }
      if (err.code === "FISCAL_YEAR_CLOSED") {
        return errorResponse("FISCAL_YEAR_CLOSED", err.message || "Date outside open fiscal year", 400);
      }
      if (err.code === "DUPLICATE_EVENT") {
        return errorResponse("CONFLICT", "Duplicate event", 409);
      }

      console.error("POST /api/accounts/fixed-assets/:id/transfer failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Transfer failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "update" })]
);
