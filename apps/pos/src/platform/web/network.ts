// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Web Platform Network Adapter
 * 
 * Implements NetworkPort using browser navigator.onLine and online/offline events.
 */

import type { NetworkPort } from "../../ports/network-port.js";

const DEFAULT_HEALTHCHECK_PATH = "/api/health";
const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 3000;

export class WebNetworkAdapter implements NetworkPort {
  isOnline(): boolean {
    return navigator.onLine;
  }

  async verifyConnectivity(options?: {
    baseUrl?: string;
    healthcheckPath?: string;
    timeoutMs?: number;
  }): Promise<boolean> {
    // Quick check: if navigator says offline, don't bother with healthcheck
    if (!navigator.onLine) {
      return false;
    }

    const baseUrl = options?.baseUrl ?? window.location.origin;
    const healthcheckPath = options?.healthcheckPath ?? DEFAULT_HEALTHCHECK_PATH;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_HEALTHCHECK_TIMEOUT_MS;
    const url = `${baseUrl}${healthcheckPath}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        credentials: "include"
      });

      return response.ok;
    } catch (error) {
      // Network error, timeout, or abort
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  onStatusChange(callback: (online: boolean) => void): () => void {
    const onOnline = () => callback(true);
    const onOffline = () => callback(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }
}

export function createWebNetworkAdapter(): NetworkPort {
  return new WebNetworkAdapter();
}
