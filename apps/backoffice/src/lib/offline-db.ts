import Dexie, { type Table } from "dexie";

export type OutboxItem = {
  id: string;
  type: "journal" | "invoice" | "payment";
  payload: unknown;
  timestamp: Date;
  status: "pending" | "syncing" | "failed";
  retryCount: number;
  error?: string;
  userId: number;
};

export type MasterDataCache = {
  type: string;
  data: unknown[];
  lastSync: Date;
  expiresAt: Date;
  version: number;
};

export type FormDraft = {
  id: string;
  formType: "journal" | "invoice" | "payment";
  data: unknown;
  savedAt: Date;
  userId: number;
};

export type SyncHistory = {
  id: string;
  action: "sync_success" | "sync_failed" | "manual_sync";
  timestamp: Date;
  itemCount: number;
  details: string;
};

class OfflineDatabase extends Dexie {
  outbox!: Table<OutboxItem>;
  masterDataCache!: Table<MasterDataCache>;
  formDrafts!: Table<FormDraft>;
  syncHistory!: Table<SyncHistory>;

  constructor() {
    super("jurnapod_backoffice");
    this.version(1).stores({
      outbox: "id, status, timestamp, userId",
      masterDataCache: "type, expiresAt",
      formDrafts: "id, formType, userId",
      syncHistory: "id, timestamp, action"
    });
  }
}

export const db = new OfflineDatabase();
