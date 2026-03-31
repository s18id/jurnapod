// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Variant Price Resolver
 * 
 * Implements price resolution logic with the following priority:
 * 1. Variant-specific price for outlet (if variantId provided)
 * 2. Item-default price for outlet
 * 3. Global-default price
 * 
 * Features:
 * - 60-second cache (configurable)
 * - Company isolation
 * - Effective date support
 */

import { sql } from "kysely";
import { getDb, type KyselySchema } from "../db.js";

export interface ResolvedPrice {
  price: number;
  price_id: number | null;
  is_override: boolean;
  is_variant_specific: boolean;
  source: "variant_outlet" | "item_outlet" | "variant_default" | "item_default" | "global_default";
}

// Type alias to avoid nested >> parsing issues
type ResolvedPriceData = Omit<ResolvedPrice, "source">;

interface CacheEntry {
  price: ResolvedPrice;
  expires_at: number;
}

interface CacheOptions {
  ttlMs?: number;
}

// In-memory cache with TTL
const priceCache = new Map<string, CacheEntry>();

// Default TTL: 60 seconds
const DEFAULT_TTL_MS = 60_000;

// Flag to enable effective date filtering (requires effective_from/effective_to columns)
// Migration 0128 adds these columns to item_prices
// Filter is disabled by default - call enableEffectiveDateFilter() after migration runs
let effectiveDateFilterEnabled = false;

/**
 * Enable effective date filtering.
 * Call this after migration 0128 has been applied to add effective_from/effective_to columns.
 */
export function enableEffectiveDateFilter(): void {
  effectiveDateFilterEnabled = true;
}

/**
 * Disable effective date filtering (for testing or migration rollback).
 */
export function disableEffectiveDateFilter(): void {
  effectiveDateFilterEnabled = false;
}

/**
 * Check if effective date filtering is enabled
 */
export function isEffectiveDateFilterEnabled(): boolean {
  return effectiveDateFilterEnabled;
}

/**
 * Generate cache key for price resolution
 */
function getCacheKey(
  companyId: number,
  itemId: number,
  variantId: number | null,
  outletId: number | null,
  date?: Date
): string {
  const dateKey = date ? date.toISOString().split("T")[0] : "any";
  return `${companyId}:${itemId}:${variantId ?? "null"}:${outletId ?? "null"}:${dateKey}`;
}

/**
 * Clear expired cache entries (lazy cleanup)
 */
function cleanupExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of priceCache.entries()) {
    if (entry.expires_at <= now) {
      priceCache.delete(key);
    }
  }
}

/**
 * Get cached price if available and not expired
 */
function getCachedPrice(key: string): ResolvedPrice | null {
  cleanupExpiredCache();
  const entry = priceCache.get(key);
  if (entry && entry.expires_at > Date.now()) {
    return entry.price;
  }
  return null;
}

/**
 * Cache a resolved price
 */
function cachePrice(key: string, price: ResolvedPrice, ttlMs: number = DEFAULT_TTL_MS): void {
  priceCache.set(key, {
    price,
    expires_at: Date.now() + ttlMs
  });
}

/**
 * Clear all cached prices (useful for testing or cache invalidation)
 */
export function clearPriceCache(): void {
  priceCache.clear();
}

/**
 * Get the number of cached entries (useful for testing)
 */
export function getCacheSize(): number {
  cleanupExpiredCache();
  return priceCache.size;
}

interface PriceRow {
  id: number;
  price: string;
  is_active: number;
}

async function findVariantOutletPrice(
  db: KyselySchema,
  companyId: number,
  itemId: number,
  variantId: number,
  outletId: number,
  date: Date
): Promise<ResolvedPriceData | null> {
  let query = sql<PriceRow>`
    SELECT id, price, is_active
    FROM item_prices
    WHERE company_id = ${companyId}
      AND item_id = ${itemId}
      AND variant_id = ${variantId}
      AND outlet_id = ${outletId}
      AND is_active = 1
  `;

  if (effectiveDateFilterEnabled) {
    const now = date.getTime();
    query = sql<PriceRow>`
      SELECT id, price, is_active
      FROM item_prices
      WHERE company_id = ${companyId}
        AND item_id = ${itemId}
        AND variant_id = ${variantId}
        AND outlet_id = ${outletId}
        AND is_active = 1
        AND effective_from <= ${now}
        AND (effective_to = 0 OR effective_to >= ${now})
    `;
  }

  const rows = await query.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }

  const row = rows.rows[0];
  return {
    price: Number(row.price),
    price_id: Number(row.id),
    is_override: true,
    is_variant_specific: true
  };
}

