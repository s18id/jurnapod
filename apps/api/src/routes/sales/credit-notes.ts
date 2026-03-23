// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Credit Note Routes
 *
 * Routes for sales credit note operations.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  NumericIdSchema,
  SalesCreditNoteCreateRequestSchema,
  SalesCreditNoteUpdateRequestSchema
} from "@jurnapod/shared";
import {
  createCreditNote,
  getCreditNote,
  listCreditNotes,
  updateCreditNote,
  postCreditNote,
  voidCreditNote,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError
} from "@/lib/sales";
import { listUserOutletIds, userHasOutletAccess } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/response";
import type { AuthContext } from "@/lib/auth-guard";

const creditNoteRoutes = new Hono();

// ============================================================================
// GET /sales/credit-notes - List credit notes
// ============================================================================

creditNoteRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const url = new URL(c.req.raw.url);
    const outletIdParam = url.searchParams.get("outlet_id");
    const status = url.searchParams.get("status") || undefined;
    const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!) : undefined;
    const offset = url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!) : undefined;

    let outletIds: number[];
    if (outletIdParam) {
      const outletId = NumericIdSchema.parse(outletIdParam);
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, outletId);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      outletIds = [outletId];
    } else {
      outletIds = await listUserOutletIds(auth.userId, auth.companyId);
    }

    const creditNotes = await listCreditNotes(auth.companyId, {
      outletIds,
      status: status as "DRAFT" | "POSTED" | "VOID" | undefined,
      limit,
      offset
    });

    return successResponse(creditNotes);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    console.error("GET /sales/credit-notes failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Credit notes request failed", 500);
  }
});

// ============================================================================
// GET /sales/credit-notes/:id - Get credit note by ID
// ============================================================================

creditNoteRoutes.get("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const creditNoteId = NumericIdSchema.parse(c.req.param("id"));
    const creditNote = await getCreditNote(auth.companyId, creditNoteId);

    if (!creditNote) {
      return errorResponse("NOT_FOUND", "Credit note not found", 404);
    }

    // Validate outlet access
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, creditNote.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    return successResponse(creditNote);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid credit note ID", 400);
    }

    console.error("GET /sales/credit-notes/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Credit note request failed", 500);
  }
});

// ============================================================================
// POST /sales/credit-notes - Create credit note
// ============================================================================

creditNoteRoutes.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    let input;
    try {
      input = SalesCreditNoteCreateRequestSchema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      throw error;
    }

    // Validate outlet access
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const creditNote = await createCreditNote(auth.companyId, {
      outlet_id: input.outlet_id,
      invoice_id: input.invoice_id,
      credit_note_date: input.credit_note_date,
      client_ref: input.client_ref,
      reason: input.reason,
      notes: input.notes,
      amount: input.amount,
      lines: input.lines
    }, { userId: auth.userId });

    return successResponse(creditNote, 201);
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    console.error("POST /sales/credit-notes failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Credit note creation failed", 500);
  }
});

// ============================================================================
// PATCH /sales/credit-notes/:id - Update credit note
// ============================================================================

creditNoteRoutes.patch("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const creditNoteId = NumericIdSchema.parse(c.req.param("id"));

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    let input;
    try {
      input = SalesCreditNoteUpdateRequestSchema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      throw error;
    }

    // Check credit note exists and user has outlet access
    const existingCreditNote = await getCreditNote(auth.companyId, creditNoteId);
    if (!existingCreditNote) {
      return errorResponse("NOT_FOUND", "Credit note not found", 404);
    }

    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingCreditNote.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const updatedCreditNote = await updateCreditNote(auth.companyId, creditNoteId, {
      credit_note_date: input.credit_note_date,
      reason: input.reason,
      notes: input.notes,
      amount: input.amount,
      lines: input.lines
    }, { userId: auth.userId });

    if (!updatedCreditNote) {
      return errorResponse("NOT_FOUND", "Credit note not found", 404);
    }

    return successResponse(updatedCreditNote);
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    console.error("PATCH /sales/credit-notes/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Credit note update failed", 500);
  }
});

// ============================================================================
// POST /sales/credit-notes/:id/post - Post credit note
// ============================================================================

creditNoteRoutes.post("/:id/post", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const creditNoteId = NumericIdSchema.parse(c.req.param("id"));

    // Check credit note exists and user has outlet access
    const existingCreditNote = await getCreditNote(auth.companyId, creditNoteId);
    if (!existingCreditNote) {
      return errorResponse("NOT_FOUND", "Credit note not found", 404);
    }

    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingCreditNote.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const postedCreditNote = await postCreditNote(auth.companyId, creditNoteId, {
      userId: auth.userId
    });

    if (!postedCreditNote) {
      return errorResponse("NOT_FOUND", "Credit note not found", 404);
    }

    return successResponse(postedCreditNote);
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid credit note ID", 400);
    }

    console.error("POST /sales/credit-notes/:id/post failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Credit note posting failed", 500);
  }
});

// ============================================================================
// POST /sales/credit-notes/:id/void - Void credit note
// ============================================================================

creditNoteRoutes.post("/:id/void", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const creditNoteId = NumericIdSchema.parse(c.req.param("id"));

    // Check credit note exists and user has outlet access
    const existingCreditNote = await getCreditNote(auth.companyId, creditNoteId);
    if (!existingCreditNote) {
      return errorResponse("NOT_FOUND", "Credit note not found", 404);
    }

    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingCreditNote.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const voidedCreditNote = await voidCreditNote(auth.companyId, creditNoteId, {
      userId: auth.userId
    });

    if (!voidedCreditNote) {
      return errorResponse("NOT_FOUND", "Credit note not found", 404);
    }

    return successResponse(voidedCreditNote);
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid credit note ID", 400);
    }

    console.error("POST /sales/credit-notes/:id/void failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Credit note void failed", 500);
  }
});

export { creditNoteRoutes };
