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
  ExchangeRateResponseSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { requireAccess, authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import { getDb } from "../../lib/db.js";
import type { KyselySchema } from "@jurnapod/db";
import { getExchangeRate } from "../../lib/purchasing/exchange-rate.js";

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

    const db = getDb() as KyselySchema;

    // Build count conditions
    const conditions = ["company_id =", auth.companyId];
    const queryArgs: unknown[] = [auth.companyId];

    if (queryParams.currency_code) {
      conditions.push("currency_code =");
      queryArgs.push(queryParams.currency_code);
    }

    if (queryParams.is_active !== undefined) {
      conditions.push("is_active =");
      queryArgs.push(queryParams.is_active ? 1 : 0);
    }

    const whereClause = conditions.join(" AND ");

    // Count query
    const countResult = await db
      .selectFrom("exchange_rates")
      .where("company_id", "=", auth.companyId)
      .where((eb) => {
        const preds = [eb("company_id", "=", auth.companyId)];
        if (queryParams.currency_code) {
          preds.push(eb("currency_code", "=", queryParams.currency_code));
        }
        if (queryParams.is_active !== undefined) {
          preds.push(eb("is_active", "=", queryParams.is_active ? 1 : 0));
        }
        return eb.and(preds);
      })
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirst();

    const total = Number((countResult as { count?: string })?.count ?? 0);

    // List query
    let listQuery = db
      .selectFrom("exchange_rates")
      .where("company_id", "=", auth.companyId);

    if (queryParams.currency_code) {
      listQuery = listQuery.where("currency_code", "=", queryParams.currency_code);
    }

    if (queryParams.is_active !== undefined) {
      listQuery = listQuery.where("is_active", "=", queryParams.is_active ? 1 : 0);
    }

    const rates = await listQuery
      .select([
        "id",
        "company_id",
        "currency_code",
        "rate",
        "effective_date",
        "notes",
        "is_active",
        "created_by_user_id",
        "updated_by_user_id",
        "created_at",
        "updated_at"
      ])
      .orderBy("effective_date", "desc")
      .orderBy("created_at", "desc")
      .limit(queryParams.limit)
      .offset(queryParams.offset)
      .execute();

    const formatted = rates.map((r) => ({
      id: r.id,
      company_id: r.company_id,
      currency_code: r.currency_code,
      rate: String(r.rate),
      effective_date: new Date(r.effective_date).toISOString(),
      notes: r.notes,
      is_active: Boolean(r.is_active),
      created_by_user_id: r.created_by_user_id,
      updated_by_user_id: r.updated_by_user_id,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString()
    }));

    return successResponse({
      exchange_rates: formatted,
      total,
      limit: queryParams.limit,
      offset: queryParams.offset
    });
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

    const db = getDb() as KyselySchema;

    const rate = await db
      .selectFrom("exchange_rates")
      .where("id", "=", rateId)
      .where("company_id", "=", auth.companyId)
      .select([
        "id",
        "company_id",
        "currency_code",
        "rate",
        "effective_date",
        "notes",
        "is_active",
        "created_by_user_id",
        "updated_by_user_id",
        "created_at",
        "updated_at"
      ])
      .executeTakeFirst();

    if (!rate) {
      return errorResponse("NOT_FOUND", "Exchange rate not found", 404);
    }

    const formatted = {
      id: rate.id,
      company_id: rate.company_id,
      currency_code: rate.currency_code,
      rate: String(rate.rate),
      effective_date: new Date(rate.effective_date).toISOString(),
      notes: rate.notes,
      is_active: Boolean(rate.is_active),
      created_by_user_id: rate.created_by_user_id,
      updated_by_user_id: rate.updated_by_user_id,
      created_at: new Date(rate.created_at).toISOString(),
      updated_at: new Date(rate.updated_at).toISOString()
    };

    return successResponse(formatted);
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

    const db = getDb() as KyselySchema;

    // Insert exchange rate
    const insertResult = await db
      .insertInto("exchange_rates")
      .values({
        company_id: input.company_id,
        currency_code: input.currency_code,
        rate: input.rate,
        effective_date: input.effective_date,
        notes: input.notes ?? null,
        is_active: 1,
        created_by_user_id: auth.userId
      })
      .executeTakeFirst();

    const insertedId = Number(insertResult.insertId);
    if (!insertedId) {
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create exchange rate", 500);
    }

    // Fetch the inserted row since returningAll() doesn't work reliably with mysql2
    const result = await db
      .selectFrom("exchange_rates")
      .where("id", "=", insertedId)
      .select([
        "id", "company_id", "currency_code", "rate", "effective_date",
        "notes", "is_active", "created_by_user_id", "updated_by_user_id",
        "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!result) {
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create exchange rate", 500);
    }

    const formatted = {
      id: result.id,
      company_id: result.company_id,
      currency_code: result.currency_code,
      rate: String(result.rate),
      effective_date: new Date(result.effective_date).toISOString(),
      notes: result.notes,
      is_active: Boolean(result.is_active),
      created_by_user_id: result.created_by_user_id,
      updated_by_user_id: result.updated_by_user_id,
      created_at: result.created_at ? new Date(result.created_at as unknown as string).toISOString() : null,
      updated_at: result.updated_at ? new Date(result.updated_at as unknown as string).toISOString() : null
    };

    return successResponse(formatted, 201);
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

    const db = getDb() as KyselySchema;

    // Check exchange rate exists and belongs to company
    const existing = await db
      .selectFrom("exchange_rates")
      .where("id", "=", rateId)
      .where("company_id", "=", auth.companyId)
      .select(["id"])
      .executeTakeFirst();

    if (!existing) {
      return errorResponse("NOT_FOUND", "Exchange rate not found", 404);
    }

    // Build update values
    const updateValues: Record<string, unknown> = {
      updated_by_user_id: auth.userId
    };

    if (input.rate !== undefined) updateValues.rate = input.rate;
    if (input.effective_date !== undefined) updateValues.effective_date = input.effective_date;
    if (input.notes !== undefined) updateValues.notes = input.notes;
    if (input.is_active !== undefined) updateValues.is_active = input.is_active ? 1 : 0;

    // Update exchange rate
    const updateResult = await db
      .updateTable("exchange_rates")
      .set(updateValues)
      .where("id", "=", rateId)
      .where("company_id", "=", auth.companyId)
      .executeTakeFirst();

    if (!updateResult.numUpdatedRows) {
      return errorResponse("NOT_FOUND", "Exchange rate not found", 404);
    }

    // Fetch the updated row
    const result = await db
      .selectFrom("exchange_rates")
      .where("id", "=", rateId)
      .select([
        "id", "company_id", "currency_code", "rate", "effective_date",
        "notes", "is_active", "created_by_user_id", "updated_by_user_id",
        "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!result) {
      return errorResponse("NOT_FOUND", "Exchange rate not found", 404);
    }

    const formatted = {
      id: result.id,
      company_id: result.company_id,
      currency_code: result.currency_code,
      rate: String(result.rate),
      effective_date: new Date(result.effective_date).toISOString(),
      notes: result.notes,
      is_active: Boolean(result.is_active),
      created_by_user_id: result.created_by_user_id,
      updated_by_user_id: result.updated_by_user_id,
      created_at: result.created_at ? new Date(result.created_at as unknown as string).toISOString() : null,
      updated_at: result.updated_at ? new Date(result.updated_at as unknown as string).toISOString() : null
    };

    return successResponse(formatted);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    console.error("PATCH /purchasing/exchange-rates/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update exchange rate", 500);
  }
});

export { exchangeRateRoutes };