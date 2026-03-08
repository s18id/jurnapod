// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { type PosOfflineDb, posDb } from "@jurnapod/offline-db/dexie";
import type {
  ActiveOrderLineRow,
  ActiveOrderRow,
  ActiveOrderUpdateRow,
  ProductCacheRow,
  SyncMetadataRow,
  SyncScopeConfigRow
} from "@jurnapod/offline-db/dexie";

const DEFAULT_SYNC_PULL_ENDPOINT = "/api/sync/pull";
const inFlightPullsByScope = new Map<string, Promise<SyncPullIngestResult>>();

const SyncPullItemSchema = z.object({
  id: z.coerce.number().int().positive(),
  sku: z.string().nullable(),
  name: z.string().min(1),
  type: z.enum(["SERVICE", "PRODUCT", "INGREDIENT", "RECIPE"]),
  item_group_id: z.number().int().positive().nullable(),
  is_active: z.boolean(),
  updated_at: z.string().datetime()
});

const SyncPullItemGroupSchema = z.object({
  id: z.coerce.number().int().positive(),
  code: z.string().nullable(),
  name: z.string().min(1),
  is_active: z.boolean(),
  updated_at: z.string().datetime()
});

const SyncPullPriceSchema = z.object({
  id: z.coerce.number().int().positive(),
  item_id: z.coerce.number().int().positive(),
  outlet_id: z.coerce.number().int().positive(),
  price: z.number().finite().nonnegative(),
  is_active: z.boolean(),
  updated_at: z.string().datetime()
});

const SyncPullConfigSchema = z.object({
  tax: z.object({
    rate: z.number().finite().min(0),
    inclusive: z.boolean()
  }),
  payment_methods: z.array(z.string().min(1))
});

const SyncPullOpenOrderSchema = z.object({
  order_id: z.string().uuid(),
  company_id: z.coerce.number().int().positive(),
  outlet_id: z.coerce.number().int().positive(),
  service_type: z.enum(["TAKEAWAY", "DINE_IN"]),
  table_id: z.number().int().positive().nullable(),
  reservation_id: z.number().int().positive().nullable(),
  guest_count: z.number().int().positive().nullable(),
  is_finalized: z.boolean(),
  order_status: z.enum(["OPEN", "READY_TO_PAY", "COMPLETED", "CANCELLED"]),
  order_state: z.enum(["OPEN", "CLOSED"]),
  paid_amount: z.number().finite().min(0),
  opened_at: z.string().datetime(),
  closed_at: z.string().datetime().nullable(),
  notes: z.string().nullable(),
  updated_at: z.string().datetime()
});

const SyncPullOpenOrderLineSchema = z.object({
  order_id: z.string().uuid(),
  company_id: z.coerce.number().int().positive(),
  outlet_id: z.coerce.number().int().positive(),
  item_id: z.coerce.number().int().positive(),
  sku_snapshot: z.string().nullable(),
  name_snapshot: z.string().min(1),
  item_type_snapshot: z.enum(["SERVICE", "PRODUCT", "INGREDIENT", "RECIPE"]),
  unit_price_snapshot: z.number().finite().nonnegative(),
  qty: z.number().positive(),
  discount_amount: z.number().finite().min(0),
  updated_at: z.string().datetime()
});

const SyncPullOrderUpdateSchema = z.object({
  update_id: z.string().uuid(),
  order_id: z.string().uuid(),
  company_id: z.coerce.number().int().positive(),
  outlet_id: z.coerce.number().int().positive(),
  base_order_updated_at: z.string().datetime().nullable(),
  event_type: z.enum([
    "SNAPSHOT_FINALIZED",
    "ITEM_ADDED",
    "ITEM_REMOVED",
    "QTY_CHANGED",
    "ITEM_CANCELLED",
    "NOTES_CHANGED",
    "ORDER_RESUMED",
    "ORDER_CLOSED"
  ]),
  delta_json: z.string(),
  actor_user_id: z.number().int().positive().nullable(),
  device_id: z.string().min(1),
  event_at: z.string().datetime(),
  created_at: z.string().datetime(),
  sequence_no: z.number().int().positive()
});

