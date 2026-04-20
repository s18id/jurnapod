// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Exceptions Route (Story 47.4)
 *
 * Thin HTTP adapters that delegate to the AP exception service.
 * All business logic is in the service layer (lib/accounting/ap-exceptions.ts).
 *
 * Routes:
 * GET  /api/accounting/ap-exceptions/worklist       - List AP exceptions with AC8 detect-then-list
 * PUT  /api/accounting/ap-exceptions/:id/assign     - Assign exception to user
 * PUT  /api/accounting/ap-exceptions/:id/resolve    - Resolve or dismiss exception
 *
 * ACL:
 * - GET worklist: OR policy — allow if EITHER (accounting.journals + ANALYZE) OR (purchasing.suppliers + ANALYZE)
 * - PUT assign/resolve: require accounting.journals + UPDATE
 * - FIX(47.4-WP-D): marker on ACL policy decisions
 */

import { Hono } from "hono";
import type { AuthContext } from "@/lib/auth-guard.js";
import { authenticateRequest, requireAccess } from "@/lib/auth-guard.js";
import { errorResponse, successResponse } from "@/lib/response.js";
import {
  detectThenList,
  assignException,
  resolveException,
  APExceptionNotFoundError,
  APExceptionInvalidTransitionError,
} from "@/lib/accounting/ap-exceptions.js";
import {
  ApExceptionWorklistQuerySchema,
  ApExceptionAssignPayloadSchema,
  ApExceptionResolvePayloadSchema,
  AP_EXCEPTION_TYPE,
  AP_EXCEPTION_STATUS,
  toApExceptionTypeCode,
  toApExceptionStatusCode,
  toApExceptionTypeLabel,
  toApExceptionStatusLabel,
} from "@jurnapod/shared";
import type { APException, APExceptionWorklistFilters } from "@/lib/accounting/ap-exceptions.js";

const apExceptionRoutes = new Hono();

// ============================================================================
// Auth Middleware
// ============================================================================

apExceptionRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    return errorResponse("UNAUTHORIZED", "Missing or invalid access token", 401);
  }
  c.set("auth", authResult.auth);
  await next();
});

// ============================================================================
// ACL Helper: OR Policy for GET worklist
// ============================================================================

/**
 * OR ACL guard for GET worklist.
 * Allow if user has EITHER:
 *   a) accounting.journals + ANALYZE
 *   b) purchasing.suppliers + ANALYZE
 * FIX(47.4-WP-D): OR policy requires two separate requireAccess calls;
 * first check passes if either permission set is satisfied.
 */
function requireAccessOr(
  guardA: AuthenticatedRouteGuard,
  guardB: AuthenticatedRouteGuard
): AuthenticatedRouteGuard {
  return async (request, auth) => {
    // Try option A first
    const resultA = await guardA(request, auth);
    if (resultA === null) {
      // Option A passed
      return null;
    }
    // Try option B
    const resultB = await guardB(request, auth);
    if (resultB === null) {
      // Option B passed
      return null;
    }
    // Both failed — return the result from option A (first denial)
    return resultA;
  };
}

type AuthenticatedRouteGuard = (
  request: Request,
  auth: AuthContext
) => Promise<Response | null> | Response | null;

// Build the two access guards for OR policy
const accountingJournalsAnalyze = requireAccess({
  module: "accounting",
  resource: "journals",
  permission: "analyze",
});

const purchasingSuppliersAnalyze = requireAccess({
  module: "purchasing",
  resource: "suppliers",
  permission: "analyze",
});

const worklistAccessGuard = requireAccessOr(
  accountingJournalsAnalyze,
  purchasingSuppliersAnalyze
);

// Guard for assign/resolve — requires accounting.journals + UPDATE
const assignResolveAccessGuard = requireAccess({
  module: "accounting",
  resource: "journals",
  permission: "update",
});

// ============================================================================
// Route: GET /worklist — AC8 detect-then-list
// ============================================================================

