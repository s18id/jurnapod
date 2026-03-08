// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { IonBadge } from "@ionic/react";
import { badgeColors } from "../utils/ui-helpers.js";

export type BadgeStatus = "synced" | "pending" | "offline";

export interface BadgeProps {
  status: BadgeStatus;
  text?: string;
  showDot?: boolean;
}

export function Badge({
  status,
  text,
  showDot = true
}: BadgeProps): JSX.Element {
  const statusMap: Record<BadgeStatus, string> = {
    synced: "Synced",
    pending: "Pending",
    offline: "Offline"
  };

  const colors = badgeColors(status === "synced" ? "Synced" : status === "pending" ? "Pending" : "Offline");

  const baseStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 10px",
    borderRadius: "9999px",
    fontSize: "12px",
    fontWeight: 500,
    backgroundColor: colors.background,
    border: `1px solid ${colors.border}`,
    color: colors.text
  };

  return (
    <IonBadge style={baseStyles}>
      {showDot && (
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: colors.text
          }}
        />
      )}
      {text || statusMap[status]}
    </IonBadge>
  );
}
