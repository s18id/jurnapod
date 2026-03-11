// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import Dexie, { type Table } from "dexie";

export type OutboxItem = {
  id: string;
  type: "journal" | "invoice" | "payment";
  payload: unknown;
  timestamp: Date;
  status: "pending" | "syncing" | "failed";
  retryCount: number;
  nextRetryAt?: Date;
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
  userId: number;
};

export type AlertReadHistory = {
  id: string;
  userId: number;
  type: "journal" | "invoice" | "payment";
  error?: string;
  timestamp: Date;
  readAt: Date;
};

export type AlertReadState = {
  id: string;
  userId: number;
  readAt: Date;
};

class OfflineDatabase extends Dexie {
  outbox!: Table<OutboxItem>;
  masterDataCache!: Table<MasterDataCache>;
  formDrafts!: Table<FormDraft>;
  syncHistory!: Table<SyncHistory>;
  alertReadHistory!: Table<AlertReadHistory>;
  alertReadState!: Table<AlertReadState>;

  constructor() {
    super("jurnapod_backoffice");
    this.version(1).stores({
      outbox: "id, status, timestamp, userId",
      masterDataCache: "type, expiresAt",
      formDrafts: "id, formType, userId",
      syncHistory: "id, timestamp, action"
    });
    this.version(2).stores({
      outbox: "id, status, timestamp, userId",
      masterDataCache: "type, expiresAt",
      formDrafts: "id, formType, userId",
      syncHistory: "id, timestamp, action, userId"
    });
    this.version(3).stores({
      outbox: "id, status, timestamp, userId",
      masterDataCache: "type, expiresAt",
      formDrafts: "id, formType, userId",
      syncHistory: "id, timestamp, action, userId",
      alertReadHistory: "id, userId, readAt"
    });
    this.version(4)
      .stores({
        outbox: "id, status, timestamp, userId",
        masterDataCache: "type, expiresAt",
        formDrafts: "id, formType, userId",
        syncHistory: "id, timestamp, action, userId",
        alertReadHistory: "id, userId, readAt",
        alertReadState: "id, userId, readAt"
      })
      .upgrade(async (tx) => {
        const history = await tx.table("alertReadHistory").toArray() as AlertReadHistory[];

        const latestByUserAndId = new Map<string, AlertReadState>();
        for (const row of history) {
          const key = `${row.userId}:${row.id}`;
          const existing = latestByUserAndId.get(key);

          if (!existing || new Date(row.readAt).getTime() > new Date(existing.readAt).getTime()) {
            latestByUserAndId.set(key, {
              id: row.id,
              userId: row.userId,
              readAt: row.readAt
            });
          }
        }

        if (latestByUserAndId.size > 0) {
          await tx.table("alertReadState").bulkPut([...latestByUserAndId.values()]);
        }
      });
    this.version(5)
      .stores({
        outbox: "id, status, timestamp, userId",
        masterDataCache: "type, expiresAt",
        formDrafts: "id, formType, userId",
        syncHistory: "id, timestamp, action, userId",
        alertReadHistory: "id, userId, readAt",
        alertReadState: "[userId+id], userId, id, readAt"
      })
      .upgrade(async (tx) => {
        const rows = await tx.table("alertReadState").toArray() as AlertReadState[];
        const latest = new Map<string, AlertReadState>();

        for (const row of rows) {
          const key = `${row.userId}:${row.id}`;
          const prev = latest.get(key);
          if (!prev || new Date(row.readAt).getTime() > new Date(prev.readAt).getTime()) {
            latest.set(key, row);
          }
        }

        if (latest.size > 0) {
          await tx.table("alertReadState").bulkPut([...latest.values()]);
        }
      });
  }
}

export const db = new OfflineDatabase();
