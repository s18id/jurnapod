// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Table Sync - Thin API Adapter
 *
 * Delegates to @jurnapod/modules-reservations for core sync logic.
 * This file provides API-level integration and type re-exports.
 */

import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import type {
  TableSyncPushRequest,
} from '@jurnapod/shared';

// Re-export types from the reservations module
export type {
  PushTableEventsParams,
  PushTableEventResult,
  PushTableEventsResult,
  PullTableStateParams,
  PullTableStateSnapshot,
  PullTableStateEvent,
  PullTableStateResult,
} from '@jurnapod/modules-reservations';

// Re-export error classes from the reservations module
export {
  TableSyncValidationError,
  TableSyncConflictError,
  TableSyncNotFoundError,
} from '@jurnapod/modules-reservations';

// Import service functions from the reservations module
import {
  pushTableEvents as pushTableEventsModule,
  pullTableState as pullTableStateModule,
  type ISettingsResolver,
} from '@jurnapod/modules-reservations';

// ============================================================================
// API ADAPTER FUNCTIONS
// ============================================================================

/**
 * Settings resolver implementation for the reservations module
 */
class ApiSettingsResolver implements ISettingsResolver {
  async getSetting(companyId: number, key: string): Promise<{ value: string | null } | null> {
    const setting = await getSetting({
      companyId,
      key,
      outletId: null
    });
    if (!setting || setting.value === null || setting.value === undefined) {
      return null;
    }
    // Convert non-string values to string representation
    const stringValue = typeof setting.value === 'string' 
      ? setting.value 
      : String(setting.value);
    return { value: stringValue };
  }
}

const settingsResolver = new ApiSettingsResolver();

/**
 * Push table events from POS to API
 * 
 * This function processes events from offline POS devices and applies them
 * to the server's table state.
 */
export async function pushTableEvents(
  params: {
    companyId: number;
    outletId: number;
    events: TableSyncPushRequest['events'];
    actorId: number;
  }
) {
  const db = getDb();
  return pushTableEventsModule(db, params, settingsResolver);
}

/**
 * Pull table state from API to POS
 *
 * This function retrieves current table state and incremental events
 * for POS devices to sync down.
 */
export async function pullTableState(
  params: {
    companyId: number;
    outletId: number;
    cursor?: string;
    limit?: number;
  }
) {
  const db = getDb();
  return pullTableStateModule(db, params);
}