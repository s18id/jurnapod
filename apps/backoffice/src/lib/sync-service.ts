import { ApiError, apiRequest } from "./api-client";
import { db, type OutboxItem } from "./offline-db";

export type SyncResult = {
  success: number;
  failed: number;
  conflicts: number;
};

type SyncResponse = {
  ok: boolean;
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

  static async syncAll(accessToken: string): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: 0, failed: 0, conflicts: 0 };
    }

    this.isSyncing = true;

    try {
      const pending = await db.outbox.where("status").equals("pending").toArray();
      const now = Date.now();
      const readyToSync = pending.filter((item) => {
        if (!item.nextRetryAt) {
          return true;
        }
        return new Date(item.nextRetryAt).getTime() <= now;
      });
      if (readyToSync.length === 0) {
        return { success: 0, failed: 0, conflicts: 0 };
      }

      let success = 0;
      let failed = 0;
      let conflicts = 0;

      for (const item of readyToSync) {
        try {
          await db.outbox.update(item.id, { status: "syncing" });
          const result = await this.syncOne(item, accessToken);
          if (result.ok) {
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
            error instanceof Error ? error.message : "Network error"
          );
        }
      }

      return { success, failed, conflicts };
    } finally {
      this.isSyncing = false;
    }
  }

  private static async syncOne(item: OutboxItem, accessToken: string): Promise<SyncResponse> {
    const endpoint = resolveEndpoint(item.type);
    try {
      await apiRequest(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify(item.payload)
        },
        accessToken
      );
      return { ok: true };
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          return { ok: false, conflict: true, error: error.message };
        }
        if (error.status >= 400 && error.status < 500) {
          return { ok: false, conflict: false, error: error.message };
        }
        return { ok: false, conflict: false, error: error.message };
      }
      return { ok: false, conflict: false, error: "Network error" };
    }
  }

  private static async scheduleRetry(item: OutboxItem, errorMessage: string) {
    const retryCount = item.retryCount + 1;
    if (retryCount >= this.maxRetries) {
      await db.outbox.update(item.id, {
        status: "failed",
        retryCount,
        error: "Max retries reached"
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
}
