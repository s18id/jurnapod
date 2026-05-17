// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// ScopeBadge — Canonical shared admin primitive for rendering
// company, outlet, and status context.
//
// Renders Mantine Badges that reflect the current tenant scope.
// Updates automatically when the shell outlet context changes via
// the useShell() hook.
//
// Usage:
//   import { ScopeBadge, CompanyBadge, OutletBadge, StatusBadge } from "@/components/data-grid";
//   <CompanyBadge companyId={123} companyName="Demo Co" />
//   <OutletBadge outletName={currentOutlet?.name} />
//   <StatusBadge status="active" />

import { Badge, Group, Tooltip } from "@mantine/core";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ScopeBadgeProps {
  /** Label text for the badge */
  label: string;
  /** Mantine color variant */
  color?: string;
  /** Optional icon */
  icon?: ReactNode;
  /** Optional tooltip */
  tooltip?: string;
  /** Test ID */
  "data-testid"?: string;
  /** Additional variant */
  variant?: "light" | "filled" | "outline" | "dot" | "transparent" | "default" | "white";
}

/**
 * ScopeBadge — A generic badge for rendering context labels.
 *
 * Used to display company ID, outlet name, status, etc. in headers,
 * table cells, and detail drawers.
 */
export function ScopeBadge({
  label,
  color = "gray",
  icon,
  tooltip,
  "data-testid": testId,
  variant = "light",
}: ScopeBadgeProps) {
  const badge = (
    <Badge
      color={color}
      variant={variant}
      size="sm"
      leftSection={icon || undefined}
      data-testid={testId ?? "scope-badge"}
    >
      {label}
    </Badge>
  );

  if (tooltip) {
    return (
      <Tooltip label={tooltip} withArrow>
        {badge}
      </Tooltip>
    );
  }

  return badge;
}

// ---------------------------------------------------------------------------
// Convenience presets
// ---------------------------------------------------------------------------

export interface CompanyBadgeProps {
  companyId: number;
  companyName?: string;
  "data-testid"?: string;
}

/**
 * CompanyBadge — Shows the current company context.
 */
export function CompanyBadge({ companyId, companyName, "data-testid": testId }: CompanyBadgeProps) {
  const label = companyName ? `${companyName} (#${companyId})` : `Company #${companyId}`;
  return (
    <ScopeBadge
      label={label}
      color="blue"
      tooltip={`Current company ID: ${companyId}`}
      data-testid={testId ?? "company-badge"}
    />
  );
}

export interface OutletBadgeProps {
  outletName?: string | null;
  outletCount?: number;
  "data-testid"?: string;
}

/**
 * OutletBadge — Shows the currently selected outlet.
 */
export function OutletBadge({ outletName, outletCount, "data-testid": testId }: OutletBadgeProps) {
  const label = outletName ?? "No outlet selected";
  const tooltip = outletCount ? `${outletCount} outlet(s) available` : undefined;
  return (
    <ScopeBadge
      label={label}
      color="teal"
      tooltip={tooltip}
      data-testid={testId ?? "outlet-badge"}
    />
  );
}

export interface StatusBadgeProps {
  status: string;
  colorMap?: Record<string, string>;
  "data-testid"?: string;
}

const DEFAULT_STATUS_COLORS: Record<string, string> = {
  active: "green",
  enabled: "green",
  posted: "green",
  completed: "green",
  success: "green",
  pending: "yellow",
  draft: "yellow",
  syncing: "yellow",
  disabled: "gray",
  voided: "red",
  failed: "red",
  error: "red",
  expired: "red",
};

/**
 * StatusBadge — Shows a status with automatic color coding.
 */
export function StatusBadge({ status, colorMap, "data-testid": testId }: StatusBadgeProps) {
  const colors = { ...DEFAULT_STATUS_COLORS, ...colorMap };
  const color = colors[status.toLowerCase()] ?? "gray";

  return (
    <ScopeBadge
      label={status}
      color={color}
      variant="light"
      data-testid={testId ?? `status-badge-${status}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Multi-badge scope display
// ---------------------------------------------------------------------------

export interface ScopeDisplayProps {
  companyId: number;
  companyName?: string;
  outletName?: string | null;
  status?: string;
  "data-testid"?: string;
}

/**
 * ScopeDisplay — Renders CompanyBadge + OutletBadge + StatusBadge in a group.
 * This is the recommended way to show full tenant context in page headers.
 */
export function ScopeDisplay({
  companyId,
  companyName,
  outletName,
  status,
  "data-testid": testId,
}: ScopeDisplayProps) {
  return (
    <Group gap="xs" wrap="wrap" data-testid={testId ?? "scope-display"}>
      <CompanyBadge companyId={companyId} companyName={companyName} />
      {outletName && <OutletBadge outletName={outletName} />}
      {status && <StatusBadge status={status} />}
    </Group>
  );
}
