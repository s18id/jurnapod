// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export type WebSocketEventType = 
  // Transaction events
  | "transaction:created"
  | "transaction:updated"
  | "transaction:voided"
  | "transaction:refunded"
  // Payment events
  | "payment:completed"
  | "payment:failed"
  | "payment:refunded"
  // Order events
  | "order:created"
  | "order:updated"
  | "order:completed"
  | "order:cancelled"
  // Table events
  | "table:occupied"
  | "table:released"
  | "table:reserved"
  // Export events (from Phase 3C)
  | "export:completed"
  | "export:failed"
  // System events
  | "sync:status"
  | "alert:new"
  | "heartbeat";

export interface BaseWebSocketEvent {
  type: WebSocketEventType;
  timestamp: number;
  companyId: number;
  outletId?: number;
}

export interface TransactionCreatedEvent extends BaseWebSocketEvent {
  type: "transaction:created";
  data: {
    transactionId: number;
    clientTxId: string;
    outletId: number;
    outletName: string;
    cashierUserId: number;
    cashierName: string;
    totalAmount: number;
    status: "COMPLETED" | "VOID" | "REFUND";
    trxAt: string;
  };
}

export interface TransactionUpdatedEvent extends BaseWebSocketEvent {
  type: "transaction:updated";
  data: {
    transactionId: number;
    clientTxId: string;
    changes: Record<string, any>;
  };
}

export interface TransactionVoidedEvent extends BaseWebSocketEvent {
  type: "transaction:voided";
  data: {
    transactionId: number;
    clientTxId: string;
    reason?: string;
  };
}

export interface TransactionRefundedEvent extends BaseWebSocketEvent {
  type: "transaction:refunded";
  data: {
    transactionId: number;
    clientTxId: string;
    refundAmount: number;
    reason?: string;
  };
}

export interface PaymentCompletedEvent extends BaseWebSocketEvent {
  type: "payment:completed";
  data: {
    transactionId: number;
    paymentId: number;
    amount: number;
    method: string;
    reference?: string;
  };
}

export interface PaymentFailedEvent extends BaseWebSocketEvent {
  type: "payment:failed";
  data: {
    transactionId: number;
    paymentId: number;
    amount: number;
    method: string;
    error: string;
  };
}

export interface PaymentRefundedEvent extends BaseWebSocketEvent {
  type: "payment:refunded";
  data: {
    transactionId: number;
    paymentId: number;
    refundId: number;
    amount: number;
  };
}

export interface OrderCreatedEvent extends BaseWebSocketEvent {
  type: "order:created";
  data: {
    orderId: number;
    outletId: number;
    tableId?: number;
    guestCount?: number;
    serviceType: "DINE_IN" | "TAKEAWAY";
  };
}

export interface OrderUpdatedEvent extends BaseWebSocketEvent {
  type: "order:updated";
  data: {
    orderId: number;
    changes: Record<string, any>;
  };
}

export interface OrderCompletedEvent extends BaseWebSocketEvent {
  type: "order:completed";
  data: {
    orderId: number;
    transactionId?: number;
  };
}

export interface OrderCancelledEvent extends BaseWebSocketEvent {
  type: "order:cancelled";
  data: {
    orderId: number;
    reason?: string;
  };
}

export interface TableOccupiedEvent extends BaseWebSocketEvent {
  type: "table:occupied";
  data: {
    tableId: number;
    tableName: string;
    orderId?: number;
    guestCount: number;
  };
}

export interface TableReleasedEvent extends BaseWebSocketEvent {
  type: "table:released";
  data: {
    tableId: number;
    tableName: string;
    duration?: number;
  };
}

export interface TableReservedEvent extends BaseWebSocketEvent {
  type: "table:reserved";
  data: {
    tableId: number;
    tableName: string;
    reservationId: number;
    customerName: string;
    guestCount: number;
    reservationAt: string;
  };
}

export interface ExportCompletedEvent extends BaseWebSocketEvent {
  type: "export:completed";
  data: {
    exportId: number;
    exportName: string;
    fileName: string;
    fileSize: number;
    recipientCount: number;
  };
}

export interface ExportFailedEvent extends BaseWebSocketEvent {
  type: "export:failed";
  data: {
    exportId: number;
    exportName: string;
    error: string;
  };
}

export interface SyncStatusEvent extends BaseWebSocketEvent {
  type: "sync:status";
  data: {
    module: "POS" | "BACKOFFICE";
    status: "OK" | "ERROR" | "STALE";
    lastSyncAt?: string;
    message?: string;
  };
}

export interface AlertNewEvent extends BaseWebSocketEvent {
  type: "alert:new";
  data: {
    alertId: number;
    severity: "INFO" | "WARNING" | "CRITICAL";
    title: string;
    message: string;
    entityType?: string;
    entityId?: number;
  };
}

export interface HeartbeatEvent extends BaseWebSocketEvent {
  type: "heartbeat";
  data: {
    serverTime: number;
  };
}

export type WebSocketEvent = 
  | TransactionCreatedEvent
  | TransactionUpdatedEvent
  | TransactionVoidedEvent
  | TransactionRefundedEvent
  | PaymentCompletedEvent
  | PaymentFailedEvent
  | PaymentRefundedEvent
  | OrderCreatedEvent
  | OrderUpdatedEvent
  | OrderCompletedEvent
  | OrderCancelledEvent
  | TableOccupiedEvent
  | TableReleasedEvent
  | TableReservedEvent
  | ExportCompletedEvent
  | ExportFailedEvent
  | SyncStatusEvent
  | AlertNewEvent
  | HeartbeatEvent;

export interface WebSocketEventPayload {
  type: WebSocketEventType;
  companyId: number;
  outletId?: number;
  data: any;
}
