// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { actionGates, resolveEffectivePermissions } from "./auth/permissions";
import type { SessionUser } from "./session";

export function canShowInventoryExport(user: SessionUser): boolean {
  const effectivePermissions = resolveEffectivePermissions(user) ?? [];
  return actionGates(effectivePermissions, "inventory", "items", ["READ"]).READ;
}