const SyncPullResponseSchema = z.object({
  data_version: z.coerce.number().int().min(0),
  items: z.array(SyncPullItemSchema),
  item_groups: z.array(SyncPullItemGroupSchema),
  prices: z.array(SyncPullPriceSchema),
  config: SyncPullConfigSchema,
  open_orders: z.array(SyncPullOpenOrderSchema).default([]),
  open_order_lines: z.array(SyncPullOpenOrderLineSchema).default([]),
  order_updates: z.array(SyncPullOrderUpdateSchema).default([]),
  orders_cursor: z.coerce.number().int().min(0).default(0)
});

type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;

const SyncPullSuccessEnvelopeSchema = z.object({
  success: z.literal(true),
  data: SyncPullResponseSchema
});

const SyncPullErrorEnvelopeSchema = z.union([
  z.object({
    success: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string()
    })
  }),
  z.object({
    success: z.literal(false),
    data: z.object({
      code: z.string(),
      message: z.string()
    })
  })
]);

export interface SyncPullIngestInput {
  company_id: number;
  outlet_id: number;
  since_version?: number;
  endpoint?: string;
  base_url?: string;
  fetch_impl?: typeof fetch;
  access_token?: string;
  now?: () => number;
}

function resolveFetchImpl(fetchImpl: typeof fetch | undefined): typeof fetch {
  const candidate = fetchImpl ?? globalThis.fetch;
  if (typeof candidate !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  return candidate.bind(globalThis);
}

export interface SyncPullIngestResult {
  company_id: number;
  outlet_id: number;
  requested_since_version: number;
  previous_data_version: number;
  data_version: number;
  upserted_product_count: number;
  pulled_at: string;
  applied: boolean;
}

export interface SyncPullScopeConfig {
  company_id: number;
  outlet_id: number;
  data_version: number;
  tax: {
    rate: number;
    inclusive: boolean;
  };
  payment_methods: string[];
  updated_at: string;
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

function assertDataVersion(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
}

function resolveScopeKey(db: PosOfflineDb, companyId: number, outletId: number): string {
  return `${db.name}:${companyId}:${outletId}`;
}

function resolveScopePk(companyId: number, outletId: number): string {
  return `${companyId}:${outletId}`;
}

function resolvePullUrl(
  endpoint: string,
  baseUrl: string | undefined,
  outletId: number,
  sinceVersion: number
): string {
  const trimmedBaseUrl = baseUrl?.trim();
  if (!trimmedBaseUrl) {
    if (typeof window !== "undefined") {
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set("outlet_id", String(outletId));
      url.searchParams.set("since_version", String(sinceVersion));
      return url.toString();
    }

    throw new Error(
      "sync pull base URL is missing. Provide base_url or run in a browser environment with window.location.origin."
    );
  }

  const url = new URL(endpoint, trimmedBaseUrl);
  url.searchParams.set("outlet_id", String(outletId));
  url.searchParams.set("since_version", String(sinceVersion));
  return url.toString();
}

function normalizeServerErrorMessage(status: number, payload: unknown): string {
  const parsedError = SyncPullErrorEnvelopeSchema.safeParse(payload);
  if (parsedError.success) {
    const errorPayload = "error" in parsedError.data ? parsedError.data.error : parsedError.data.data;
    return `${errorPayload.code}: ${errorPayload.message}`;
  }

  return `sync pull request failed with HTTP ${status}`;
}

function parsePullPayload(payload: unknown): SyncPullResponse {
  const successEnvelope = SyncPullSuccessEnvelopeSchema.safeParse(payload);
  if (successEnvelope.success) {
    return successEnvelope.data.data;
  }

  const directPayload = SyncPullResponseSchema.safeParse(payload);
  if (directPayload.success) {
    return directPayload.data;
  }

  throw new Error("sync pull response payload is invalid");
}

function mapSyncPullToProductRows(
  payload: SyncPullResponse,
  scope: { company_id: number; outlet_id: number },
  pulledAt: string
): ProductCacheRow[] {
  const itemsById = new Map(payload.items.map((item) => [item.id, item]));
  const groupsById = new Map(payload.item_groups.map((group) => [group.id, group]));
  const rows: ProductCacheRow[] = [];

  for (const price of payload.prices) {
    if (price.outlet_id !== scope.outlet_id) {
      continue;
    }

    const item = itemsById.get(price.item_id);
    if (!item) {
      continue;
    }

    const groupId = item.item_group_id ?? null;
    const group = groupId ? groupsById.get(groupId) : null;

    rows.push({
      pk: `${scope.company_id}:${scope.outlet_id}:${item.id}`,
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      item_id: item.id,
      sku: item.sku,
      name: item.name,
      item_type: item.type,
      item_group_id: groupId,
      item_group_name: group?.name ?? null,
      price_snapshot: price.price,
      is_active: item.is_active && price.is_active,
      item_updated_at: item.updated_at,
      price_updated_at: price.updated_at,
      data_version: payload.data_version,
      pulled_at: pulledAt
    });
  }

  return rows;
}

function mapSyncPullToConfigRow(
  payload: SyncPullResponse,
  scope: { company_id: number; outlet_id: number },
  pulledAt: string
): SyncScopeConfigRow {
  return {
    pk: resolveScopePk(scope.company_id, scope.outlet_id),
    company_id: scope.company_id,
    outlet_id: scope.outlet_id,
    data_version: payload.data_version,
    tax_rate: payload.config.tax.rate,
    tax_inclusive: payload.config.tax.inclusive,
    payment_methods: [...payload.config.payment_methods],
    updated_at: pulledAt
  };
}

function mapSyncPullToOpenOrderRows(payload: SyncPullResponse): ActiveOrderRow[] {
  return payload.open_orders.map((order) => ({
    pk: order.order_id,
    order_id: order.order_id,
    company_id: order.company_id,
    outlet_id: order.outlet_id,
    service_type: order.service_type,
    table_id: order.table_id,
    reservation_id: order.reservation_id,
    guest_count: order.guest_count,
    is_finalized: order.is_finalized,
    order_status: order.order_status,
    order_state: order.order_state,
    paid_amount: order.paid_amount,
    opened_at: order.opened_at,
    closed_at: order.closed_at,
    notes: order.notes,
    updated_at: order.updated_at
  }));
}

function mapSyncPullToOpenOrderLineRows(payload: SyncPullResponse): ActiveOrderLineRow[] {
  return payload.open_order_lines.map((line) => ({
    pk: `${line.order_id}:${line.item_id}`,
    order_id: line.order_id,
    company_id: line.company_id,
    outlet_id: line.outlet_id,
    item_id: line.item_id,
    sku_snapshot: line.sku_snapshot,
    name_snapshot: line.name_snapshot,
    item_type_snapshot: line.item_type_snapshot,
    unit_price_snapshot: line.unit_price_snapshot,
    qty: line.qty,
    discount_amount: line.discount_amount,
    updated_at: line.updated_at
  }));
}

function mapSyncPullToOrderUpdateRows(payload: SyncPullResponse): ActiveOrderUpdateRow[] {
  return payload.order_updates.map((update) => ({
    pk: `active_order_update:${update.update_id}`,
    update_id: update.update_id,
    order_id: update.order_id,
    company_id: update.company_id,
    outlet_id: update.outlet_id,
    base_order_updated_at: update.base_order_updated_at,
    event_type: update.event_type,
    delta_json: update.delta_json,
    actor_user_id: update.actor_user_id,
    device_id: update.device_id,
    event_at: update.event_at,
    created_at: update.created_at,
    sync_status: "SENT",
    sync_error: null
  }));
}

export async function readSyncPullDataVersion(
  scope: { company_id: number; outlet_id: number },
  db: PosOfflineDb = posDb
): Promise<number> {
  const metadata = await db.sync_metadata.get(resolveScopePk(scope.company_id, scope.outlet_id));
  return metadata?.last_data_version ?? 0;
}

export async function readSyncPullConfig(
  scope: { company_id: number; outlet_id: number },
  db: PosOfflineDb = posDb
): Promise<SyncPullScopeConfig | null> {
  const row = await db.sync_scope_config.get(resolveScopePk(scope.company_id, scope.outlet_id));
  if (!row) {
    return null;
  }

  return {
    company_id: row.company_id,
    outlet_id: row.outlet_id,
    data_version: row.data_version,
    tax: {
      rate: row.tax_rate,
      inclusive: row.tax_inclusive
    },
    payment_methods: [...row.payment_methods],
    updated_at: row.updated_at
  };
}

async function fetchSyncPullPayload(input: {
  endpoint: string;
  base_url?: string;
  outlet_id: number;
  since_version: number;
  fetch_impl: typeof fetch;
  access_token?: string;
}): Promise<SyncPullResponse> {
  const requestUrl = resolvePullUrl(input.endpoint, input.base_url, input.outlet_id, input.since_version);
  const headers: Record<string, string> = {
    accept: "application/json"
  };
  if (input.access_token) {
    headers.authorization = `Bearer ${input.access_token}`;
  }

  const response = await input.fetch_impl(requestUrl, {
    method: "GET",
    headers
  });

  const contentType = response.headers.get("content-type") ?? "";
  const expectsJson = contentType.toLowerCase().includes("application/json");

  if (!expectsJson) {
    const rawBody = await response.text();
    const bodySnippet = rawBody.replace(/\s+/g, " ").trim().slice(0, 120);
    throw new Error(
      `sync pull endpoint did not return JSON (status ${response.status}). Check API base URL configuration.${
        bodySnippet ? ` Response snippet: ${bodySnippet}` : ""
      }`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("sync pull response is not valid JSON");
  }

  if (!response.ok) {
    throw new Error(normalizeServerErrorMessage(response.status, payload));
  }

  return parsePullPayload(payload);
}

async function applySyncPullRows(
  input: {
    company_id: number;
    outlet_id: number;
    rows: ProductCacheRow[];
    config: SyncScopeConfigRow;
    data_version: number;
    pulled_at: string;
    open_orders: ActiveOrderRow[];
    open_order_lines: ActiveOrderLineRow[];
    order_updates: ActiveOrderUpdateRow[];
    orders_cursor: number;
  },
  db: PosOfflineDb
): Promise<{ applied: boolean; previous_data_version: number; data_version: number }> {
  return db.transaction(
    "rw",
    [
      db.products_cache,
      db.sync_metadata,
      db.sync_scope_config,
      db.active_orders,
      db.active_order_lines,
      db.active_order_updates
    ],
    async () => {
    const metadataPk = resolveScopePk(input.company_id, input.outlet_id);
    const existingMetadata = await db.sync_metadata.get(metadataPk);
    const previousDataVersion = existingMetadata?.last_data_version ?? 0;

    if (input.data_version <= previousDataVersion) {
      return {
        applied: false,
        previous_data_version: previousDataVersion,
        data_version: previousDataVersion
      };
    }

    const incomingItemIds = new Set(input.rows.map((row) => row.item_id));
    const currentActiveRows = await db.products_cache
      .toCollection()
      .filter((row) => row.company_id === input.company_id && row.outlet_id === input.outlet_id && row.is_active)
      .toArray();

    const staleRows = currentActiveRows
      .filter((row) => !incomingItemIds.has(row.item_id))
      .map((row) => ({
        ...row,
        is_active: false,
        data_version: input.data_version,
        pulled_at: input.pulled_at
      }));

    if (input.rows.length > 0) {
      await db.products_cache.bulkPut(input.rows);
    }

    if (staleRows.length > 0) {
      await db.products_cache.bulkPut(staleRows);
    }

    const metadataRow: SyncMetadataRow = {
      pk: metadataPk,
      company_id: input.company_id,
      outlet_id: input.outlet_id,
      last_data_version: input.data_version,
      last_pulled_at: input.pulled_at,
      updated_at: input.pulled_at
    };
    await db.sync_metadata.put({
      ...metadataRow,
      orders_cursor: input.orders_cursor
    });
    await db.sync_scope_config.put(input.config);

    if (input.open_orders.length > 0) {
      await db.active_orders.bulkPut(input.open_orders);
    }

    if (input.open_order_lines.length > 0) {
      await db.active_order_lines.bulkPut(input.open_order_lines);
    }

    if (input.order_updates.length > 0) {
      await db.active_order_updates.bulkPut(input.order_updates);
    }

    return {
      applied: true,
      previous_data_version: previousDataVersion,
      data_version: input.data_version
    };
    }
  );
}

export async function ingestSyncPullIntoProductsCache(
  input: SyncPullIngestInput,
  db: PosOfflineDb = posDb
): Promise<SyncPullIngestResult> {
  assertPositiveInteger(input.company_id, "company_id");
  assertPositiveInteger(input.outlet_id, "outlet_id");

  const providedSinceVersion = input.since_version;
  if (providedSinceVersion !== undefined) {
    assertDataVersion(providedSinceVersion, "since_version");
  }

  const scopeKey = resolveScopeKey(db, input.company_id, input.outlet_id);
  const existingInFlight = inFlightPullsByScope.get(scopeKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const fetchImpl = resolveFetchImpl(input.fetch_impl);

  const runPromise = (async (): Promise<SyncPullIngestResult> => {
    const requestedSinceVersion =
      providedSinceVersion ??
      (await readSyncPullDataVersion(
        {
          company_id: input.company_id,
          outlet_id: input.outlet_id
        },
        db
      ));

    const payload = await fetchSyncPullPayload({
      endpoint: input.endpoint ?? DEFAULT_SYNC_PULL_ENDPOINT,
      base_url: input.base_url,
      outlet_id: input.outlet_id,
      since_version: requestedSinceVersion,
      fetch_impl: fetchImpl,
      access_token: input.access_token
    });

    const nowMs = input.now ? input.now() : Date.now();
    const pulledAt = new Date(nowMs).toISOString();
    const rows = mapSyncPullToProductRows(
      payload,
      {
        company_id: input.company_id,
        outlet_id: input.outlet_id
      },
      pulledAt
    );
    const config = mapSyncPullToConfigRow(
      payload,
      {
        company_id: input.company_id,
        outlet_id: input.outlet_id
      },
      pulledAt
    );
    const openOrders = mapSyncPullToOpenOrderRows(payload);
    const openOrderLines = mapSyncPullToOpenOrderLineRows(payload);
    const orderUpdates = mapSyncPullToOrderUpdateRows(payload);

    const applyResult = await applySyncPullRows(
      {
        company_id: input.company_id,
        outlet_id: input.outlet_id,
        rows,
        config,
        data_version: payload.data_version,
        pulled_at: pulledAt,
        open_orders: openOrders,
        open_order_lines: openOrderLines,
        order_updates: orderUpdates,
        orders_cursor: payload.orders_cursor
      },
      db
    );

    return {
      company_id: input.company_id,
      outlet_id: input.outlet_id,
      requested_since_version: requestedSinceVersion,
      previous_data_version: applyResult.previous_data_version,
      data_version: applyResult.data_version,
      upserted_product_count: rows.length,
      pulled_at: pulledAt,
      applied: applyResult.applied
    };
  })();

  inFlightPullsByScope.set(scopeKey, runPromise);

  try {
    return await runPromise;
  } finally {
    if (inFlightPullsByScope.get(scopeKey) === runPromise) {
      inFlightPullsByScope.delete(scopeKey);
    }
  }
}
