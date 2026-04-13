// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { PERMISSION_BITS, PERMISSION_MASK } from "@jurnapod/shared";

export { PERMISSION_BITS, PERMISSION_MASK };

/**
 * Module role response type for API output.
 */
export type ModuleRoleResponse = {
  id: number;
  role_id: number;
  role_code: string;
  module: string;
  resource: string;
  permission_mask: number;
  created_at: string;
  updated_at: string;
};

/**
 * Internal module role row type from database.
 */
export type ModuleRoleRow = {
  id: number;
  role_id: number;
  role_code: string;
  module: string;
  resource: string;
  permission_mask: number;
  created_at: Date;
  updated_at: Date;
};

/**
 * Full permission mask for global roles (CRUDA: Create + Read + Update + Delete + Report).
 * Sourced from PERMISSION_MASK.CRUDA in @jurnapod/shared.
 */
export const FULL_PERMISSION_MASK = PERMISSION_MASK.CRUDA;