apExceptionRoutes.get("/worklist", async (c) => {
  const auth = c.get("auth") as AuthContext;

  // ACL check — OR policy
  const accessResult = await worklistAccessGuard(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    // Parse and validate query params
    const url = new URL(c.req.raw.url);
    const queryParams = ApExceptionWorklistQuerySchema.safeParse({
      type: url.searchParams.get("type") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      supplier_id: url.searchParams.get("supplier_id") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    if (!queryParams.success) {
      return errorResponse(
        "INVALID_REQUEST",
        `Invalid query parameters: ${queryParams.error.message}`,
        400
      );
    }

    // FIX(47.4-WP-D): Map string labels to int enum codes for service layer.
    // Service layer uses int enums internally (matching migration 0188 canonical).
    const filters: APExceptionWorklistFilters = {};

    if (queryParams.data.type !== undefined) {
      const typeCode = toApExceptionTypeCode(queryParams.data.type);
      if (typeCode !== undefined) {
        filters.type = typeCode as (typeof AP_EXCEPTION_TYPE)[keyof typeof AP_EXCEPTION_TYPE];
      }
    }

    if (queryParams.data.status !== undefined) {
      const statusCode = toApExceptionStatusCode(queryParams.data.status);
      if (statusCode !== undefined) {
        filters.status = statusCode as (typeof AP_EXCEPTION_STATUS)[keyof typeof AP_EXCEPTION_STATUS];
      }
    }

    if (queryParams.data.supplier_id !== undefined) {
      filters.supplierId = queryParams.data.supplier_id;
    }

    if (queryParams.data.search !== undefined) {
      filters.search = queryParams.data.search;
    }

    // FIX(47.4-WP-D): as_of_date defaults to today for on-demand variance detection.
    // Route layer computes the date string for service call.
    const asOfDate = new Date().toISOString().split("T")[0];

    // Execute AC8 flow: detect then list
    const result = await detectThenList(
      auth.companyId,
      asOfDate,
      filters,
      {
        limit: queryParams.data.limit,
        cursor: queryParams.data.cursor ?? null,
      }
    );

    // FIX(47.4-WP-D): Map int enum responses back to string labels for API compatibility.
    const response = {
      exceptions: result.exceptions.map(mapExceptionToResponse),
      total: result.total,
      next_cursor: result.nextCursor,
      has_more: result.hasMore,
    };

    return successResponse(response);
  } catch (err) {
    console.error("GET /worklist error:", err);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AP exceptions worklist", 500);
  }
});

// ============================================================================
// Route: PUT /:id/assign — Assign exception to user
// ============================================================================

apExceptionRoutes.put("/:id/assign", async (c) => {
  const auth = c.get("auth") as AuthContext;

  // ACL check — requires accounting.journals + UPDATE
  const accessResult = await assignResolveAccessGuard(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    // Parse exception ID from params
    const idParam = c.req.param("id");
    const exceptionId = Number(idParam);
    if (!Number.isSafeInteger(exceptionId) || exceptionId <= 0) {
      return errorResponse("INVALID_REQUEST", "Invalid exception ID", 400);
    }

    // Parse request body
    const body = await c.req.json().catch(() => null);
    const payload = ApExceptionAssignPayloadSchema.safeParse(body);

    if (!payload.success) {
      return errorResponse(
        "INVALID_REQUEST",
        `Invalid request body: ${payload.error.message}`,
        400
      );
    }

    // Call service
    const updated = await assignException(
      auth.companyId,
      exceptionId,
      payload.data.assigned_to_user_id
    );

    return successResponse(mapExceptionToResponse(updated));
  } catch (err) {
    if (err instanceof APExceptionNotFoundError) {
      return errorResponse("NOT_FOUND", err.message, 404);
    }
    if (err instanceof APExceptionInvalidTransitionError) {
      return errorResponse("INVALID_TRANSITION", err.message, 409);
    }
    console.error("PUT /:id/assign error:", err);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to assign AP exception", 500);
  }
});

// ============================================================================
// Route: PUT /:id/resolve — Resolve or dismiss exception
// ============================================================================

apExceptionRoutes.put("/:id/resolve", async (c) => {
  const auth = c.get("auth") as AuthContext;

  // ACL check — requires accounting.journals + UPDATE
  const accessResult = await assignResolveAccessGuard(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  try {
    // Parse exception ID from params
    const idParam = c.req.param("id");
    const exceptionId = Number(idParam);
    if (!Number.isSafeInteger(exceptionId) || exceptionId <= 0) {
      return errorResponse("INVALID_REQUEST", "Invalid exception ID", 400);
    }

    // Parse request body
    const body = await c.req.json().catch(() => null);
    const payload = ApExceptionResolvePayloadSchema.safeParse(body);

    if (!payload.success) {
      return errorResponse(
        "INVALID_REQUEST",
        `Invalid request body: ${payload.error.message}`,
        400
      );
    }

    // Map status string to int code
    // RESOLVED=3, DISMISSED=4 per constants
    const targetStatus = payload.data.status === "RESOLVED"
      ? AP_EXCEPTION_STATUS.RESOLVED
      : AP_EXCEPTION_STATUS.DISMISSED;

    // Call service
    const updated = await resolveException(
      auth.companyId,
      exceptionId,
      auth.userId,
      targetStatus,
      payload.data.resolution_note
    );

    return successResponse(mapExceptionToResponse(updated));
  } catch (err) {
    if (err instanceof APExceptionNotFoundError) {
      return errorResponse("NOT_FOUND", err.message, 404);
    }
    if (err instanceof APExceptionInvalidTransitionError) {
      return errorResponse("INVALID_TRANSITION", err.message, 409);
    }
    console.error("PUT /:id/resolve error:", err);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to resolve AP exception", 500);
  }
});

// ============================================================================
// Response Mapping Helper
// ============================================================================

/**
 * Map internal APException (int enums) to API response (string labels).
 * FIX(47.4-WP-D): Service returns int enums; route converts to string labels
 * for API compatibility, following the same pattern as other AP modules.
 */
function mapExceptionToResponse(exception: APException): Record<string, unknown> {
  return {
    id: exception.id,
    company_id: exception.companyId,
    exception_key: exception.exceptionKey,
    type: toApExceptionTypeLabel(exception.type),
    source_type: exception.sourceType,
    source_id: exception.sourceId,
    supplier_id: exception.supplierId,
    variance_amount: exception.varianceAmount,
    currency_code: exception.currencyCode,
    detected_at: exception.detectedAt,
    due_date: exception.dueDate,
    assigned_to_user_id: exception.assignedToUserId,
    assigned_at: exception.assignedAt,
    status: toApExceptionStatusLabel(exception.status),
    resolved_at: exception.resolvedAt,
    resolved_by_user_id: exception.resolvedByUserId,
    resolution_note: exception.resolutionNote,
    created_at: exception.createdAt,
    updated_at: exception.updatedAt,
  };
}

export { apExceptionRoutes };
