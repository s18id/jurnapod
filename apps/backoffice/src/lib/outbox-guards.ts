// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { OutboxItem } from "./offline-db";

export type { OutboxItem };

export function canDeleteFailedOutboxItem(
  item: OutboxItem | undefined,
  userId: number
): boolean {
  if (!item) {
    return false;
  }
  if (item.userId !== userId) {
    return false;
  }
  if (item.status !== "failed") {
    return false;
  }
  return true;
}

export function canShowSyncQueueActions(
  status: OutboxItem["status"]
): boolean {
  return status === "failed";
}
