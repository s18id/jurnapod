// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ApiError, apiRequest } from "./api-client";
import { db, type OutboxItem } from "./offline-db";
import { ERROR_MESSAGES } from "./error-messages";

export type SyncResult = {
  success: number;
  failed: number;
  conflicts: number;
};

type SyncResponse = {
  success: boolean;
  conflict?: boolean;
  error?: string;
};

function resolveEndpoint(type: OutboxItem["type"]): string {
  switch (type) {
    case "journal":
      return "/journals";
    case "invoice":
      return "/sales/invoices";
    case "payment":
      return "/sales/payments";
    default:
      return "/journals";
  }
}

export class SyncService {
  private static isSyncing = false;
  private static maxRetries = 3;
  private static syncingTimeoutMs = 10 * 60 * 1000;

  static async syncAll(accessToken: string): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: 0, failed: 0, conflicts: 0 };
    }

    this.isSyncing = true;

    try {
      const [pending, syncing] = await Promise.all([
        db.outbox.where("status").equals("pending").toArray(),
        db.outbox.where("status").equals("syncing").toArray()
      ]);
      const now = Date.now();
      const readyToSync = pending.filter((item) => {
        if (!item.nextRetryAt) {
          return true;
        }
        return new Date(item.nextRetryAt).getTime() <= now;
      });

      const staleSyncing = syncing.filter((item) => {
        if (item.nextRetryAt) {
          return new Date(item.nextRetryAt).getTime() <= now;
        }
        return new Date(item.timestamp).getTime() + this.syncingTimeoutMs <= now;
      });
      readyToSync.push(...staleSyncing);
      if (readyToSync.length === 0) {
        return { success: 0, failed: 0, conflicts: 0 };
      }

      let success = 0;
      let failed = 0;
      let conflicts = 0;

      for (const item of readyToSync) {
        try {
          await db.outbox.update(item.id, {
            status: "syncing",
            nextRetryAt: new Date(Date.now() + this.syncingTimeoutMs)
          });
          const result = await this.syncOne(item, accessToken);
          if (result.success) {
            await db.outbox.delete(item.id);
            success += 1;
          } else if (result.conflict) {
            await db.outbox.update(item.id, {
              status: "failed",
              error: result.error ?? "Conflict - needs review"
            });
            conflicts += 1;
          } else {
            await this.scheduleRetry(item, result.error ?? "Sync failed");
            failed += 1;
          }
        } catch (error) {
          await this.scheduleRetry(
            item,
            error instanceof Error ? error.message : ERROR_MESSAGES.NETWORK_ERROR
          );
        }
      }

      const result = { success, failed, conflicts };
      await this.writeSyncHistory(result);
      return result;
    } finally {
      this.isSyncing = false;
    }
  }

  private static async syncOne(item: OutboxItem, accessToken: string): Promise<SyncResponse> {
    const endpoint = resolveEndpoint(item.type);
    try {
      const payload = this.buildPayload(item);
      await apiRequest(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        accessToken
      );
      return { success: true };
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          if (this.isDuplicateConflict(error)) {
            return { success: true };
          }
          return { success: false, conflict: true, error: ERROR_MESSAGES.CONFLICT };
        }
        if (error.status >= 400 && error.status < 500) {
          return { success: false, conflict: false, error: ERROR_MESSAGES.VALIDATION_ERROR };
        }
        return { success: false, conflict: false, error: ERROR_MESSAGES.SERVER_ERROR };
      }
      return { success: false, conflict: false, error: ERROR_MESSAGES.NETWORK_ERROR };
    }
  }

  private static async scheduleRetry(item: OutboxItem, errorMessage: string) {
    const retryCount = item.retryCount + 1;
    if (retryCount >= this.maxRetries) {
      await db.outbox.update(item.id, {
        status: "failed",
        retryCount,
        error: ERROR_MESSAGES.MAX_RETRIES
      });
      return;
    }

    const backoffMs = Math.min(30000, 1000 * 2 ** (retryCount - 1));
    await db.outbox.update(item.id, {
      status: "pending",
      retryCount,
      error: errorMessage,
      nextRetryAt: new Date(Date.now() + backoffMs)
    });
  }

  private static buildPayload(item: OutboxItem): unknown {
    if (item.payload && typeof item.payload === "object") {
      return { ...(item.payload as Record<string, unknown>), client_ref: item.id };
    }

    return item.payload;
  }

  private static isDuplicateConflict(error: ApiError): boolean {
    const normalizedCode = error.code.toLowerCase();
    const normalizedMessage = error.message.toLowerCase();

    if (["duplicate", "already_exists", "idempotent"].includes(normalizedCode)) {
      return true;
    }

    return normalizedMessage.includes("duplicate") || normalizedMessage.includes("already exists");
  }

  private static async writeSyncHistory(result: SyncResult): Promise<void> {
    const total = result.success + result.failed + result.conflicts;
    if (total === 0) {
      return;
    }

    const action = result.failed > 0 || result.conflicts > 0 ? "sync_failed" : "sync_success";
    const details = `Synced ${result.success}, conflicts ${result.conflicts}, failed ${result.failed}.`;

    try {
      await db.syncHistory.add({
        id: crypto.randomUUID(),
        action,
        timestamp: new Date(),
        itemCount: total,
        details
      });
    } catch {
      return;
    }
  }
}
