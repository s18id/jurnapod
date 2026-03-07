// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Web Platform Sync Transport Adapter
 * 
 * Implements SyncTransport using browser fetch API.
 */

import type {
  SyncTransport,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse
} from "../../ports/sync-transport.js";

export class WebSyncTransportAdapter implements SyncTransport {
  async pull(
    request: SyncPullRequest,
    options?: { baseUrl?: string; accessToken?: string }
  ): Promise<SyncPullResponse> {
    const origin = options?.baseUrl ?? window.location.origin;
    const url = new URL(`${origin}/api/sync/pull`);

    url.searchParams.set("outlet_id", String(request.outlet_id));
    if (request.since_version !== undefined) {
      url.searchParams.set("since_version", String(request.since_version));
    }

    const headers: HeadersInit = {
      accept: "application/json"
    };

    if (options?.accessToken) {
      headers.authorization = `Bearer ${options.accessToken}`;
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      credentials: "include"
    });

    if (!response.ok) {
      throw new Error(
        `Sync pull failed: ${response.status} ${response.statusText}`
      );
    }

    const payload = await response.json();

    if (!payload?.success) {
      throw new Error(
        `Sync pull failed: ${payload?.data?.message ?? "Unknown error"}`
      );
    }

    return payload as SyncPullResponse;
  }

  async push(
    request: SyncPushRequest,
    options?: { baseUrl?: string; accessToken?: string }
  ): Promise<SyncPushResponse> {
    const origin = options?.baseUrl ?? window.location.origin;
    const url = `${origin}/api/sync/push`;

    const headers: HeadersInit = {
      "content-type": "application/json",
      accept: "application/json"
    };

    if (options?.accessToken) {
      headers.authorization = `Bearer ${options.accessToken}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(
        `Sync push failed: ${response.status} ${response.statusText}`
      );
    }

    const payload = await response.json();

    if (!payload?.success) {
      throw new Error(
        `Sync push failed: ${payload?.data?.message ?? "Unknown error"}`
      );
    }

    return payload as SyncPushResponse;
  }
}

export function createWebSyncTransportAdapter(): SyncTransport {
  return new WebSyncTransportAdapter();
}
