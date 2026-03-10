// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { Badge, type BadgeStatus } from "../../shared/components/index.js";
import type { RuntimeSyncBadgeState } from "../../services/runtime-service.js";

export interface SyncBadgeProps {
  status: RuntimeSyncBadgeState;
  pendingCount: number;
}

export function SyncBadge({ status, pendingCount }: SyncBadgeProps): JSX.Element {
  const badgeStatus: BadgeStatus = status === "Offline" ? "offline" : status === "Pending" ? "pending" : "synced";
  const showCount = pendingCount > 0;
  
  return (
    <Badge
      status={badgeStatus}
      text={`Sync: ${status}${showCount ? ` (${pendingCount})` : ""}`}
    />
  );
}
