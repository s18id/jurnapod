// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Goods Receipt Routes
 *
 * Thin routes delegating to lib/purchasing/goods-receipt.ts.
 * Required ACL: purchasing.receipts resource with READ/CREATE permissions
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  GoodsReceiptCreateSchema,
  NumericIdSchema,
  toPurchaseOrderStatusLabel,
  UtcIsoSchema,
} from "@jurnapod/shared";
import { requireAccess, authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import {
  listGoodsReceipts,
  getGoodsReceiptById,
  createGoodsReceipt,
} from "../../lib/purchasing/goods-receipt.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const receiptRoutes = new Hono();

// Auth middleware
receiptRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /purchasing/receipts
receiptRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "receipts",
      permission: "read"
    })(c.req.raw, auth);
    if (accessResult !== null) return accessResult;

    const url = new URL(c.req.raw.url);
    const supplierId = url.searchParams.get("supplier_id") ? Number(url.searchParams.get("supplier_id")) : undefined;
    const dateFrom = UtcIsoSchema.optional().parse(url.searchParams.get("date_from") ?? undefined);
    const dateTo = UtcIsoSchema.optional().parse(url.searchParams.get("date_to") ?? undefined);
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20;
    const offset = url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0;

    const result = await listGoodsReceipts({
      companyId: auth.companyId,
      supplierId,
      dateFrom,
      dateTo,
      limit,
      offset
    });

    return successResponse({
      receipts: result.receipts.map((r) => ({
        ...r,
        status: toPurchaseOrderStatusLabel(Number(r.status))
      })),
      total: result.total,
      limit: result.limit,
      offset: result.offset
    });
  } catch (error) {
    console.error("GET /purchasing/receipts failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch goods receipts", 500);
  }
});

// GET /purchasing/receipts/:id
receiptRoutes.get("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "receipts",
      permission: "read"
    })(c.req.raw, auth);
    if (accessResult !== null) return accessResult;

    const receiptId = NumericIdSchema.parse(c.req.param("id"));

    const receipt = await getGoodsReceiptById(auth.companyId, receiptId);
    if (!receipt) {
      return errorResponse("NOT_FOUND", "Goods receipt not found", 404);
    }

    return successResponse({
      id: receipt.id,
      company_id: receipt.company_id,
      supplier_id: receipt.supplier_id,
      supplier_name: receipt.supplier_name,
      reference_number: receipt.reference_number,
      receipt_date: receipt.receipt_date.toISOString(),
      status: toPurchaseOrderStatusLabel(receipt.status),
      notes: receipt.notes,
      created_by_user_id: receipt.created_by_user_id,
      updated_by_user_id: receipt.updated_by_user_id,
      created_at: receipt.created_at.toISOString(),
      updated_at: receipt.updated_at.toISOString(),
      po_reference: receipt.po_reference,
      lines: receipt.lines.map((l) => ({
        id: l.id,
        line_no: l.line_no,
        po_line_id: l.po_line_id,
        item_id: l.item_id,
        description: l.description,
        qty: l.qty,
        unit: l.unit,
        over_receipt_allowed: Boolean(l.over_receipt_allowed)
      }))
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid goods receipt ID", 400);
    }
    console.error("GET /purchasing/receipts/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch goods receipt", 500);
  }
});

// POST /purchasing/receipts
receiptRoutes.post("/", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "receipts",
      permission: "create"
    })(c.req.raw, auth);
    if (accessResult !== null) return accessResult;

    let input: z.infer<typeof GoodsReceiptCreateSchema> | undefined;
    try {
      const payload = await c.req.json();
      input = GoodsReceiptCreateSchema.parse(payload);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    const result = await createGoodsReceipt(auth.companyId, auth.userId, input);

    return successResponse({
      id: result.receipt.id,
      company_id: result.receipt.company_id,
      supplier_id: result.receipt.supplier_id,
      supplier_name: result.receipt.supplier_name,
      reference_number: result.receipt.reference_number,
      receipt_date: result.receipt.receipt_date.toISOString(),
      status: toPurchaseOrderStatusLabel(result.receipt.status),
      notes: result.receipt.notes,
      created_by_user_id: result.receipt.created_by_user_id,
      updated_by_user_id: result.receipt.updated_by_user_id,
      created_at: result.receipt.created_at.toISOString(),
      updated_at: result.receipt.updated_at.toISOString(),
      po_reference: result.receipt.po_reference,
      lines: result.receipt.lines.map((l) => ({
        id: l.id,
        line_no: l.line_no,
        po_line_id: l.po_line_id,
        item_id: l.item_id,
        description: l.description,
        qty: l.qty,
        unit: l.unit,
        over_receipt_allowed: Boolean(l.over_receipt_allowed)
      })),
      ...(result.warnings.length > 0 ? { warnings: result.warnings } : {})
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (typeof error === "object" && error !== null && "code" in error) {
      const err = error as { code: string; message?: string; po_line_id?: number };
      if (err.code === "SUPPLIER_NOT_FOUND") {
        return errorResponse("NOT_FOUND", err.message ?? "Supplier not found", 404);
      }
      if (err.code === "PO_LINE_NOT_FOUND") {
        return errorResponse("NOT_FOUND", `PO line with id ${err.po_line_id} not found`, 404);
      }
      if (["INVALID_PO_STATUS", "SUPPLIER_MISMATCH", "ITEM_MISMATCH"].includes(err.code)) {
        return errorResponse("INVALID_REQUEST", err.message ?? "Invalid operation", 400);
      }
    }
    console.error("POST /purchasing/receipts failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create goods receipt", 500);
  }
});

export { receiptRoutes };
