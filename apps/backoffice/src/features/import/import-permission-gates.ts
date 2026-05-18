// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { actionGates, resolveEffectivePermissions } from "../../lib/auth/permissions";
import type { SessionUser } from "../../lib/session";
import type { ImportEntityType } from "../../hooks/use-import";

export function canAccessStagedImport(user: SessionUser, entityType: ImportEntityType): boolean {
  const effectivePermissions = resolveEffectivePermissions(user) ?? [];
  const action = entityType === "items" ? "CREATE" : "UPDATE";
  const gates = actionGates(effectivePermissions, "inventory", "items", [action]);
  return Boolean(gates[action]);
}

export function getImportDeniedMessage(entityType: ImportEntityType): string {
  const permission = entityType === "items" ? "CREATE" : "UPDATE";
  return `You need inventory.items.${permission} permission to import ${entityType}.`;
}