async function findItemOutletPrice(
  db: KyselySchema,
  companyId: number,
  itemId: number,
  outletId: number,
  date: Date
): Promise<ResolvedPriceData | null> {
  let query = sql<PriceRow>`
    SELECT id, price, is_active
    FROM item_prices
    WHERE company_id = ${companyId}
      AND item_id = ${itemId}
      AND variant_id IS NULL
      AND outlet_id = ${outletId}
      AND is_active = 1
  `;

  if (effectiveDateFilterEnabled) {
    const now = date.getTime();
    query = sql<PriceRow>`
      SELECT id, price, is_active
      FROM item_prices
      WHERE company_id = ${companyId}
        AND item_id = ${itemId}
        AND variant_id IS NULL
        AND outlet_id = ${outletId}
        AND is_active = 1
        AND effective_from <= ${now}
        AND (effective_to = 0 OR effective_to >= ${now})
    `;
  }

  const rows = await query.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }

  const row = rows.rows[0];
  return {
    price: Number(row.price),
    price_id: Number(row.id),
    is_override: true,
    is_variant_specific: false
  };
}

async function findVariantDefaultPrice(
  db: KyselySchema,
  companyId: number,
  itemId: number,
  variantId: number,
  date: Date
): Promise<ResolvedPriceData | null> {
  let query = sql<PriceRow>`
    SELECT id, price, is_active
    FROM item_prices
    WHERE company_id = ${companyId}
      AND item_id = ${itemId}
      AND variant_id = ${variantId}
      AND outlet_id IS NULL
      AND is_active = 1
  `;

  if (effectiveDateFilterEnabled) {
    const now = date.getTime();
    query = sql<PriceRow>`
      SELECT id, price, is_active
      FROM item_prices
      WHERE company_id = ${companyId}
        AND item_id = ${itemId}
        AND variant_id = ${variantId}
        AND outlet_id IS NULL
        AND is_active = 1
        AND effective_from <= ${now}
        AND (effective_to = 0 OR effective_to >= ${now})
    `;
  }

  const rows = await query.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }

  const row = rows.rows[0];
  return {
    price: Number(row.price),
    price_id: Number(row.id),
    is_override: false,
    is_variant_specific: true
  };
}

async function findItemDefaultPrice(
  db: KyselySchema,
  companyId: number,
  itemId: number,
  date: Date
): Promise<ResolvedPriceData | null> {
  let query = sql<PriceRow>`
    SELECT id, price, is_active
    FROM item_prices
    WHERE company_id = ${companyId}
      AND item_id = ${itemId}
      AND variant_id IS NULL
      AND outlet_id IS NULL
      AND is_active = 1
  `;

  if (effectiveDateFilterEnabled) {
    const now = date.getTime();
    query = sql<PriceRow>`
      SELECT id, price, is_active
      FROM item_prices
      WHERE company_id = ${companyId}
        AND item_id = ${itemId}
        AND variant_id IS NULL
        AND outlet_id IS NULL
        AND is_active = 1
        AND effective_from <= ${now}
        AND (effective_to = 0 OR effective_to >= ${now})
    `;
  }

  const rows = await query.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }

  const row = rows.rows[0];
  return {
    price: Number(row.price),
    price_id: Number(row.id),
    is_override: false,
    is_variant_specific: false
  };
}

interface BatchPriceRow {
  lookup_key: string;
  id: number;
  price: string;
  is_active: number;
}

