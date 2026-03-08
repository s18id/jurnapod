// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export type ProductItemType = "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";

export type LocalSaleStatus = "DRAFT" | "COMPLETED" | "VOID" | "REFUND";

export type SaleSyncStatus = "LOCAL_ONLY" | "PENDING" | "SENT" | "FAILED";

export type OrderServiceType = "TAKEAWAY" | "DINE_IN";

export type SourceFlow = "WALK_IN" | "RESERVATION" | "PHONE" | "ONLINE" | "MANUAL";

export type SettlementFlow = "IMMEDIATE" | "DEFERRED" | "SPLIT";

export type OrderStatus = "OPEN" | "READY_TO_PAY" | "COMPLETED" | "CANCELLED";

export type ActiveOrderState = "OPEN" | "CLOSED";

export type OutboxJobType = "SYNC_POS_TX" | "SYNC_POS_ORDER_UPDATE";

export type OutboxJobStatus = "PENDING" | "SENT" | "FAILED";

export type OrderUpdateEventType =
  | "SNAPSHOT_FINALIZED"
  | "ITEM_ADDED"
  | "ITEM_REMOVED"
  | "QTY_CHANGED"
  | "ITEM_CANCELLED"
  | "NOTES_CHANGED"
  | "ORDER_RESUMED"
  | "ORDER_CLOSED";

export type OrderUpdateSyncStatus = "PENDING" | "SENT" | "FAILED";

export type OutletTableStatus = "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";

export type ReservationStatus =
  | "BOOKED"
  | "CONFIRMED"
  | "ARRIVED"
  | "SEATED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export interface ProductCacheRow {
  pk: string;
  company_id: number;
  outlet_id: number;
  item_id: number;
  sku: string | null;
  name: string;
  item_type: ProductItemType;
  item_group_id?: number | null;
  item_group_name?: string | null;
  price_snapshot: number;
  is_active: boolean;
  item_updated_at: string;
  price_updated_at: string;
  data_version: number;
  pulled_at: string;
}

export interface OutletTableRow {
  pk: string;
  table_id: number;
  company_id: number;
  outlet_id: number;
  code: string;
  name: string;
  zone: string | null;
  capacity: number | null;
  status: OutletTableStatus;
  updated_at: string;
}

export interface ReservationRow {
  pk: string;
  reservation_id: number;
  company_id: number;
  outlet_id: number;
  table_id: number | null;
  customer_name: string;
  customer_phone: string | null;
  guest_count: number;
  reservation_at: string;
  duration_minutes: number | null;
  status: ReservationStatus;
  notes: string | null;
  linked_order_id: string | null;
  created_at: string;
  updated_at: string;
  arrived_at: string | null;
  seated_at: string | null;
  cancelled_at: string | null;
}

export interface ActiveOrderRow {
  pk: string;
  order_id: string;
  company_id: number;
  outlet_id: number;
  service_type: OrderServiceType;
  source_flow?: SourceFlow;
  settlement_flow?: SettlementFlow;
  table_id: number | null;
  reservation_id: number | null;
  guest_count: number | null;
  is_finalized: boolean;
  order_status: OrderStatus;
  order_state: ActiveOrderState;
  paid_amount: number;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  updated_at: string;
}

export interface ItemCancellationRow {
  pk: string;
  cancellation_id: string;
  order_id: string;
  item_id: number;
  company_id: number;
  outlet_id: number;
  cancelled_quantity: number;
  reason: string;
  cancelled_by_user_id: number | null;
  cancelled_at: string;
  sync_status: "PENDING" | "SENT" | "FAILED";
  sync_error: string | null;
}

export interface ActiveOrderLineRow {
  pk: string;
  order_id: string;
  company_id: number;
  outlet_id: number;
  item_id: number;
  sku_snapshot: string | null;
  name_snapshot: string;
  item_type_snapshot: ProductItemType;
  unit_price_snapshot: number;
  qty: number;
  discount_amount: number;
  updated_at: string;
}

export interface SyncMetadataRow {
  pk: string;
  company_id: number;
  outlet_id: number;
  last_data_version: number;
  orders_cursor?: number;
  last_pulled_at: string;
  updated_at: string;
}

export interface ActiveOrderUpdateRow {
  pk: string;
  update_id: string;
  order_id: string;
  company_id: number;
  outlet_id: number;
  base_order_updated_at: string | null;
  event_type: OrderUpdateEventType;
  delta_json: string;
  actor_user_id: number | null;
  device_id: string;
  event_at: string;
  created_at: string;
  sync_status: OrderUpdateSyncStatus;
  sync_error: string | null;
}

export interface SyncScopeConfigRow {
  pk: string;
  company_id: number;
  outlet_id: number;
  data_version: number;
  tax_rate: number;
  tax_inclusive: boolean;
  payment_methods: string[];
  updated_at: string;
}

