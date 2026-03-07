// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Mobile Network Adapter
 * 
 * Implements NetworkPort using Capacitor Network plugin for native connectivity detection.
 */

import type { NetworkPort } from "../../ports/network-port.js";

const DEFAULT_HEALTHCHECK_PATH = "/api/health";
const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 3000;

export class MobileNetworkAdapter implements NetworkPort {
  private Network: any;
  private currentStatus: boolean = true;

  constructor() {
    try {
      // Try to import Capacitor Network plugin
      this.Network = require('@capacitor/network').Network;
      
      // Initialize current status
      this.Network.getStatus().then((status: any) => {
        this.currentStatus = status.connected;
      }).catch(() => {
        // Fallback to navigator.onLine if getStatus fails
        this.currentStatus = navigator.onLine;
      });
    } catch (err) {
      console.warn("Capacitor Network plugin not found, falling back to navigator.onLine");
      this.Network = null;
      this.currentStatus = navigator.onLine;
    }
  }

  isOnline(): boolean {
    return this.currentStatus;
  }

  async verifyConnectivity(options?: {
    baseUrl?: string;
    healthcheckPath?: string;
    timeoutMs?: number;
  }): Promise<boolean> {
    // Quick check: if network says offline, don't bother with healthcheck
    if (!this.isOnline()) {
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
    if (this.Network) {
      // Use Capacitor Network plugin
      const listenerHandle = this.Network.addListener('networkStatusChange', (status: any) => {
        this.currentStatus = status.connected;
        callback(status.connected);
      });

      return () => {
        if (listenerHandle && typeof listenerHandle.remove === 'function') {
          void listenerHandle.remove();
        }
      };
    } else {
      // Fallback to browser online/offline events
      const onOnline = () => {
        this.currentStatus = true;
        callback(true);
      };
      const onOffline = () => {
        this.currentStatus = false;
        callback(false);
      };

      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);

      return () => {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      };
    }
  }
}

export function createMobileNetworkAdapter(): NetworkPort {
  return new MobileNetworkAdapter();
}
