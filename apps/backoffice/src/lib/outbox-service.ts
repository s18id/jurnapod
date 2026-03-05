// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { db, type OutboxItem } from "./offline-db";

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
    await db.outbox.delete(id);
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
}