export interface SaleRow {
  sale_id: string;
  client_tx_id?: string;
  company_id: number;
  outlet_id: number;
  cashier_user_id: number;
  service_type?: OrderServiceType;
  source_flow?: SourceFlow;
  settlement_flow?: SettlementFlow;
  table_id?: number | null;
  reservation_id?: number | null;
  guest_count?: number | null;
  order_status?: OrderStatus;
  opened_at?: string;
  closed_at?: string | null;
  notes?: string | null;
  status: LocalSaleStatus;
  sync_status: SaleSyncStatus;
  trx_at: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  paid_total: number;
  change_total: number;
  data_version: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface SaleItemRow {
  line_id: string;
  sale_id: string;
  company_id: number;
  outlet_id: number;
  item_id: number;
  name_snapshot: string;
  sku_snapshot: string | null;
  item_type_snapshot: ProductItemType;
  qty: number;
  unit_price_snapshot: number;
  discount_amount: number;
  line_total: number;
}

export interface PaymentRow {
  payment_id: string;
  sale_id: string;
  company_id: number;
  outlet_id: number;
  method: string;
  amount: number;
  reference_no: string | null;
  paid_at: string;
}

export interface OutboxJobRow {
  job_id: string;
  sale_id: string;
  company_id: number;
  outlet_id: number;
  job_type: OutboxJobType;
  dedupe_key: string;
  payload_json: string;
  status: OutboxJobStatus;
  attempts: number;
  lease_owner_id: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSaleDraftInput {
  company_id: number;
  outlet_id: number;
  cashier_user_id: number;
  service_type?: OrderServiceType;
  table_id?: number | null;
  reservation_id?: number | null;
  guest_count?: number | null;
  order_status?: OrderStatus;
  notes?: string | null;
  opened_at?: string;
}

export interface CreateSaleDraftResult {
  sale_id: string;
  status: "DRAFT";
}

export interface CompleteSaleItemInput {
  item_id: number;
  qty: number;
  discount_amount?: number;
}

export interface CompleteSalePaymentInput {
  method: string;
  amount: number;
  reference_no?: string;
}

export interface CompleteSaleTotalsInput {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  paid_total: number;
  change_total: number;
}

export interface CompleteSaleInput {
  sale_id: string;
  items: CompleteSaleItemInput[];
  payments: CompleteSalePaymentInput[];
  totals: CompleteSaleTotalsInput;
  service_type?: OrderServiceType;
  table_id?: number | null;
  reservation_id?: number | null;
  guest_count?: number | null;
  order_status?: OrderStatus;
  opened_at?: string;
  closed_at?: string | null;
  notes?: string | null;
  trx_at?: string;
}

export interface CompleteSaleResult {
  sale_id: string;
  client_tx_id: string;
  status: "COMPLETED";
  outbox_job_id: string;
}

export interface EnqueueOutboxJobInput {
  sale_id: string;
}

export interface OutboxAttemptToken {
  job_id: string;
  attempt: number;
  lease_token: string | null;
  claimed: boolean;
}

export interface UpdateOutboxStatusInput {
  job_id: string;
  attempt_token: number;
  lease_token?: string | null;
  status: OutboxJobStatus;
  next_attempt_at?: string | null;
  last_error?: string | null;
}

export interface ReserveOutboxAttemptInput {
  job_id: string;
  owner_id: string;
  lease_ms: number;
  now?: () => number;
}

export type OutboxStatusUpdateReason = "APPLIED" | "STALE_ATTEMPT" | "STALE_LEASE" | "ALREADY_SENT";

export interface OutboxStatusUpdateResult {
  applied: boolean;
  reason: OutboxStatusUpdateReason;
  job: OutboxJobRow;
}

export class OfflineStateError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OfflineStateError";
    this.code = code;
  }
}

export class ScopeValidationError extends OfflineStateError {
  constructor(message: string) {
    super("SCOPE_VALIDATION_ERROR", message);
    this.name = "ScopeValidationError";
  }
}

export class RecordNotFoundError extends OfflineStateError {
  constructor(entity: string, id: string) {
    super("RECORD_NOT_FOUND", `${entity} not found: ${id}`);
    this.name = "RecordNotFoundError";
  }
}

export class InvalidSaleTransitionError extends OfflineStateError {
  constructor(saleId: string, fromStatus: LocalSaleStatus, toStatus: LocalSaleStatus) {
    super("INVALID_SALE_TRANSITION", `Sale ${saleId} transition ${fromStatus} -> ${toStatus} is not allowed`);
    this.name = "InvalidSaleTransitionError";
  }
}

export class SaleCompletionInProgressError extends OfflineStateError {
  constructor(saleId: string) {
    super("SALE_COMPLETION_IN_PROGRESS", `Sale completion already in progress: ${saleId}`);
    this.name = "SaleCompletionInProgressError";
  }
}

export class ProductSnapshotNotFoundError extends OfflineStateError {
  constructor(companyId: number, outletId: number, itemId: number) {
    super(
      "PRODUCT_SNAPSHOT_NOT_FOUND",
      `Missing product snapshot company=${companyId} outlet=${outletId} item=${itemId}`
    );
    this.name = "ProductSnapshotNotFoundError";
  }
}

export class SaleTotalsMismatchError extends OfflineStateError {
  readonly field: keyof CompleteSaleTotalsInput;
  readonly expected: number;
  readonly actual: number;

  constructor(field: keyof CompleteSaleTotalsInput, expected: number, actual: number) {
    super("SALE_TOTALS_MISMATCH", `Sale totals mismatch for ${field}: expected=${expected}, actual=${actual}`);
    this.name = "SaleTotalsMismatchError";
    this.field = field;
    this.expected = expected;
    this.actual = actual;
  }
}
