// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { RoleCode } from "@/lib/session";

export type PermissionName = "READ" | "CREATE" | "UPDATE" | "DELETE" | "ANALYZE" | "MANAGE";

export type ModuleCode =
  | "platform"
  | "pos"
  | "sales"
  | "inventory"
  | "accounting"
  | "treasury"
  | "purchasing"
  | "reservations";

export type ResourcePermission = `${ModuleCode}.${string}`;

export type EffectivePermissionSet = ReadonlySet<ResourcePermission>;

export type ShellNavigationItem = {
  path: string;
  label: string;
  module: ModuleCode;
  resource: string;
  permission: PermissionName;
  allowedRoles?: readonly RoleCode[];
  children?: readonly ShellNavigationItem[];
};

export type ShellUserContext = {
  id: number;
  email: string;
  companyId: number;
  companyLabel: string;
  outletId?: number;
  outletLabel?: string;
  roles: readonly RoleCode[];
  globalRoles?: readonly RoleCode[];
};

export type SyncHealthState = "online" | "offline" | "syncing" | "degraded";

export type ShellStatusInput = {
  online: boolean;
  pendingJobsCount: number;
  syncAlertCount: number;
  lastSyncAtMs?: number;
  nowMs: number;
};

export type ShellStatus = {
  online: boolean;
  syncHealth: SyncHealthState;
  pendingJobsCount: number;
  syncAlertCount: number;
  lastSyncLabel: string;
};

const ADMIN_ROLES = new Set<RoleCode>(["SUPER_ADMIN", "OWNER"]);

export function toResourcePermission(module: ModuleCode, resource: string): ResourcePermission {
  return `${module}.${resource}` as ResourcePermission;
}

export function hasResourcePermission(
  permissions: EffectivePermissionSet,
  module: ModuleCode,
  resource: string,
): boolean {
  return permissions.has(toResourcePermission(module, resource));
}

export function hasAllowedRole(
  userRoles: readonly RoleCode[],
  allowedRoles: readonly RoleCode[] | undefined,
  globalRoles: readonly RoleCode[] = [],
): boolean {
  if (!allowedRoles || allowedRoles.length === 0) {
    return true;
  }
  const userRoleSet = new Set<RoleCode>([...userRoles, ...globalRoles]);
  return allowedRoles.some((role) => userRoleSet.has(role));
}

export function canAccessNavigationItem(
  item: ShellNavigationItem,
  user: Pick<ShellUserContext, "roles" | "globalRoles">,
  permissions: EffectivePermissionSet,
): boolean {
  const roleBypass = [...user.roles, ...(user.globalRoles ?? [])].some((role) => ADMIN_ROLES.has(role));
  if (!roleBypass && !hasAllowedRole(user.roles, item.allowedRoles, user.globalRoles)) {
    return false;
  }
  return roleBypass || hasResourcePermission(permissions, item.module, item.resource);
}

export function filterNavigationItems(
  items: readonly ShellNavigationItem[],
  user: Pick<ShellUserContext, "roles" | "globalRoles">,
  permissions: EffectivePermissionSet,
): ShellNavigationItem[] {
  const visibleItems: ShellNavigationItem[] = [];

  for (const item of items) {
    const children = item.children
      ? filterNavigationItems(item.children, user, permissions)
      : undefined;
    const canAccessSelf = canAccessNavigationItem(item, user, permissions);
    if (!canAccessSelf && (!children || children.length === 0)) {
      continue;
    }
    visibleItems.push({ ...item, children });
  }

  return visibleItems;
}

export function buildShellStatus(input: ShellStatusInput): ShellStatus {
  const syncHealth: SyncHealthState = !input.online
    ? "offline"
    : input.syncAlertCount > 0
      ? "degraded"
      : input.pendingJobsCount > 0
        ? "syncing"
        : "online";

  return {
    online: input.online,
    syncHealth,
    pendingJobsCount: Math.max(0, input.pendingJobsCount),
    syncAlertCount: Math.max(0, input.syncAlertCount),
    lastSyncLabel: formatLastSyncLabel(input.lastSyncAtMs, input.nowMs),
  };
}

export function formatLastSyncLabel(lastSyncAtMs: number | undefined, nowMs: number): string {
  if (lastSyncAtMs === undefined || lastSyncAtMs <= 0) {
    return "Last sync: never";
  }
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - lastSyncAtMs) / 1000));
  if (elapsedSeconds < 60) {
    return `Last sync: ${elapsedSeconds}s ago`;
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `Last sync: ${elapsedMinutes}m ago`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return `Last sync: ${elapsedHours}h ago`;
}