async function findPricesBatch(
  db: KyselySchema,
  companyId: number,
  requests: Array<{
    itemId: number;
    variantId?: number | null;
    outletId?: number | null;
  }>,
  date: Date
): Promise<Map<string, ResolvedPriceData>> {
  const results = new Map<string, ResolvedPriceData>();
  
  if (requests.length === 0) {
    return results;
  }

  // Build the query with all lookup keys using UNION ALL
  // Date filter for queries
  const dateCondition = effectiveDateFilterEnabled
    ? ` AND effective_from <= ${date.getTime()} AND (effective_to = 0 OR effective_to >= ${date.getTime()})`
    : '';

  const parts: string[] = [];

  for (const req of requests) {
    const variantId = req.variantId ?? null;
    const outletId = req.outletId ?? null;

    if (variantId !== null && outletId !== null) {
      parts.push(
        `SELECT 'vo:${companyId}:${req.itemId}:${variantId}:${outletId}' AS lookup_key, id, price, is_active ` +
        `FROM item_prices WHERE company_id = ${companyId} AND item_id = ${req.itemId} AND variant_id = ${variantId} AND outlet_id = ${outletId} AND is_active = 1${dateCondition} LIMIT 1`
      );
    }

    if (outletId !== null) {
      parts.push(
        `SELECT 'io:${companyId}:${req.itemId}:${outletId}' AS lookup_key, id, price, is_active ` +
        `FROM item_prices WHERE company_id = ${companyId} AND item_id = ${req.itemId} AND variant_id IS NULL AND outlet_id = ${outletId} AND is_active = 1${dateCondition} LIMIT 1`
      );
    }

    if (variantId !== null) {
      parts.push(
        `SELECT 'vd:${companyId}:${req.itemId}:${variantId}' AS lookup_key, id, price, is_active ` +
        `FROM item_prices WHERE company_id = ${companyId} AND item_id = ${req.itemId} AND variant_id = ${variantId} AND outlet_id IS NULL AND is_active = 1${dateCondition} LIMIT 1`
      );
    }

    parts.push(
      `SELECT 'id:${companyId}:${req.itemId}' AS lookup_key, id, price, is_active ` +
      `FROM item_prices WHERE company_id = ${companyId} AND item_id = ${req.itemId} AND variant_id IS NULL AND outlet_id IS NULL AND is_active = 1${dateCondition} LIMIT 1`
    );
  }

  if (parts.length === 0) {
    return results;
  }

  const sqlQuery = parts.join('\nUNION ALL\n');
  const rows = await sql<BatchPriceRow>`${sqlQuery}`.execute(db);

  for (const row of rows.rows) {
    results.set(row.lookup_key, {
      price: Number(row.price),
      price_id: Number(row.id),
      is_override: row.lookup_key.startsWith("vo:") || row.lookup_key.startsWith("io:"),
      is_variant_specific: row.lookup_key.startsWith("vo:") || row.lookup_key.startsWith("vd:")
    });
  }

  return results;
}

/**
 * Resolve the effective price for an item/variant combination.
 * 
 * Resolution order:
 * 1. Variant-specific price for outlet (if variantId provided)
 * 2. Item-default price for outlet (outlet override)
 * 3. Variant-specific global price (if variantId provided)
 * 4. Item-default global price
 * 5. Global default price (0 if no price found)
 * 
 * @param companyId - Company ID for tenant isolation
 * @param itemId - Item ID
 * @param variantId - Optional variant ID
 * @param outletId - Optional outlet ID
 * @param date - Optional effective date (defaults to now)
 * @param options - Cache options
 * @returns Resolved price with metadata
 */
export async function resolvePrice(
  companyId: number,
  itemId: number,
  variantId: number | null = null,
  outletId: number | null = null,
  date?: Date,
  options?: CacheOptions
): Promise<ResolvedPrice> {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  
  // Check cache first
  const cacheKey = getCacheKey(companyId, itemId, variantId, outletId, date);
  const cachedPrice = getCachedPrice(cacheKey);
  if (cachedPrice) {
    return cachedPrice;
  }

  const db = getDb();
  const effectiveDate = date ?? new Date();

  // Try variant-specific price for outlet first
  if (variantId !== null && outletId !== null) {
    const variantOutletPrice = await findVariantOutletPrice(
      db,
      companyId,
      itemId,
      variantId,
      outletId,
      effectiveDate
    );
    if (variantOutletPrice) {
      const result: ResolvedPrice = {
        ...variantOutletPrice,
        source: "variant_outlet"
      };
      cachePrice(cacheKey, result, ttlMs);
      return result;
    }
  }

  // Try item-outlet price (outlet override)
  if (outletId !== null) {
    const itemOutletPrice = await findItemOutletPrice(
      db,
      companyId,
      itemId,
      outletId,
      effectiveDate
    );
    if (itemOutletPrice) {
      const result: ResolvedPrice = {
        ...itemOutletPrice,
        source: "item_outlet"
      };
      cachePrice(cacheKey, result, ttlMs);
      return result;
    }
  }

  // Try variant-default price (variant with no outlet)
  if (variantId !== null) {
    const variantDefaultPrice = await findVariantDefaultPrice(
      db,
      companyId,
      itemId,
      variantId,
      effectiveDate
    );
    if (variantDefaultPrice) {
      const result: ResolvedPrice = {
        ...variantDefaultPrice,
        source: "variant_default"
      };
      cachePrice(cacheKey, result, ttlMs);
      return result;
    }
  }

  // Try item-default price (company default for item)
  const itemDefaultPrice = await findItemDefaultPrice(
    db,
    companyId,
    itemId,
    effectiveDate
  );
  if (itemDefaultPrice) {
    const result: ResolvedPrice = {
      ...itemDefaultPrice,
      source: "item_default"
    };
    cachePrice(cacheKey, result, ttlMs);
    return result;
  }

  // No price found - return global default (0)
  const result: ResolvedPrice = {
    price: 0,
    price_id: null,
    is_override: false,
    is_variant_specific: variantId !== null,
    source: "global_default"
  };
  cachePrice(cacheKey, result, ttlMs);
  return result;
}

