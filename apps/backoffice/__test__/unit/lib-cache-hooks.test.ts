// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
//
// Unit tests for cache/query helpers:
//   - query-keys.ts: deterministic key factory, canonical pattern validation
//   - query-hooks.ts: hook factory logic (isolated unit tests)
//   - query-client.ts: client config defaults
//
// These are pure unit tests — no DB, no real React rendering.
// TanStack Query hooks are tested via mock-wrapped factories.
//
// Run with:
//   npx vitest run --config apps/backoffice/vitest.config.ts __test__/unit/lib-cache-hooks.test.ts

import { describe, test, expect } from "vitest";

// ============================================================================
// Imports (pure modules — no mocking needed for key builders)
// ============================================================================

import {
  listQueryKey,
  detailQueryKey,
  listQueryKeyPrefix,
  resourceQueryKeyPrefix,
  isCanonicalQueryKey,
  DOMAINS,
} from "@/lib/cache/query-keys";

import {
  deriveListState,
} from "@/lib/cache/query-hooks";

import {
  DEFAULT_QUERY_CLIENT_CONFIG,
  getQueryClient,
  resetQueryClient,
} from "@/lib/cache/query-client";

// ============================================================================
// Query key builder tests
// ============================================================================

describe("query-keys: listQueryKey", () => {
  test("builds a list key with domain, resource, and params", () => {
    const key = listQueryKey("inventory", "items", { page: 1, limit: 25 });
    expect(key).toEqual(["inventory", "items", "list", { page: 1, limit: 25 }]);
  });

  test("omits params segment when params is empty", () => {
    const key1 = listQueryKey("platform", "users", {});
    const key2 = listQueryKey("platform", "users");
    const key3 = listQueryKey("platform", "users", undefined);

    expect(key1).toEqual(["platform", "users", "list"]);
    expect(key2).toEqual(["platform", "users", "list"]);
    expect(key3).toEqual(["platform", "users", "list"]);
  });

  test("follows domain.resource pattern for all canonical domains", () => {
    for (const domain of DOMAINS) {
      const key = listQueryKey(domain, "test-resource", {});
      expect(key[0]).toBe(domain);
      expect(key[1]).toBe("test-resource");
      expect(key[2]).toBe("list");
    }
  });
});

describe("query-keys: detailQueryKey", () => {
  test("builds a detail key with domain, resource, and numeric ID", () => {
    const key = detailQueryKey("platform", "users", 42);
    expect(key).toEqual(["platform", "users", "detail", 42]);
  });

  test("builds a detail key with string ID", () => {
    const key = detailQueryKey("inventory", "items", "abc-123");
    expect(key).toEqual(["inventory", "items", "detail", "abc-123"]);
  });
});

describe("query-keys: listQueryKeyPrefix", () => {
  test("returns domain.resource.list prefix without params", () => {
    const prefix = listQueryKeyPrefix("accounting", "journals");
    expect(prefix).toEqual(["accounting", "journals", "list"]);
  });

  test("prefix is a subset of full list keys for partial matching", () => {
    const prefix = listQueryKeyPrefix("inventory", "items");
    const fullKey = listQueryKey("inventory", "items", { page: 1 });

    // The full key starts with the prefix (for useQuery.invalidateQueries partial matching)
    expect(fullKey).toEqual(expect.arrayContaining(prefix));
  });
});

describe("query-keys: resourceQueryKeyPrefix", () => {
  test("returns domain.resource prefix", () => {
    const prefix = resourceQueryKeyPrefix("sales", "invoices");
    expect(prefix).toEqual(["sales", "invoices"]);
  });
});

describe("query-keys: isCanonicalQueryKey", () => {
  test("returns true for valid domain.resource keys", () => {
    expect(isCanonicalQueryKey(["platform", "users"])).toBe(true);
    expect(isCanonicalQueryKey(["inventory", "items", "list"])).toBe(true);
    expect(isCanonicalQueryKey(["accounting", "journals", "detail", 1])).toBe(true);
  });

  test("returns false for invalid or non-canonical keys", () => {
    expect(isCanonicalQueryKey([])).toBe(false);
    expect(isCanonicalQueryKey(["bad"])).toBe(false);
    expect(isCanonicalQueryKey(["unknown", ""])).toBe(false);
    expect(isCanonicalQueryKey(["platform", 123])).toBe(false); // resource must be string
    expect(isCanonicalQueryKey(["not-a-domain", "users"])).toBe(false);
  });
});

// ============================================================================
// deriveListState tests
// ============================================================================

describe("query-hooks: deriveListState", () => {
  test("returns loading state", () => {
    const result = deriveListState({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as any);

    expect(result.isLoading).toBe(true);
    expect(result.data).toBeUndefined();
    expect(result.isEmpty).toBe(false);
    expect(result.isError).toBe(false);
  });

  test("returns error state", () => {
    const result = deriveListState({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { code: "NETWORK_ERROR", message: "Connection failed" },
    } as any);

    expect(result.isError).toBe(true);
    expect(result.error).toEqual({ code: "NETWORK_ERROR", message: "Connection failed" });
    expect(result.isLoading).toBe(false);
  });

  test("returns empty state", () => {
    const result = deriveListState({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    expect(result.isEmpty).toBe(true);
    expect(result.data).toEqual([]);
    expect(result.isError).toBe(false);
    expect(result.isLoading).toBe(false);
  });

  test("returns data state", () => {
    const items = [{ id: 1, name: "Item 1" }, { id: 2, name: "Item 2" }];
    const result = deriveListState({
      data: items,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    expect(result.isEmpty).toBe(false);
    expect(result.data).toEqual(items);
    expect(result.isLoading).toBe(false);
    expect(result.isError).toBe(false);
  });
});

// ============================================================================
// QueryClient configuration tests
// ============================================================================

describe("query-client: defaults and factory", () => {
  // Use a fresh module state per test by managing reset manually.
  // resetQueryClient creates a new client; tests that want custom config
  // should call resetQueryClient({...config}). Tests that test singleton
  // behavior should be careful about order.

  test("DEFAULT_QUERY_CLIENT_CONFIG has sensible defaults", () => {
    expect(DEFAULT_QUERY_CLIENT_CONFIG.defaultOptions?.queries?.staleTime).toBe(30 * 1000);
    expect(DEFAULT_QUERY_CLIENT_CONFIG.defaultOptions?.queries?.gcTime).toBe(5 * 60 * 1000);
    expect(DEFAULT_QUERY_CLIENT_CONFIG.defaultOptions?.queries?.retry).toBe(1);
    expect(DEFAULT_QUERY_CLIENT_CONFIG.defaultOptions?.mutations?.retry).toBe(0);
  });

  test("resetQueryClient creates a client with custom config", () => {
    const client = resetQueryClient({
      defaultOptions: {
        queries: { staleTime: 60 * 1000 },
      },
    });

    expect(client.getDefaultOptions().queries?.staleTime).toBe(60 * 1000);
  });

  test("getQueryClient returns a singleton instance", () => {
    // Force fresh start
    resetQueryClient();
    const client1 = getQueryClient();
    const client2 = getQueryClient();

    expect(client1).toBe(client2);
  });

  test("resetQueryClient creates a new instance", () => {
    resetQueryClient();
    const client1 = getQueryClient();
    const client2 = resetQueryClient();

    expect(client1).not.toBe(client2);
  });
});
