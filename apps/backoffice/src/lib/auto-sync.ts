// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { SyncService } from "./sync-service";

export function setupAutoSync(userId: number): () => void {
  const handleOnline = () => {
    SyncService.syncAll(userId).catch(() => undefined);
  };

  const handleVisibility = () => {
    if (!document.hidden && navigator.onLine) {
      SyncService.syncAll(userId).catch(() => undefined);
    }
  };

  window.addEventListener("online", handleOnline);
  document.addEventListener("visibilitychange", handleVisibility);

  const intervalId = window.setInterval(() => {
    if (navigator.onLine) {
      SyncService.syncAll(userId).catch(() => undefined);
    }
  }, 30000);

  if (navigator.onLine) {
    SyncService.syncAll(userId).catch(() => undefined);
  }

  return () => {
    window.removeEventListener("online", handleOnline);
    document.removeEventListener("visibilitychange", handleVisibility);
    window.clearInterval(intervalId);
  };
}
