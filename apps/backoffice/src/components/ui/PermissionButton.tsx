// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { type ButtonProps, Button } from "@mantine/core";
import type { SessionUser } from "../../lib/session";
import { usePermission } from "../../hooks/use-permission";
import type { PermissionBit } from "@jurnapod/shared";

export type PermissionButtonProps = Omit<ButtonProps, "onClick"> & {
  /** Module to check permission against (e.g., 'sales', 'accounting') */
  module: string;
  /** Permission required to show/enable the button */
  permission: PermissionBit;
  /** SessionUser to check permissions against */
  user: SessionUser | null;
  /** Children are rendered only if permission check passes */
  children: React.ReactNode;
  /** Optional callback for when button is clicked */
  onClick?: () => void;
  /** If true, button is disabled but still shown to users who lack permission */
  showDisabled?: boolean;
};

/**
 * PermissionButton
 * A button that only renders/shows based on user permissions
 * 
 * Use this for per-button permission enforcement instead of route-level checks only.
 * 
 * @example
 * // Show "Create" button only if user has CREATE on sales.orders
 * <PermissionButton
 *   module="sales"
 *   permission="CREATE"
 *   user={user}
 *   onClick={handleCreate}
 * >
 *   Create Order
 * </PermissionButton>
 */
export function PermissionButton({
  module,
  permission,
  user,
  children,
  onClick,
  showDisabled = false,
  ...buttonProps
}: PermissionButtonProps) {
  const { hasPermission } = usePermission(user);
  const allowed = hasPermission(module, permission);

  // If user doesn't have permission and we don't show disabled, render nothing
  if (!allowed && !showDisabled) {
    return null;
  }

  return (
    <Button
      {...buttonProps}
      onClick={allowed ? onClick : undefined}
      disabled={!allowed}
    >
      {children}
    </Button>
  );
}

/**
 * PermissionIconButton
 * An icon-only button with permission checking
 */
export type PermissionIconButtonProps = Omit<PermissionButtonProps, "children"> & {
  /** Icon to render */
  icon: React.ReactNode;
};

/**
 * PermissionIconButton
 * An icon button that only renders/shows based on user permissions
 * 
 * @example
 * <PermissionIconButton
 *   module="sales"
 *   permission="DELETE"
 *   user={user}
 *   icon={<TrashIcon />}
 *   onClick={handleDelete}
 *   tooltip="Delete order"
 * />
 */
export function PermissionIconButton({
  module,
  permission,
  user,
  icon,
  showDisabled = false,
  ...buttonProps
}: PermissionIconButtonProps) {
  const { hasPermission } = usePermission(user);
  const allowed = hasPermission(module, permission);

  if (!allowed && !showDisabled) {
    return null;
  }

  return (
    <Button
      variant="subtle"
      size="xs"
      disabled={!allowed}
      {...buttonProps}
    >
      {icon}
    </Button>
  );
}
