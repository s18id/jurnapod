// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { WebSocketEvent, WebSocketEventPayload, WebSocketEventType } from "./types.js";

export interface EventPublisher {
  publish(event: WebSocketEvent): void;
  publishToRoom(room: string, event: WebSocketEvent): void;
  publishToCompany(companyId: number, event: WebSocketEvent): void;
}

export interface EventSubscriber {
  subscribe(eventType: WebSocketEventType, handler: (event: WebSocketEvent) => void): void;
  unsubscribe(eventType: WebSocketEventType, handler: (event: WebSocketEvent) => void): void;
}

export function createEventPayload(
  type: WebSocketEventType,
  companyId: number,
  data: any,
  outletId?: number
): WebSocketEvent {
  return {
    type,
    timestamp: Date.now(),
    companyId,
    outletId,
    data,
  } as WebSocketEvent;
}

export function isWebSocketEventType(type: string): type is WebSocketEventType {
  const validTypes = [
    "transaction:created",
    "transaction:updated",
    "transaction:voided",
    "transaction:refunded",
    "payment:completed",
    "payment:failed",
    "payment:refunded",
    "order:created",
    "order:updated",
    "order:completed",
    "order:cancelled",
    "table:occupied",
    "table:released",
    "table:reserved",
    "export:completed",
    "export:failed",
    "sync:status",
    "alert:new",
    "heartbeat",
  ];
  return validTypes.includes(type);
}
