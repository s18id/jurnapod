// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Web Platform Network Adapter
 * 
 * Implements NetworkPort using browser navigator.onLine and online/offline events.
 */

import type { NetworkPort } from "../../ports/network-port.js";

export class WebNetworkAdapter implements NetworkPort {
  isOnline(): boolean {
    return navigator.onLine;
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
