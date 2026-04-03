// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push DB Adapter
 *
 * Keeps route layer thin by isolating DB pool access in lib.
 */

import { getDbPool } from "@/lib/db";

export function getSyncPushDbPool() {
  return getDbPool();
}
