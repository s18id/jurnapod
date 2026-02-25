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

  static async getPendingCount(): Promise<number> {
    return db.outbox.where("status").equals("pending").count();
  }

  static async getPendingItems(): Promise<OutboxItem[]> {
    return db.outbox.where("status").equals("pending").toArray();
  }

  static async getAllItems(): Promise<OutboxItem[]> {
    return db.outbox.toArray();
  }

  static async deleteItem(id: string): Promise<void> {
    await db.outbox.delete(id);
  }

  static async updateStatus(id: string, status: OutboxItem["status"], error?: string) {
    await db.outbox.update(id, { status, error });
  }
}
