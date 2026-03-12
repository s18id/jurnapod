// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { db, type OutboxItem, type AlertReadHistory, type AlertReadState } from "./offline-db";
import { canDeleteFailedOutboxItem } from "./outbox-guards";

export class OutboxService {
  static async queueTransaction(
    type: OutboxItem["type"],
    payload: OutboxItem["payload"],
    userId: number
  ): Promise<string> {
    const id = crypto.randomUUID();
    await db.outbox.add({
      id,
      type,
      payload,
      timestamp: new Date(),
      status: "pending",
      retryCount: 0,
      userId
    });
    return id;
  }

  static async getPendingCount(userId: number): Promise<number> {
    return db.outbox
      .where("userId")
      .equals(userId)
      .and((item) => item.status === "pending")
      .count();
  }

  static async getFailedCount(userId: number): Promise<number> {
    return db.outbox
      .where("userId")
      .equals(userId)
      .and((item) => item.status === "failed")
      .count();
  }

  static async getFailedItems(userId: number, limit = 10): Promise<OutboxItem[]> {
    const items = await db.outbox
      .where("userId")
      .equals(userId)
      .and((item) => item.status === "failed")
      .toArray();
    return items
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  static async getAllFailedItems(userId: number): Promise<OutboxItem[]> {
    const items = await db.outbox
      .where("userId")
      .equals(userId)
      .and((item) => item.status === "failed")
      .toArray();
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  static async getPendingItems(userId: number): Promise<OutboxItem[]> {
    return db.outbox
      .where("userId")
      .equals(userId)
      .and((item) => item.status === "pending")
      .toArray();
  }

  static async getAllItems(userId: number): Promise<OutboxItem[]> {
    return db.outbox.where("userId").equals(userId).toArray();
  }

  static async deleteItem(id: string, userId: number): Promise<void> {
    const item = await db.outbox.get(id);
    if (!item || item.userId !== userId) {
      return;
    }
    await Promise.all([
      db.outbox.delete(id),
      db.alertReadState.delete([userId, id] as [number, string])
    ]);
  }

  static async deleteFailedItem(id: string, userId: number): Promise<boolean> {
    const item = await db.outbox.get(id);
    if (!canDeleteFailedOutboxItem(item, userId)) {
      return false;
    }
    await Promise.all([
      db.outbox.delete(id),
      db.alertReadState.delete([userId, id] as [number, string])
    ]);
    return true;
  }

  static async updateStatus(
    id: string,
    userId: number,
    status: OutboxItem["status"],
    error?: string
  ) {
    const item = await db.outbox.get(id);
    if (!item || item.userId !== userId) {
      return;
    }
    await db.outbox.update(id, { status, error });
  }

  static async getReadAlerts(userId: number, limit = 20): Promise<AlertReadHistory[]> {
    const items = await db.alertReadHistory.where("userId").equals(userId).toArray();
    return items
      .sort((a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime())
      .slice(0, limit);
  }

  static async getReadStateIds(userId: number): Promise<Set<string>> {
    const items = await db.alertReadState.where("userId").equals(userId).toArray();
    return new Set(items.map((item) => item.id));
  }

  static async upsertReadState(userId: number, itemIds: string[], readAt: Date): Promise<void> {
    const states: AlertReadState[] = itemIds.map((id) => ({
      id,
      userId,
      readAt
    }));
    await db.alertReadState.bulkPut(states);
  }

  static async markAllFailedAsRead(userId: number, maxSave = 20): Promise<number> {
    const [allFailed, readStateIds] = await Promise.all([
      this.getAllFailedItems(userId),
      this.getReadStateIds(userId)
    ]);

    const unreadItems = allFailed.filter((item) => !readStateIds.has(item.id));

    if (unreadItems.length === 0) {
      return 0;
    }

    const readAt = new Date();

    const snapshots: AlertReadHistory[] = unreadItems.map((item) => ({
      id: item.id,
      userId,
      type: item.type,
      error: item.error,
      timestamp: item.timestamp,
      readAt
    }));

    await db.alertReadHistory.bulkPut(snapshots);
    await this.upsertReadState(userId, unreadItems.map((i) => i.id), readAt);

    await this.pruneOldReadAlerts(userId, maxSave);
    await this.pruneReadState(userId);

    return snapshots.length;
  }

  static async pruneOldReadAlerts(userId: number, keepCount = 20): Promise<void> {
    const all = await db.alertReadHistory.where("userId").equals(userId).toArray();
    const sorted = all.sort(
      (a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime()
    );

    if (sorted.length <= keepCount) {
      return;
    }

    const toDelete = sorted.slice(keepCount).map((item) => item.id);
    await db.alertReadHistory.bulkDelete(toDelete);
  }

  static async pruneReadState(userId: number): Promise<void> {
    const [allOutboxItems, readStateRows] = await Promise.all([
      db.outbox.where("userId").equals(userId).toArray(),
      db.alertReadState.where("userId").equals(userId).toArray()
    ]);

    const outboxIdSet = new Set(allOutboxItems.map((item) => item.id));
    const staleRows = readStateRows.filter((row) => !outboxIdSet.has(row.id));

    if (staleRows.length > 0) {
      const staleKeys = staleRows.map((row) => [row.userId, row.id] as [number, string]);
      await db.alertReadState.bulkDelete(staleKeys);
    }
  }

  static async clearReadAlerts(userId: number): Promise<void> {
    await Promise.all([
      db.alertReadHistory.where("userId").equals(userId).delete(),
      db.alertReadState.where("userId").equals(userId).delete()
    ]);
  }
}
