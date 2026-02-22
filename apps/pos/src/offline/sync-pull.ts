import { z } from "zod";
import { type PosOfflineDb, posDb } from "./db.js";
import type { ProductCacheRow, SyncMetadataRow, SyncScopeConfigRow } from "./types.js";

const DEFAULT_SYNC_PULL_ENDPOINT = "/api/sync/pull";
const inFlightPullsByScope = new Map<string, Promise<SyncPullIngestResult>>();

const SyncPullItemSchema = z.object({
  id: z.coerce.number().int().positive(),
  sku: z.string().nullable(),
  name: z.string().min(1),
  type: z.enum(["SERVICE", "PRODUCT", "INGREDIENT", "RECIPE"]),
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

const SyncPullResponseSchema = z.object({
  data_version: z.coerce.number().int().min(0),
  items: z.array(SyncPullItemSchema),
  prices: z.array(SyncPullPriceSchema),
  config: SyncPullConfigSchema
});

type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;

const SyncPullSuccessEnvelopeSchema = z
  .object({
    ok: z.literal(true)
  })
  .and(SyncPullResponseSchema);

const SyncPullErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string()
  })
});

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
  const fallbackBaseUrl = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const url = new URL(endpoint, baseUrl ?? fallbackBaseUrl);
  url.searchParams.set("outlet_id", String(outletId));
  url.searchParams.set("since_version", String(sinceVersion));
  return url.toString();
}

function normalizeServerErrorMessage(status: number, payload: unknown): string {
  const parsedError = SyncPullErrorEnvelopeSchema.safeParse(payload);
  if (parsedError.success) {
    return `${parsedError.data.error.code}: ${parsedError.data.error.message}`;
  }

  return `sync pull request failed with HTTP ${status}`;
}

function parsePullPayload(payload: unknown): SyncPullResponse {
  const successEnvelope = SyncPullSuccessEnvelopeSchema.safeParse(payload);
  if (successEnvelope.success) {
    return {
      data_version: successEnvelope.data.data_version,
      items: successEnvelope.data.items,
      prices: successEnvelope.data.prices,
      config: successEnvelope.data.config
    };
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
  const rows: ProductCacheRow[] = [];

  for (const price of payload.prices) {
    if (price.outlet_id !== scope.outlet_id) {
      continue;
    }

    const item = itemsById.get(price.item_id);
    if (!item) {
      continue;
    }

    rows.push({
      pk: `${scope.company_id}:${scope.outlet_id}:${item.id}`,
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      item_id: item.id,
      sku: item.sku,
      name: item.name,
      item_type: item.type,
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
  },
  db: PosOfflineDb
): Promise<{ applied: boolean; previous_data_version: number; data_version: number }> {
  return db.transaction("rw", [db.products_cache, db.sync_metadata, db.sync_scope_config], async () => {
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
    await db.sync_metadata.put(metadataRow);
    await db.sync_scope_config.put(input.config);

    return {
      applied: true,
      previous_data_version: previousDataVersion,
      data_version: input.data_version
    };
  });
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

    const applyResult = await applySyncPullRows(
      {
        company_id: input.company_id,
        outlet_id: input.outlet_id,
        rows,
        config,
        data_version: payload.data_version,
        pulled_at: pulledAt
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
