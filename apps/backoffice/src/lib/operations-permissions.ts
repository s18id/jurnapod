// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { PERMISSION_BITS, userHasPermission } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/session";

export function canReadOperations(user: SessionUser | null | undefined): boolean {
  return userHasPermission(user?.permissions ?? [], "platform", "operations", PERMISSION_BITS.READ);
}
