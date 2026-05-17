// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Typed API client for the Jurnapod backoffice.
// Wraps openapi-fetch with auth Bearer injection, 401 → refresh → retry,
// and ADR-0006 error normalization.
//
// MVP endpoint families covered: auth, users, roles, companies, outlets,
// inventory/items, operations (sync).
//
// Usage:
//   import { api } from "@/lib/api/client";
//   const { data, error } = await api.GET("/users", { params: { query: { ... } } });

import createClient from "openapi-fetch";
import type { paths } from "./schema";

import { getApiBaseUrl } from "@/lib/api-base-url";
import { getStoredAccessToken, storeAccessToken, clearAccessToken } from "@/lib/auth-storage";

// ---------------------------------------------------------------------------
// Re-export the generated paths type so callers can reference response/body shapes
// ---------------------------------------------------------------------------

export type { paths };

// ---------------------------------------------------------------------------
// ApiError — mirrors the existing error shape from lib/api-client.ts
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Silent token refresh (deduplicated, same pattern as lib/auth-refresh.ts)
// ---------------------------------------------------------------------------

let refreshPromise: Promise<string | null> | null = null;

async function silentRefreshToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          return null;
        }

        const data = (await response.json()) as {
          success?: boolean;
          data?: { access_token?: string };
        };

        if (data.success && data.data?.access_token) {
          const token = data.data.access_token;
          storeAccessToken(token);
          return token;
        }

        return null;
      } catch {
        return null;
      }
    })();
  }

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

// ---------------------------------------------------------------------------
// Auth-aware fetch wrapper
// ---------------------------------------------------------------------------

function createAuthFetch(): typeof fetch {
  // Track in-flight 401 retries to prevent concurrent refresh storms
  let isRefreshing = false;
  let pendingRefresh: Promise<string | null> | null = null;

  return async (input, init) => {
    // input may be a Request object (from openapi-fetch) or a string URL.
    const isRequest = input instanceof Request;
    const existingHeaders = isRequest
      ? new Headers(input.headers)
      : new Headers(init?.headers);

    // Inject stored access token as Bearer
    const storedToken = getStoredAccessToken();
    if (storedToken && !existingHeaders.has("Authorization") && !existingHeaders.has("x-jp-public")) {
      existingHeaders.set("Authorization", `Bearer ${storedToken}`);
    }

    // Build the fetch Request — preserve body and other init fields
    const buildRequest = (extraHeaders?: Headers) => {
      const h = extraHeaders ?? existingHeaders;
      if (isRequest) {
        return new Request(input, { headers: h });
      }
      return new Request(input, { ...init, headers: h });
    };

    let response = await fetch(buildRequest());

    // 401 → silent refresh → retry (exactly once, no infinite loops)
    if (response.status === 401 && !existingHeaders.has("x-jp-retry")) {
      // Deduplicate concurrent refresh calls
      if (!isRefreshing) {
        isRefreshing = true;
        pendingRefresh = silentRefreshToken().finally(() => {
          isRefreshing = false;
          pendingRefresh = null;
        });
      }

      const newToken = pendingRefresh ? await pendingRefresh : null;

      if (newToken) {
        // Retry with new token
        const retryHeaders = new Headers(existingHeaders);
        retryHeaders.set("Authorization", `Bearer ${newToken}`);
        retryHeaders.set("x-jp-retry", "1");
        response = await fetch(buildRequest(retryHeaders));
      }
    }

    return response;
  };
}

// ---------------------------------------------------------------------------
// Exported typed API client instance
// ---------------------------------------------------------------------------

/**
 * Typed API client for the Jurnapod API.
 *
 * Use the typed methods (GET, POST, PATCH, PUT, DELETE) provided by
 * openapi-fetch. The client automatically:
 *
 * - Injects the stored access token as a Bearer header.
 * - Silently refreshes the token on 401 responses (deduplicated).
 * - Retries the original request with the new token once.
 *
 * Token resolution follows the canonical path via getStoredAccessToken().
 * Never log tokens or PII.
 */
export const api = createClient<paths>({
  baseUrl: getApiBaseUrl(),
  credentials: "include",
  fetch: createAuthFetch(),
});

// ---------------------------------------------------------------------------
// Factory: create a fresh client (useful for testing or custom base URLs)
// ---------------------------------------------------------------------------

export function createTypedClient(
  opts?: { baseUrl?: string },
): ReturnType<typeof createClient<paths>> {
  return createClient<paths>({
    baseUrl: opts?.baseUrl ?? getApiBaseUrl(),
    credentials: "include",
    fetch: createAuthFetch(),
  });
}

// ---------------------------------------------------------------------------
// Auth lifecycle helpers (convenience exports)
// ---------------------------------------------------------------------------

/**
 * Sign out: calls the server logout endpoint and clears the stored token.
 * After calling, the caller MUST redirect to /login.
 */
export async function signOut(): Promise<void> {
  try {
    await fetch(`${getApiBaseUrl()}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Best-effort — the cookie may already be expired.
  }
  clearAccessToken();
}
