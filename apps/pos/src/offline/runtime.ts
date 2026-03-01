// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { type PosOfflineDb, posDb } from "./db.js";
import { runOutboxDrainAsLeader } from "./outbox-leader.js";
import type { ProductCacheRow } from "./types.js";

export type RuntimeSyncBadgeState = "Offline" | "Pending" | "Synced";

export interface RuntimeOutletScope {
  company_id: number;
  outlet_id: number;
}

export interface RuntimeOfflineSnapshot {
  pending_outbox_count: number;
  has_product_cache: boolean;
}

export interface RuntimeCheckoutConfig {
  tax: {
    rate: number;
    inclusive: boolean;
  };
  payment_methods: string[];
}

const DEFAULT_RUNTIME_PAYMENT_METHODS = ["CASH"];
const DEFAULT_RUNTIME_TAX = {
  rate: 0,
  inclusive: false
};

function normalizeRuntimePaymentMethods(paymentMethods: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawMethod of paymentMethods) {
    const method = rawMethod.trim();
    if (!method || seen.has(method)) {
      continue;
    }

    seen.add(method);
    normalized.push(method);
  }

  if (normalized.length === 0) {
    return [...DEFAULT_RUNTIME_PAYMENT_METHODS];
  }

  return normalized;
}

export function resolveRuntimeCheckoutConfig(config: RuntimeCheckoutConfig | null): RuntimeCheckoutConfig {
  if (!config) {
    return {
      tax: { ...DEFAULT_RUNTIME_TAX },
      payment_methods: [...DEFAULT_RUNTIME_PAYMENT_METHODS]
    };
  }

  const taxRate = Number.isFinite(config.tax.rate) && config.tax.rate >= 0 ? config.tax.rate : 0;

  return {
    tax: {
      rate: taxRate,
      inclusive: config.tax.inclusive
    },
    payment_methods: normalizeRuntimePaymentMethods(config.payment_methods)
  };
}

export function isRuntimePaymentMethodAllowed(method: string, paymentMethods: readonly string[]): boolean {
  return normalizeRuntimePaymentMethods(paymentMethods).includes(method);
}

export function resolveRuntimePaymentMethod(method: string, paymentMethods: readonly string[]): string {
  const normalizedMethods = normalizeRuntimePaymentMethods(paymentMethods);
  if (normalizedMethods.includes(method)) {
    return method;
  }

  return normalizedMethods[0];
}

export async function readRuntimeGlobalDueOutboxCount(db: PosOfflineDb = posDb): Promise<number> {
  return db.outbox_jobs
    .toCollection()
    .filter((job) => {
      if (job.status === "PENDING") {
        return true;
      }

      if (job.status !== "FAILED") {
        return false;
      }

      if (!job.next_attempt_at) {
        return true;
      }

      const nextAttempt = Date.parse(job.next_attempt_at);
      return Number.isFinite(nextAttempt) && nextAttempt <= Date.now();
    })
    .count();
}

export interface RuntimeProductCatalogItem {
  item_id: number;
  sku: string | null;
  name: string;
  item_type: ProductCacheRow["item_type"];
  price_snapshot: number;
}

export interface RuntimeOutboxDrainCycleInput {
  is_online: boolean;
  pending_outbox_count: number;
  drain: () => Promise<void> | void;
}

export function readNavigatorOnlineState(): boolean {
  if (typeof navigator === "undefined") {
    return true;
  }

  return navigator.onLine;
}

export interface RuntimeOnlineStateInput {
  navigator_online?: boolean;
  healthcheck_url?: string;
  timeout_ms?: number;
  fetch_impl?: typeof fetch;
}

const DEFAULT_HEALTHCHECK_URL = "/api/health";
const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 1200;

export async function readRuntimeOnlineState(input: RuntimeOnlineStateInput = {}): Promise<boolean> {
  const navigatorOnline = input.navigator_online ?? readNavigatorOnlineState();
  if (!navigatorOnline) {
    return false;
  }

  const fetchCandidate = input.fetch_impl ?? (typeof fetch === "function" ? fetch : null);
  const fetchImpl = fetchCandidate ? fetchCandidate.bind(globalThis) : null;
  if (!fetchImpl) {
    return true;
  }

  const timeoutMs = input.timeout_ms ?? DEFAULT_HEALTHCHECK_TIMEOUT_MS;
  const healthcheckUrl = input.healthcheck_url ?? DEFAULT_HEALTHCHECK_URL;
  const abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId =
    abortController && timeoutMs > 0
      ? globalThis.setTimeout(() => {
          abortController.abort();
        }, timeoutMs)
      : null;

  try {
    const response = await fetchImpl(healthcheckUrl, {
      method: "GET",
      cache: "no-store",
      signal: abortController?.signal
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    if (timeoutId != null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}

export function resolveRuntimeSyncBadgeState(isOnline: boolean, pendingOutboxCount: number): RuntimeSyncBadgeState {
  if (!isOnline) {
    return "Offline";
  }

  if (pendingOutboxCount > 0) {
    return "Pending";
  }

  return "Synced";
}

export async function readRuntimeOfflineSnapshot(
  scope: RuntimeOutletScope,
  db: PosOfflineDb = posDb
): Promise<RuntimeOfflineSnapshot> {
  return db.transaction("r", [db.products_cache, db.outbox_jobs], async () => {
    const [pending_outbox_count, cacheRow] = await Promise.all([
      db.outbox_jobs
        .toCollection()
        .filter(
          (job) =>
            (job.status === "PENDING" || job.status === "FAILED") &&
            job.company_id === scope.company_id &&
            job.outlet_id === scope.outlet_id
        )
        .count(),
      db.products_cache
        .toCollection()
        .filter((row) => row.company_id === scope.company_id && row.outlet_id === scope.outlet_id)
        .first()
    ]);

    return {
      pending_outbox_count,
      has_product_cache: Boolean(cacheRow)
    };
  });
}

export async function runRuntimeOutboxDrainCycle(input: RuntimeOutboxDrainCycleInput): Promise<boolean> {
  if (!input.is_online || input.pending_outbox_count <= 0) {
    return false;
  }

  const leaderResult = await runOutboxDrainAsLeader(async () => {
    await input.drain();
  });

  return leaderResult.acquired;
}

export async function readRuntimeProductCatalog(
  scope: RuntimeOutletScope,
  db: PosOfflineDb = posDb
): Promise<RuntimeProductCatalogItem[]> {
  const rows = await db.products_cache
    .toCollection()
    .filter((row) => row.company_id === scope.company_id && row.outlet_id === scope.outlet_id && row.is_active)
    .toArray();

  rows.sort((left, right) => left.name.localeCompare(right.name));

  return rows.map((row) => ({
    item_id: row.item_id,
    sku: row.sku,
    name: row.name,
    item_type: row.item_type,
    price_snapshot: row.price_snapshot
  }));
}
