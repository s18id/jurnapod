// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchasing Exchange Rate Routes
 *
 * Routes for exchange rate management under purchasing module:
 * - GET /purchasing/exchange-rates - List exchange rates with pagination
 * - GET /purchasing/exchange-rates/lookup - Lookup rate for currency on specific date
 * - GET /purchasing/exchange-rates/:id - Get exchange rate by ID
 * - POST /purchasing/exchange-rates - Create new exchange rate
 * - PATCH /purchasing/exchange-rates/:id - Update exchange rate
 *
 * Required ACL: purchasing.exchange_rates resource with READ/CREATE/UPDATE permissions
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  ExchangeRateCreateSchema,
  ExchangeRateUpdateSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { requireAccess, authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import {
  createExchangeRate,
  getExchangeRate,
  getExchangeRateById,
  listExchangeRates,
  updateExchangeRate,
} from "../../lib/purchasing/exchange-rate.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Exchange Rate Routes
// =============================================================================

const exchangeRateRoutes = new Hono();

// Auth middleware
exchangeRateRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /purchasing/exchange-rates - List exchange rates with pagination and filtering
exchangeRateRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission
    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "exchange_rates",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const queryParams = {
      company_id: auth.companyId,
      currency_code: url.searchParams.get("currency_code") ?? undefined,
      is_active: url.searchParams.get("is_active") !== null
        ? url.searchParams.get("is_active") === "true"
        : undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0
    };

    const result = await listExchangeRates({
      companyId: auth.companyId,
      currencyCode: queryParams.currency_code,
      isActive: queryParams.is_active,
      limit: queryParams.limit,
      offset: queryParams.offset,
    });

    return successResponse(result);
  } catch (error) {
    console.error("GET /purchasing/exchange-rates failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch exchange rates", 500);
  }
});

// GET /purchasing/exchange-rates/lookup - Lookup rate for currency on specific date
exchangeRateRoutes.get("/lookup", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission
    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "exchange_rates",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const currencyCode = url.searchParams.get("currency_code");
    const dateStr = url.searchParams.get("date");

    if (!currencyCode || !dateStr) {
      return errorResponse("INVALID_REQUEST", "currency_code and date query params are required", 400);
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return errorResponse("INVALID_REQUEST", "date must be in YYYY-MM-DD format", 400);
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return errorResponse("INVALID_REQUEST", "Invalid date", 400);
    }

    const rate = await getExchangeRate(auth.companyId, currencyCode.toUpperCase(), date);

    if (!rate) {
      return errorResponse("NOT_FOUND", `No exchange rate found for ${currencyCode.toUpperCase()} on or before ${dateStr}`, 404);
    }

    return successResponse({
      currency_code: rate.currency_code,
      rate: String(rate.rate),
      effective_date: new Date(rate.effective_date).toISOString(),
      source: "exchange_rates"
    });
  } catch (error) {
    console.error("GET /purchasing/exchange-rates/lookup failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to lookup exchange rate", 500);
  }
});

// GET /purchasing/exchange-rates/:id - Get exchange rate by ID
exchangeRateRoutes.get("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission
    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "exchange_rates",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const rateId = NumericIdSchema.parse(c.req.param("id"));

    const rate = await getExchangeRateById(auth.companyId, rateId);

    if (!rate) {
      return errorResponse("NOT_FOUND", "Exchange rate not found", 404);
    }

    return successResponse(rate);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid exchange rate ID", 400);
    }
    console.error("GET /purchasing/exchange-rates/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch exchange rate", 500);
  }
});

// POST /purchasing/exchange-rates - Create new exchange rate
exchangeRateRoutes.post("/", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    module: "purchasing",
    resource: "exchange_rates",
    permission: "create"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  let input: z.infer<typeof ExchangeRateCreateSchema> | undefined;

  try {
    const payload = await c.req.json();
    input = ExchangeRateCreateSchema.parse(payload);

    // Ensure company_id matches authenticated user's company
    if (input.company_id !== auth.companyId) {
      return errorResponse("FORBIDDEN", "Cannot create exchange rate for another company", 403);
    }

    const created = await createExchangeRate({
      companyId: input.company_id,
      currencyCode: input.currency_code,
      rate: input.rate,
      effectiveDate: input.effective_date,
      notes: input.notes ?? undefined,
      userId: auth.userId,
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    // Handle MySQL duplicate key error (same currency + effective_date)
    if (typeof error === "object" && error !== null && "errno" in error) {
      const mysqlError = error as { errno: number };
      if (mysqlError.errno === 1062) {
        return errorResponse(
          "CONFLICT",
          `Exchange rate for ${input?.currency_code ?? "(unknown)"} on ${input?.effective_date?.toString() ?? "(unknown date)"} already exists`,
          409
        );
      }
    }
    console.error("POST /purchasing/exchange-rates failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create exchange rate", 500);
  }
});

// PATCH /purchasing/exchange-rates/:id - Update exchange rate
exchangeRateRoutes.patch("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission
    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "exchange_rates",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const rateId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = ExchangeRateUpdateSchema.parse(payload);

    const updated = await updateExchangeRate({
      companyId: auth.companyId,
      rateId,
      rate: input.rate,
      effectiveDate: input.effective_date ?? undefined,
      notes: input.notes ?? undefined,
      isActive: input.is_active,
      userId: auth.userId,
    });

    if (!updated) {
      return errorResponse("NOT_FOUND", "Exchange rate not found", 404);
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    console.error("PATCH /purchasing/exchange-rates/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update exchange rate", 500);
  }
});

export { exchangeRateRoutes };
