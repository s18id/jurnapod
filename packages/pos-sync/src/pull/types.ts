// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { SyncPullPayload } from "@jurnapod/shared";

export type PullSyncParams = {
  companyId: number;
  outletId: number;
  sinceVersion?: number;
  ordersCursor?: number;
};

export type PullSyncResult = {
  payload: SyncPullPayload;
  currentVersion: number;
};