/**
 * Batch resolve prices for multiple item/variant combinations
 * More efficient than calling resolvePrice multiple times
 */
export async function resolvePricesBatch(
  companyId: number,
  requests: Array<{
    itemId: number;
    variantId?: number | null;
    outletId?: number | null;
  }>,
  date?: Date,
  options?: CacheOptions
): Promise<Map<string, ResolvedPrice>> {
  const results = new Map<string, ResolvedPrice>();
  
  // Process all requests, checking cache first
  const uncachedRequests: typeof requests = [];
  
  for (const req of requests) {
    const cacheKey = getCacheKey(
      companyId,
      req.itemId,
      req.variantId ?? null,
      req.outletId ?? null,
      date
    );
    const cached = getCachedPrice(cacheKey);
    if (cached) {
      results.set(cacheKey, cached);
    } else {
      uncachedRequests.push(req);
    }
  }

  if (uncachedRequests.length === 0) {
    return results;
  }

  const db = getDb();
  const effectiveDate = date ?? new Date();

  // Build batch query for all uncached requests
  const prices = await findPricesBatch(db, companyId, uncachedRequests, effectiveDate);

  // Resolve each uncached request
  for (const req of uncachedRequests) {
    const cacheKey = getCacheKey(
      companyId,
      req.itemId,
      req.variantId ?? null,
      req.outletId ?? null,
      effectiveDate
    );

    const variantId = req.variantId ?? null;
    const outletId = req.outletId ?? null;

    let result: ResolvedPrice;

    // Try in order: variant_outlet, item_outlet, variant_default, item_default
    if (variantId !== null && outletId !== null) {
      const voPrice = prices.get(`vo:${companyId}:${req.itemId}:${variantId}:${outletId}`);
      if (voPrice) {
        result = { ...voPrice, source: "variant_outlet" };
        cachePrice(cacheKey, result, options?.ttlMs ?? DEFAULT_TTL_MS);
        results.set(cacheKey, result);
        continue;
      }
    }

    if (outletId !== null) {
      const ioPrice = prices.get(`io:${companyId}:${req.itemId}:${outletId}`);
      if (ioPrice) {
        result = { ...ioPrice, source: "item_outlet" };
        cachePrice(cacheKey, result, options?.ttlMs ?? DEFAULT_TTL_MS);
        results.set(cacheKey, result);
        continue;
      }
    }

    if (variantId !== null) {
      const vdPrice = prices.get(`vd:${companyId}:${req.itemId}:${variantId}`);
      if (vdPrice) {
        result = { ...vdPrice, source: "variant_default" };
        cachePrice(cacheKey, result, options?.ttlMs ?? DEFAULT_TTL_MS);
        results.set(cacheKey, result);
        continue;
      }
    }

    const idPrice = prices.get(`id:${companyId}:${req.itemId}`);
    if (idPrice) {
      result = { ...idPrice, source: "item_default" };
      cachePrice(cacheKey, result, options?.ttlMs ?? DEFAULT_TTL_MS);
      results.set(cacheKey, result);
      continue;
    }

    // No price found
    result = {
      price: 0,
      price_id: null,
      is_override: false,
      is_variant_specific: variantId !== null,
      source: "global_default"
    };
    cachePrice(cacheKey, result, options?.ttlMs ?? DEFAULT_TTL_MS);
    results.set(cacheKey, result);
  }

  return results;
}
