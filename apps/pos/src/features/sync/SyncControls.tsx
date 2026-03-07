// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { Button } from "../../shared/components/index.js";

export interface SyncControlsProps {
  pushInFlight: boolean;
  pullInFlight: boolean;
  lastDataVersion: number;
  onPushSync: () => void;
  onPullSync: () => void;
}

export function SyncControls({
  pushInFlight,
  pullInFlight,
  lastDataVersion,
  onPushSync,
  onPullSync
}: SyncControlsProps): JSX.Element {
  return (
    <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
      <Button
        variant="primary"
        size="small"
        onClick={onPushSync}
        disabled={pushInFlight}
      >
        {pushInFlight ? "Pushing..." : "Sync push now"}
      </Button>
      <Button
        variant="primary"
        size="small"
        onClick={onPullSync}
        disabled={pullInFlight}
      >
        {pullInFlight ? "Syncing..." : "Sync pull now"}
      </Button>
      <span style={{ fontSize: 13, color: "#475569" }}>Last data version: {lastDataVersion}</span>
    </div>
  );
}
