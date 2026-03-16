// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getWebSocketManager } from "@jurnapod/api/src/lib/websocket/index.js";
import { createEventPayload } from "@jurnapod/sync-core";

export class BackofficeEventPublisher {
  private wsManager = getWebSocketManager();

  publishTransactionCreated(data: {
    transactionId: number;
    clientTxId: string;
    companyId: number;
    outletId: number;
    outletName: string;
    cashierUserId: number;
    cashierName: string;
    totalAmount: number;
    status: "COMPLETED" | "VOID" | "REFUND";
    trxAt: string;
  }): void {
    if (!this.wsManager) {
      console.warn("WebSocket manager not available, skipping event publish");
      return;
    }

    const event = createEventPayload("transaction:created", data.companyId, data, data.outletId);
    this.wsManager.broadcastToCompany(data.companyId, event);
  }

  publishExportCompleted(data: {
    exportId: number;
    companyId: number;
    exportName: string;
    fileName: string;
    fileSize: number;
    recipientCount: number;
  }): void {
    if (!this.wsManager) {
      console.warn("WebSocket manager not available, skipping event publish");
      return;
    }

    const event = createEventPayload("export:completed", data.companyId, data);
    this.wsManager.broadcastToCompany(data.companyId, event);
  }

  publishExportFailed(data: {
    exportId: number;
    companyId: number;
    exportName: string;
    error: string;
  }): void {
    if (!this.wsManager) {
      console.warn("WebSocket manager not available, skipping event publish");
      return;
    }

    const event = createEventPayload("export:failed", data.companyId, data);
    this.wsManager.broadcastToCompany(data.companyId, event);
  }

  publishSyncStatus(data: {
    companyId: number;
    status: "OK" | "ERROR" | "STALE";
    lastSyncAt?: string;
    message?: string;
  }): void {
    if (!this.wsManager) {
      return;
    }

    const event = createEventPayload("sync:status", data.companyId, {
      module: "BACKOFFICE",
      ...data,
    });
    this.wsManager.broadcastToCompany(data.companyId, event);
  }

  publishAlert(data: {
    alertId: number;
    companyId: number;
    severity: "INFO" | "WARNING" | "CRITICAL";
    title: string;
    message: string;
    entityType?: string;
    entityId?: number;
  }): void {
    if (!this.wsManager) {
      return;
    }

    const event = createEventPayload("alert:new", data.companyId, data);
    this.wsManager.broadcastToCompany(data.companyId, event);
  }
}

let eventPublisherInstance: BackofficeEventPublisher | null = null;

export function getBackofficeEventPublisher(): BackofficeEventPublisher {
  if (!eventPublisherInstance) {
    eventPublisherInstance = new BackofficeEventPublisher();
  }
  return eventPublisherInstance;
}
