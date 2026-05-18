// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Pure admin helpers for user management — validation, role assignment,
// permission preview, and change summary functions.
//
// All functions are pure; no DB, API, or side effects.
// Backend deny-by-default remains authoritative.

import {
  isSystemRole,
  type UserPermissionEntry,
  actionGates,
  formatMaskLabel,
} from "@/lib/auth/permissions";

// ---------------------------------------------------------------------------
// Form validation
// ---------------------------------------------------------------------------

export interface UserFormInput {
  email: string;
  name?: string;
  roleCode?: string;
  outletId?: number | null;
  status?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate user creation/edit form input.
 * Returns an array of validation errors. Empty array means valid.
 *
 * This is pure client-side validation only; backend validation is authoritative.
 */
export function validateUserForm(input: UserFormInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // Email
  if (!input.email || input.email.trim().length === 0) {
    errors.push({ field: "email", message: "Email is required" });
  } else if (input.email.length > 254) {
    errors.push({ field: "email", message: "Email must be 254 characters or fewer" });
  } else if (!EMAIL_REGEX.test(input.email.trim())) {
    errors.push({ field: "email", message: "Email format is invalid" });
  }

  // Name
  if (input.name !== undefined && input.name.trim().length === 0) {
    errors.push({ field: "name", message: "Name cannot be empty" });
  }
  if (input.name !== undefined && input.name.length > 255) {
    errors.push({ field: "name", message: "Name must be 255 characters or fewer" });
  }

  // Role
  if (input.roleCode !== undefined && input.roleCode.trim().length === 0) {
    errors.push({ field: "roleCode", message: "Role is required" });
  }

  // Outlet
  if (input.outletId !== undefined && input.outletId !== null && input.outletId <= 0) {
    errors.push({ field: "outletId", message: "Outlet ID must be positive" });
  }

  return errors;
}

/**
 * Check if a user form is valid (no validation errors).
 */
export function isUserFormValid(input: UserFormInput): boolean {
  return validateUserForm(input).length === 0;
}

// ---------------------------------------------------------------------------
// Role assignment validation
// ---------------------------------------------------------------------------

export interface RoleAssignment {
  userId: number;
  roleCode: string;
  outletId?: number | null;
}

export interface RoleAssignmentValidation {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate a role assignment before submission.
 * System roles (SUPER_ADMIN, OWNER, etc.) can be assigned to users
 * but their permissions are immutable on the backend.
 *
 * @param assignment - Proposed role assignment
 * @param isTargetSystemRole - Whether the target role is a system role
 */
export function validateRoleAssignment(
  assignment: RoleAssignment,
  isTargetSystemRole: boolean = isSystemRole(assignment.roleCode),
): RoleAssignmentValidation {
  const errors: ValidationError[] = [];

  if (!assignment.userId || assignment.userId <= 0) {
    errors.push({ field: "userId", message: "Valid user ID is required" });
  }

  if (!assignment.roleCode || assignment.roleCode.trim().length === 0) {
    errors.push({ field: "roleCode", message: "Role code is required" });
  }

  if (isTargetSystemRole) {
    // System role assignment is valid but the role permissions are immutable
    // This is informational; not an error
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Permission preview
// ---------------------------------------------------------------------------

export interface PermissionPreview {
  module: string;
  resource: string;
  currentMask: number;
  currentLabel: string;
  newMask: number;
  newLabel: string;
  changed: boolean;
}

/**
 * Preview permission changes for a role change.
 *
 * @param currentPermissions - The user's current effective permissions
 * @param newRolePermissions - The permissions the new role would grant
 */
export function previewPermissionChange(
  currentPermissions: readonly UserPermissionEntry[],
  newRolePermissions: readonly UserPermissionEntry[],
): PermissionPreview[] {
  const currentMap = new Map<string, number>();
  const newMap = new Map<string, number>();

  for (const entry of currentPermissions) {
    const key = `${entry.module}.${entry.resource}`;
    currentMap.set(key, (currentMap.get(key) ?? 0) | entry.mask);
  }

  for (const entry of newRolePermissions) {
    const key = `${entry.module}.${entry.resource}`;
    newMap.set(key, (newMap.get(key) ?? 0) | entry.mask);
  }

  const allKeys = new Set([...currentMap.keys(), ...newMap.keys()]);
  const previews: PermissionPreview[] = [];

  for (const key of allKeys) {
    const [module, resource] = key.split(".");
    const currentMask = currentMap.get(key) ?? 0;
    const newMask = newMap.get(key) ?? 0;

    if (currentMask !== newMask) {
      previews.push({
        module,
        resource,
        currentMask,
        currentLabel: formatMaskLabelForPreview(currentMask),
        newMask,
        newLabel: formatMaskLabelForPreview(newMask),
        changed: true,
      });
    }
  }

  return previews.sort((a, b) => {
    const modCmp = a.module.localeCompare(b.module);
    if (modCmp !== 0) return modCmp;
    return a.resource.localeCompare(b.resource);
  });
}

// ---------------------------------------------------------------------------
// Change summary
// ---------------------------------------------------------------------------

export interface ChangeSummaryItem {
  field: string;
  label: string;
  before: string;
  after: string;
}

/**
 * Generate a change summary for user edit operations.
 *
 * @param before - Original values
 * @param after - New values
 * @returns Summary items for fields that changed
 */
export function generateChangeSummary(
  before: Partial<UserFormInput>,
  after: Partial<UserFormInput>,
): ChangeSummaryItem[] {
  const items: ChangeSummaryItem[] = [];

  if (before.email !== undefined && after.email !== undefined && before.email !== after.email) {
    items.push({
      field: "email",
      label: "Email",
      before: before.email,
      after: after.email,
    });
  }

  if (before.name !== undefined && after.name !== undefined && before.name !== after.name) {
    items.push({
      field: "name",
      label: "Name",
      before: before.name,
      after: after.name,
    });
  }

  if (before.roleCode !== undefined && after.roleCode !== undefined && before.roleCode !== after.roleCode) {
    items.push({
      field: "roleCode",
      label: "Role",
      before: before.roleCode,
      after: after.roleCode,
    });
  }

  if (
    before.outletId !== undefined &&
    after.outletId !== undefined &&
    before.outletId !== after.outletId
  ) {
    items.push({
      field: "outletId",
      label: "Outlet",
      before: String(before.outletId ?? "None"),
      after: String(after.outletId ?? "None"),
    });
  }

  if (before.status !== undefined && after.status !== undefined && before.status !== after.status) {
    items.push({
      field: "status",
      label: "Status",
      before: before.status,
      after: after.status,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Action visibility helpers
// ---------------------------------------------------------------------------

export type UserAction = "view" | "create" | "edit" | "deactivate" | "delete";

/**
 * Determine which user management actions are visible/enabled
 * based on the current user's effective permissions.
 *
 * @param userPermissions - The current admin's effective permissions
 */
export function getUserActionGates(
  userPermissions: readonly UserPermissionEntry[],
): Record<UserAction, boolean> {
  const gates = actionGates(userPermissions, "platform", "users", [
    "READ",
    "CREATE",
    "UPDATE",
    "DELETE",
  ]);

  return {
    view: gates.READ,
    create: gates.CREATE,
    edit: gates.UPDATE,
    deactivate: gates.DELETE, // backend deactivation/reactivation routes require DELETE permission
    delete: gates.DELETE,     // corresponds to void/deactivation
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatMaskLabelForPreview(mask: number): string {
  return `${formatMaskLabel(mask)}(${mask})`;
}

/**
 * Generate a descriptive label summarizing the effective permissions
 * a role change would grant, for display in a review confirmation.
 */
export function describeRolePermissionChange(
  fromRole: string,
  toRole: string,
  addedPermissions: readonly string[],
  removedPermissions: readonly string[],
): string {
  const parts: string[] = [];
  parts.push(`${fromRole} → ${toRole}`);

  if (addedPermissions.length > 0) {
    parts.push(`Gains: ${addedPermissions.join(", ")}`);
  }
  if (removedPermissions.length > 0) {
    parts.push(`Loses: ${removedPermissions.join(", ")}`);
  }

  return parts.join(" | ");
}
