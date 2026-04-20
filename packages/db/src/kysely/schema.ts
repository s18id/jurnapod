import type { ColumnType } from "kysely";

export type Decimal = ColumnType<string, number | string, number | string>;

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export interface AccountBalancesCurrent {
  account_id: number;
  as_of_date: Date;
  balance: Generated<Decimal>;
  company_id: number;
  created_at: Generated<Date>;
  credit_total: Generated<Decimal>;
  debit_total: Generated<Decimal>;
  id: Generated<number>;
  updated_at: Generated<Date>;
}

export interface AccountMappings {
  account_id: number;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  mapping_key: string;
  mapping_type_id: number;
  outlet_id: Generated<number | null>;
  updated_at: Generated<Date>;
}

export interface AccountMappingTypes {
  code: string;
  created_at: Generated<Date>;
  id: number;
  updated_at: Generated<Date>;
}

export interface Accounts {
  account_type_id: Generated<number | null>;
  code: string;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  is_active: Generated<number>;
  is_group: Generated<number>;
  is_payable: Generated<number>;
  name: string;
  normal_balance: Generated<string | null>;
  parent_account_id: Generated<number | null>;
  report_group: Generated<string | null>;
  type_name: Generated<string | null>;
  updated_at: Generated<Date>;
}

export interface AccountTypes {
  category: Generated<string | null>;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  is_active: Generated<number>;
  name: string;
  normal_balance: Generated<string | null>;
  report_group: Generated<string | null>;
  updated_at: Generated<Date>;
}

export interface AnalyticsInsights {
  calculated_at: Generated<Date>;
  company_id: number;
  description: string;
  expires_at: Date;
  id: Generated<number>;
  insight_type: "ANOMALY" | "PEAK_HOURS" | "SEASONALITY" | "TOP_PRODUCTS" | "TREND" | "UNDERPERFORMING";
  metric_name: string;
  metric_value: Decimal;
  outlet_id: Generated<number | null>;
  recommendation: Generated<string | null>;
  reference_period: string;
  severity: Generated<"CRITICAL" | "INFO" | "WARNING">;
}

export interface ApExceptions {
  assigned_at: Generated<Date | null>;
  assigned_to_user_id: Generated<number | null>;
  company_id: number;
  created_at: Generated<Date>;
  currency_code: Generated<string | null>;
  detected_at: Date;
  due_date: Generated<Date | null>;
  exception_key: string;
  id: Generated<number>;
  resolution_note: Generated<string | null>;
  resolved_at: Generated<Date | null>;
  resolved_by_user_id: Generated<number | null>;
  source_id: number;
  source_type: string;
  status: Generated<number>;
  supplier_id: Generated<number | null>;
  type: number;
  updated_at: Generated<Date>;
  variance_amount: Generated<Decimal | null>;
}

export interface ApPaymentLines {
  ap_payment_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  line_no: number;
  purchase_invoice_id: number;
  allocation_amount: Decimal;
  description: Generated<string | null>;
  updated_at: Generated<Date>;
}

export interface ApPayments {
  bank_account_id: number;
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  description: Generated<string | null>;
  id: Generated<number>;
  journal_batch_id: Generated<number | null>;
  payment_date: Date;
  payment_no: string;
  posted_at: Generated<Date | null>;
  posted_by_user_id: Generated<number | null>;
  status: Generated<number>;
  supplier_id: number;
  updated_at: Generated<Date>;
  voided_at: Generated<Date | null>;
  voided_by_user_id: Generated<number | null>;
}

export interface ArchiveSyncDataVersions {
  archived_at: Generated<Date | null>;
  company_id: number;
  current_version: Generated<number | null>;
  updated_at: Generated<Date | null>;
}

export interface ArchiveSyncOperations {
  archived_at: Generated<Date | null>;
  company_id: number;
  completed_at: Generated<Date | null>;
  created_at: Generated<Date | null>;
  data_version_after: Generated<number | null>;
  data_version_before: Generated<number | null>;
  duration_ms: Generated<number | null>;
  error_message: Generated<string | null>;
  id: number;
  operation_type: "BATCH" | "PULL" | "PUSH" | "RECONCILE";
  outlet_id: Generated<number | null>;
  records_processed: Generated<number | null>;
  request_id: string;
  result_summary: Generated<string | null>;
  started_at: Date;
  status: "CANCELLED" | "FAILED" | "RUNNING" | "SUCCESS";
  sync_module: "BACKOFFICE" | "POS";
  tier: "ADMIN" | "ANALYTICS" | "MASTER" | "OPERATIONAL" | "REALTIME";
}

export interface ArchiveSyncTierVersions {
  archived_at: Generated<Date | null>;
  company_id: number;
  current_version: Generated<number | null>;
  last_updated_at: Generated<Date | null>;
  tier: "ADMIN" | "ANALYTICS" | "MASTER" | "OPERATIONAL" | "REALTIME";
}

export interface ArchiveUserOutlets {
  archived_at: Generated<Date | null>;
  created_at: Generated<Date | null>;
  outlet_id: number;
  user_id: number;
}

export interface AssetDepreciationPlans {
  accum_depr_account_id: number;
  asset_id: number;
  company_id: number;
  created_at: Generated<Date>;
  expense_account_id: number;
  id: Generated<number>;
  method: Generated<string>;
  outlet_id: Generated<number | null>;
  purchase_cost_snapshot: Decimal;
  salvage_value: Generated<Decimal>;
  start_date: Date;
  status: Generated<string>;
  updated_at: Generated<Date>;
  useful_life_months: number;
}

export interface AssetDepreciationRuns {
  amount: Decimal;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  journal_batch_id: Generated<number | null>;
  period_month: number;
  period_year: number;
  plan_id: number;
  run_date: Date;
  status: Generated<string>;
  updated_at: Generated<Date>;
}

export interface AuditLogs {
  action: string;
  changes_json: Generated<string | null>;
  company_id: Generated<number | null>;
  created_at: Generated<Date>;
  entity_id: Generated<string | null>;
  entity_type: Generated<string | null>;
  id: Generated<number>;
  ip_address: Generated<string | null>;
  outlet_id: Generated<number | null>;
  payload_json: string;
  result: string;
  status: Generated<number>;
  success: Generated<number>;
  user_agent: Generated<string | null>;
  user_id: Generated<number | null>;
}

export interface AuthLoginThrottles {
  created_at: Generated<Date>;
  failure_count: Generated<number>;
  id: Generated<number>;
  key_hash: string;
  last_failed_at: Generated<Date | null>;
  last_ip: Generated<string | null>;
  last_user_agent: Generated<string | null>;
  updated_at: Generated<Date>;
}

export interface AuthOauthAccounts {
  company_id: number;
  created_at: Generated<Date>;
  email_snapshot: string;
  id: Generated<number>;
  provider: string;
  provider_user_id: string;
  user_id: number;
}

export interface AuthPasswordResetThrottles {
  created_at: Generated<Date>;
  id: Generated<number>;
  key_hash: string;
  last_ip: Generated<string | null>;
  last_user_agent: Generated<string | null>;
  request_count: Generated<number>;
  updated_at: Generated<Date>;
  window_started_at: Date;
}

export interface AuthRefreshTokens {
  company_id: number;
  created_at: Generated<Date>;
  expires_at: Date;
  id: Generated<number>;
  ip_address: Generated<string | null>;
  revoked_at: Generated<Date | null>;
  rotated_from_id: Generated<number | null>;
  token_hash: string;
  user_agent: Generated<string | null>;
  user_id: number;
}

export interface AuthThrottles {
  created_at: Generated<Date | null>;
  failure_count: Generated<number | null>;
  id: Generated<number>;
  key_hash: string;
  last_failed_at: Generated<Date | null>;
  last_ip: Generated<string | null>;
  last_succeeded_at: Generated<Date | null>;
  last_user_agent: Generated<string | null>;
  locked_until: Generated<Date | null>;
  request_count: Generated<number | null>;
  throttle_type: "login" | "password_reset";
  updated_at: Generated<Date | null>;
}

export interface BackofficeSyncQueue {
  company_id: number;
  created_at: Generated<Date>;
  document_id: number;
  document_type: "FORECAST_GENERATION" | "INSIGHTS_CALCULATION" | "INVOICE" | "JOURNAL" | "PAYMENT" | "RECONCILIATION" | "REPORT" | "SCHEDULED_EXPORT";
  error_message: Generated<string | null>;
  id: Generated<number>;
  max_retries: Generated<number>;
  payload_hash: Generated<string | null>;
  processed_at: Generated<Date | null>;
  processing_started_at: Generated<Date | null>;
  retry_count: Generated<number>;
  scheduled_at: Generated<Date>;
  sync_status: Generated<"FAILED" | "PENDING" | "PROCESSING" | "SUCCESS">;
  tier: "ADMIN" | "ANALYTICS" | "MASTER" | "OPERATIONAL";
  updated_at: Generated<Date>;
}

export interface CashBankTransactions {
  amount: Decimal;
  base_amount: Generated<Decimal | null>;
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  currency_code: Generated<string>;
  description: string;
  destination_account_id: number;
  exchange_rate: Generated<Decimal | null>;
  fx_account_id: Generated<number | null>;
  fx_gain_loss: Generated<Decimal | null>;
  id: Generated<number>;
  outlet_id: Generated<number | null>;
  posted_at: Generated<Date | null>;
  reference: Generated<string | null>;
  source_account_id: number;
  status: Generated<"DRAFT" | "POSTED" | "VOID">;
  transaction_date: Date;
  transaction_type: "FOREX" | "MUTATION" | "TOP_UP" | "WITHDRAWAL";
  updated_at: Generated<Date>;
}

export interface Companies {
  address_line1: Generated<string | null>;
  address_line2: Generated<string | null>;
  city: Generated<string | null>;
  code: string;
  created_at: Generated<Date>;
  currency_code: Generated<string | null>;
  deleted_at: Generated<Date | null>;
  email: Generated<string | null>;
  id: Generated<number>;
  legal_name: Generated<string | null>;
  name: string;
  phone: Generated<string | null>;
  postal_code: Generated<string | null>;
  tax_id: Generated<string | null>;
  timezone: Generated<string | null>;
  updated_at: Generated<Date>;
}

export interface CompanyAccountMappings {
  account_id: number;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  mapping_key: string;
  mapping_type_id: Generated<number | null>;
  updated_at: Generated<Date>;
}

export interface CompanyAccountMappingsView {
  account_id: number;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  mapping_key: string;
  mapping_type_id: number;
  outlet_id: Generated<number | null>;
  updated_at: Generated<Date>;
}

export interface CompanyModules {
  company_id: number;
  config_json: string;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  enabled: Generated<number>;
  id: Generated<number>;
  inventory_auto_reorder: Generated<number>;
  inventory_default_asset_account_id: Generated<number | null>;
  inventory_default_cogs_account_id: Generated<number | null>;
  inventory_enabled: Generated<number>;
  inventory_low_stock_threshold: Generated<number>;
  inventory_multi_warehouse: Generated<number>;
  inventory_warehouses: Generated<string | null>;
  module_id: number;
  pos_allow_discount_after_tax: Generated<number>;
  pos_auto_sync: Generated<number>;
  pos_default_payment_method_id: Generated<number | null>;
  pos_enabled: Generated<number>;
  pos_offline_mode: Generated<number>;
  pos_receipt_template: Generated<string>;
  pos_require_auth: Generated<number>;
  pos_sync_interval_seconds: Generated<number>;
  pos_tip_adjustment_enabled: Generated<number>;
  purchasing_approval_workflow: Generated<number>;
  purchasing_credit_limit_enabled: Generated<number>;
  purchasing_default_expense_account_id: Generated<number | null>;
  purchasing_default_tax_rate_id: Generated<number | null>;
  purchasing_enabled: Generated<number>;
  sales_allow_partial_pay: Generated<number>;
  sales_credit_limit_enabled: Generated<number>;
  sales_default_income_account_id: Generated<number | null>;
  sales_default_price_list_id: Generated<number | null>;
  sales_default_tax_rate_id: Generated<number | null>;
  sales_enabled: Generated<number>;
  sales_tax_mode: Generated<"exclusive" | "inclusive" | "mixed">;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
}

export interface CompanyPaymentMethodMappings {
  account_id: number;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  is_invoice_default: Generated<number>;
  label: Generated<string | null>;
  method_code: string;
  updated_at: Generated<Date>;
}

export interface CompanyPaymentMethodMappingsView {
  account_id: number;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  is_invoice_default: Generated<number>;
  label: Generated<string | null>;
  method_code: string;
  outlet_id: Generated<number | null>;
  updated_at: Generated<Date>;
}

export interface CompanyTaxDefaults {
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  tax_rate_id: number;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
}

export interface CostLayerConsumption {
  company_id: number;
  consumed_at: Generated<Date | null>;
  consumed_qty: Decimal;
  id: Generated<number>;
  layer_id: number;
  total_cost: Decimal;
  transaction_id: number;
  unit_cost: Decimal;
}

export interface Customers {
  address_line1: Generated<string | null>;
  address_line2: Generated<string | null>;
  city: Generated<string | null>;
  code: string;
  company_id: number;
  company_name: Generated<string | null>;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  deleted_at: Generated<Date | null>;
  display_name: string;
  email: Generated<string | null>;
  id: Generated<number>;
  is_active: Generated<number>;
  notes: Generated<string | null>;
  phone: Generated<string | null>;
  postal_code: Generated<string | null>;
  tax_id: Generated<string | null>;
  type: Generated<number>;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
}

export interface DataImports {
  accounts_file_name: string;
  allocations_file_name: string;
  company_id: number;
  completion_percentage: Generated<Decimal | null>;
  counts_json: Generated<string | null>;
  created_at: Generated<Date>;
  created_by: Generated<number | null>;
  error_count: Generated<number>;
  error_json: Generated<string | null>;
  file_hash: string;
  id: Generated<number>;
  processed_rows: Generated<number | null>;
  status: string;
  success_count: Generated<number>;
  total_rows: Generated<number>;
  transactions_file_name: string;
  updated_at: Generated<Date>;
  warning_count: Generated<number>;
}

export interface EmailOutbox {
  attachment_path: Generated<string | null>;
  attempts: Generated<number>;
  company_id: number;
  created_at: Generated<Date>;
  error_message: Generated<string | null>;
  html: string;
  id: Generated<number>;
  next_retry_at: Generated<Date | null>;
  sent_at: Generated<Date | null>;
  status: Generated<"FAILED" | "PENDING" | "SENDING" | "SENT">;
  subject: string;
  text: string;
  to_email: string;
  user_id: Generated<number | null>;
}

export interface EmailTokens {
  company_id: number;
  created_at: Generated<Date>;
  created_by: Generated<number | null>;
  email: string;
  expires_at: Date;
  id: Generated<number>;
  token_hash: string;
  type: "INVITE" | "PASSWORD_RESET" | "VERIFY_EMAIL";
  used_at: Generated<Date | null>;
  user_id: number;
}

export interface ExportFiles {
  batch_job_id: Generated<string | null>;
  company_id: number;
  created_at: Generated<Date>;
  download_count: Generated<number>;
  expires_at: Generated<Date | null>;
  file_name: string;
  file_path: string;
  file_size: number;
  id: Generated<number>;
  last_downloaded_at: Generated<Date | null>;
  scheduled_export_id: Generated<number | null>;
  storage_provider: Generated<"LOCAL" | "S3">;
}

export interface FeatureFlags {
  company_id: number;
  config_json: string;
  created_at: Generated<Date>;
  enabled: Generated<number>;
  end_at: Generated<Date | null>;
  id: Generated<number>;
  key: string;
  rollout_percentage: Generated<number>;
  start_at: Generated<Date | null>;
  target_segments: Generated<string | null>;
  updated_at: Generated<Date>;
}

export interface FiscalYearCloseRequests {
  close_request_id: string;
  company_id: number;
  completed_at_ts: Generated<number | null>;
  created_at_ts: number;
  failure_code: Generated<string | null>;
  failure_message: Generated<string | null>;
  fiscal_year_id: number;
  fiscal_year_status_after: string;
  fiscal_year_status_before: string;
  id: Generated<number>;
  requested_at_ts: number;
  requested_by_user_id: number;
  result_json: Generated<string | null>;
  started_at_ts: Generated<number | null>;
  status: Generated<string>;
  updated_at_ts: number;
}

export interface FiscalPeriods {
  closed_at: Generated<Date | null>;
  closed_by_user_id: Generated<number | null>;
  company_id: number;
  created_at: Generated<Date>;
  end_date: Date;
  fiscal_year_id: number;
  id: Generated<number>;
  period_no: number;
  start_date: Date;
  status: Generated<number>;
  updated_at: Generated<Date>;
}

export interface FiscalYears {
  code: string;
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  end_date: Date;
  id: Generated<number>;
  name: string;
  start_date: Date;
  status: Generated<string>;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
}

export interface FixedAssetBooks {
  accum_depreciation: Generated<Decimal>;
  accum_impairment: Generated<Decimal>;
  as_of_date: Date;
  asset_id: number;
  carrying_amount: Generated<Decimal>;
  company_id: number;
  cost_basis: Generated<Decimal>;
  id: Generated<number>;
  last_event_id: number;
  updated_at: Generated<Date>;
}

export interface FixedAssetCategories {
  accum_depr_account_id: Generated<number | null>;
  code: string;
  company_id: number;
  created_at: Generated<Date>;
  depreciation_method: Generated<string>;
  expense_account_id: Generated<number | null>;
  id: Generated<number>;
  is_active: Generated<number>;
  name: string;
  residual_value_pct: Generated<Decimal>;
  updated_at: Generated<Date>;
  useful_life_months: number;
}

export interface FixedAssetDisposals {
  asset_id: number;
  company_id: number;
  cost_removed: Generated<Decimal>;
  created_at: Generated<Date>;
  depr_removed: Generated<Decimal>;
  disposal_cost: Generated<Decimal>;
  disposal_type: string;
  event_id: number;
  gain_loss: Decimal;
  id: Generated<number>;
  impairment_removed: Generated<Decimal>;
  notes: Generated<string | null>;
  proceeds: Generated<Decimal>;
}

export interface FixedAssetEvents {
  asset_id: number;
  company_id: number;
  created_at: Generated<Date>;
  created_by: number;
  event_data: string;
  event_date: Date;
  event_type: string;
  id: Generated<number>;
  idempotency_key: string;
  journal_batch_id: Generated<number | null>;
  outlet_id: Generated<number | null>;
  status: Generated<string>;
  voided_at: Generated<Date | null>;
  voided_by: Generated<number | null>;
}

export interface FixedAssets {
  asset_tag: Generated<string | null>;
  category_id: Generated<number | null>;
  company_id: number;
  created_at: Generated<Date>;
  disposed_at: Generated<Date | null>;
  id: Generated<number>;
  is_active: Generated<number>;
  name: string;
  outlet_id: Generated<number | null>;
  purchase_cost: Generated<Decimal | null>;
  purchase_date: Generated<Date | null>;
  serial_number: Generated<string | null>;
  updated_at: Generated<Date>;
}

export interface ImportSessions {
  checkpoint_data: Generated<string | null>;
  company_id: number;
  created_at: Generated<Date>;
  entity_type: string;
  expires_at: Date;
  file_hash: Generated<string | null>;
  payload: string;
  session_id: string;
}

export interface InventoryCostLayers {
  acquired_at: Date;
  company_id: number;
  created_at: Generated<Date | null>;
  id: Generated<number>;
  item_id: number;
  original_qty: Decimal;
  remaining_qty: Decimal;
  transaction_id: number;
  unit_cost: Decimal;
}

export interface InventoryItemCosts {
  company_id: number;
  costing_method: Generated<string>;
  current_avg_cost: Generated<Decimal | null>;
  item_id: number;
  total_layers_cost: Generated<Decimal | null>;
  total_layers_qty: Generated<Decimal | null>;
  updated_at: Generated<Date | null>;
}

export interface InventoryStock {
  available_quantity: Generated<Decimal>;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  outlet_id: Generated<number | null>;
  outlet_id_is_null: Generated<number | null>;
  product_id: number;
  quantity: Generated<Decimal>;
  reserved_quantity: Generated<Decimal>;
  updated_at: Generated<Date>;
  variant_id: Generated<number | null>;
}

export interface InventoryTransactions {
  company_id: number;
  created_at: Generated<Date>;
  created_by: Generated<number | null>;
  id: Generated<number>;
  journal_batch_id: Generated<number | null>;
  notes: Generated<string | null>;
  outlet_id: Generated<number | null>;
  product_id: Generated<number | null>;
  quantity_delta: Decimal;
  reference_id: Generated<string | null>;
  reference_type: Generated<string | null>;
  transaction_type: number;
  variant_id: Generated<number | null>;
}

export interface ItemGroups {
  code: Generated<string | null>;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  is_active: Generated<number>;
  name: string;
  parent_id: Generated<number | null>;
  updated_at: Generated<Date>;
}

export interface ItemImages {
  company_id: number;
  created_at: Generated<Date | null>;
  file_name: string;
  file_size_bytes: number;
  height_pixels: Generated<number | null>;
  id: Generated<number>;
  is_primary: Generated<number | null>;
  item_id: number;
  large_url: Generated<string | null>;
  medium_url: Generated<string | null>;
  mime_type: string;
  original_url: string;
  sort_order: Generated<number | null>;
  thumbnail_url: Generated<string | null>;
  updated_at: Generated<Date | null>;
  uploaded_by: number;
  variant_id: Generated<number | null>;
  width_pixels: Generated<number | null>;
}

export interface ItemPrices {
  company_id: number;
  created_at: Generated<Date>;
  effective_from: Generated<number>;
  effective_to: Generated<number>;
  id: Generated<number>;
  is_active: Generated<number>;
  item_id: number;
  outlet_id: Generated<number | null>;
  price: Decimal;
  scope_key: Generated<string | null>;
  updated_at: Generated<Date>;
  variant_id: Generated<number | null>;
}

export interface Items {
  barcode: Generated<string | null>;
  barcode_type: Generated<"CODE128" | "CUSTOM" | "EAN13" | "UPCA" | null>;
  cogs_account_id: Generated<number | null>;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  inventory_asset_account_id: Generated<number | null>;
  is_active: Generated<number>;
  item_group_id: Generated<number | null>;
  item_type: string;
  low_stock_threshold: Generated<Decimal | null>;
  name: string;
  sku: Generated<string | null>;
  track_stock: Generated<number>;
  updated_at: Generated<Date>;
}

export interface ItemVariantAttributes {
  attribute_name: string;
  company_id: number;
  created_at: Generated<Date | null>;
  id: Generated<number>;
  item_id: number;
  sort_order: Generated<number | null>;
  updated_at: Generated<Date | null>;
}

export interface ItemVariantAttributeValues {
  attribute_id: number;
  company_id: number;
  created_at: Generated<Date | null>;
  id: Generated<number>;
  sort_order: Generated<number | null>;
  value: string;
}

export interface ItemVariantCombinations {
  attribute_id: number;
  company_id: number;
  id: Generated<number>;
  value_id: number;
  variant_id: number;
}

export interface ItemVariants {
  archived_at: Generated<Date | null>;
  attributes: Generated<string | null>;
  barcode: Generated<string | null>;
  combination_hash: Generated<string | null>;
  company_id: number;
  created_at: Generated<Date | null>;
  id: Generated<number>;
  is_active: Generated<number | null>;
  item_id: number;
  price_override: Generated<Decimal | null>;
  sku: string;
  stock_quantity: Generated<Decimal | null>;
  updated_at: Generated<Date | null>;
  variant_name: string;
}

export interface JournalBatches {
  client_ref: Generated<string | null>;
  company_id: number;
  created_at: Generated<Date>;
  doc_id: number;
  doc_type: string;
  id: Generated<number>;
  outlet_id: Generated<number | null>;
  posted_at: Date;
  updated_at: Generated<Date>;
}

export interface JournalLines {
  account_id: number;
  company_id: number;
  created_at: Generated<Date>;
  credit: Generated<Decimal>;
  debit: Generated<Decimal>;
  description: string;
  id: Generated<number>;
  journal_batch_id: number;
  line_date: Date;
  outlet_id: Generated<number | null>;
  updated_at: Generated<Date>;
}

export interface ModuleRoles {
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  module: string;
  permission_mask: Generated<number>;
  resource: string;
  role_id: number;
  updated_at: Generated<Date>;
}

export interface Modules {
  code: string;
  created_at: Generated<Date>;
  description: Generated<string | null>;
  id: Generated<number>;
  name: string;
  updated_at: Generated<Date>;
}

export interface NumberingTemplates {
  company_id: number;
  created_at: Generated<Date>;
  current_value: Generated<number>;
  doc_type: string;
  id: Generated<number>;
  is_active: Generated<number>;
  last_reset: Generated<Date | null>;
  outlet_id: Generated<number | null>;
  pattern: string;
  reset_period: Generated<string>;
  scope_key: Generated<number>;
  updated_at: Generated<Date>;
}

export interface OperationProgress {
  company_id: number;
  completed_at: Generated<Date | null>;
  completed_units: Generated<number>;
  details: Generated<string | null>;
  id: Generated<number>;
  operation_id: string;
  operation_type: string;
  started_at: Date;
  status: Generated<string>;
  total_units: Generated<number>;
  updated_at: Date;
}

export interface OutletAccountMappings {
  account_id: number;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  mapping_key: string;
  mapping_type_id: Generated<number | null>;
  outlet_id: number;
  updated_at: Generated<Date>;
}

export interface OutletAccountMappingsView {
  account_id: number;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  mapping_key: string;
  mapping_type_id: number;
  outlet_id: Generated<number | null>;
  updated_at: Generated<Date>;
}

export interface OutletPaymentMethodMappings {
  account_id: number;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  is_invoice_default: Generated<number>;
  label: Generated<string | null>;
  method_code: string;
  outlet_id: number;
  updated_at: Generated<Date>;
}

export interface OutletPaymentMethodMappingsView {
  account_id: number;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  is_invoice_default: Generated<number>;
  label: Generated<string | null>;
  method_code: string;
  outlet_id: Generated<number | null>;
  updated_at: Generated<Date>;
}

export interface Outlets {
  address_line1: Generated<string | null>;
  address_line2: Generated<string | null>;
  city: Generated<string | null>;
  code: string;
  company_id: number;
  created_at: Generated<Date>;
  deleted_at: Generated<Date | null>;
  email: Generated<string | null>;
  id: Generated<number>;
  is_active: Generated<number>;
  name: string;
  phone: Generated<string | null>;
  postal_code: Generated<string | null>;
  timezone: Generated<string | null>;
  updated_at: Generated<Date>;
}

export interface OutletTables {
  capacity: Generated<number | null>;
  code: string;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  name: string;
  outlet_id: number;
  status: Generated<string>;
  status_id: number;
  updated_at: Generated<Date>;
  zone: Generated<string | null>;
}

export interface PaymentMethodMappings {
  account_id: number;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  is_invoice_default: Generated<number>;
  label: Generated<string | null>;
  method_code: string;
  outlet_id: Generated<number | null>;
  updated_at: Generated<Date>;
}

export interface PeriodCloseOverrides {
  // FIX(47.5-WP-A2): Period-close override audit trail
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  overridden_at: Generated<Date>;
  period_id: number;
  reason: string;
  transaction_id: number;
  transaction_type: string;
  user_id: number;
}

export interface PlatformSettings {
  created_at: Generated<Date>;
  id: Generated<number>;
  is_sensitive: Generated<number>;
  key: string;
  updated_at: Generated<Date>;
  updated_by: Generated<number | null>;
  value_json: string;
}

export interface PosItemCancellations {
  cancellation_id: string;
  cancelled_at: Date;
  cancelled_at_ts: number;
  cancelled_by_user_id: Generated<number | null>;
  cancelled_quantity: Decimal;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  item_id: number;
  order_id: string;
  outlet_id: number;
  reason: string;
  update_id: Generated<string | null>;
  variant_id: Generated<number | null>;
}

export interface PosOrderSnapshotLines {
  company_id: number;
  created_at: Generated<Date>;
  discount_amount: Generated<Decimal>;
  id: Generated<number>;
  item_id: number;
  item_type_snapshot: string;
  name_snapshot: string;
  order_id: string;
  outlet_id: number;
  qty: Decimal;
  sku_snapshot: Generated<string | null>;
  unit_price_snapshot: Decimal;
  updated_at: Date;
  updated_at_ts: number;
  variant_id: Generated<number | null>;
  variant_id_key: Generated<number | null>;
  variant_name_snapshot: Generated<string | null>;
}

export interface PosOrderSnapshots {
  closed_at: Generated<Date | null>;
  closed_at_ts: Generated<number | null>;
  company_id: number;
  created_at: Generated<Date>;
  guest_count: Generated<number | null>;
  is_finalized: Generated<number>;
  notes: Generated<string | null>;
  opened_at: Date;
  opened_at_ts: number;
  order_id: string;
  order_state: string;
  order_status: string;
  outlet_id: number;
  paid_amount: Generated<Decimal>;
  reservation_id: Generated<number | null>;
  service_type: string;
  settlement_flow: Generated<string | null>;
  source_flow: Generated<string | null>;
  table_id: Generated<number | null>;
  updated_at: Date;
  updated_at_ts: number;
}

export interface PosOrderUpdates {
  actor_user_id: Generated<number | null>;
  base_order_updated_at: Generated<Date | null>;
  base_order_updated_at_ts: Generated<number | null>;
  company_id: number;
  created_at: Generated<Date>;
  delta_json: string;
  device_id: string;
  event_at: Date;
  event_at_ts: number;
  event_type: string;
  order_id: string;
  outlet_id: number;
  sequence_no: Generated<number>;
  update_id: string;
}

export interface PosSyncMetadata {
  company_id: number;
  created_at: Generated<Date>;
  error_message: Generated<string | null>;
  last_sync_at: Generated<Date | null>;
  last_version: Generated<number | null>;
  outlet_id: number;
  sync_frequency_ms: Generated<number | null>;
  sync_status: Generated<"ERROR" | "OK" | "STALE">;
  tier: "ADMIN" | "MASTER" | "OPERATIONAL" | "REALTIME";
  updated_at: Generated<Date>;
}

export interface PosTransactionItems {
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  item_id: number;
  line_no: number;
  name_snapshot: string;
  outlet_id: number;
  pos_transaction_id: number;
  price_snapshot: Decimal;
  qty: Decimal;
  variant_id: Generated<number | null>;
}

export interface PosTransactionPayments {
  amount: Decimal;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  method: string;
  outlet_id: number;
  payment_no: number;
  pos_transaction_id: number;
}

export interface PosTransactions {
  cashier_user_id: Generated<number | null>;
  client_tx_id: string;
  closed_at: Generated<Date | null>;
  company_id: number;
  created_at: Generated<Date>;
  discount_code: Generated<string | null>;
  discount_fixed: Generated<Decimal>;
  discount_percent: Generated<Decimal>;
  guest_count: Generated<number | null>;
  id: Generated<number>;
  notes: Generated<string | null>;
  opened_at: Generated<Date | null>;
  order_status: Generated<string>;
  outlet_id: number;
  payload_hash_version: Generated<number>;
  payload_sha256: Generated<string>;
  reservation_id: Generated<number | null>;
  service_type: Generated<string>;
  status: string;
  table_id: Generated<number | null>;
  trx_at: Date;
  updated_at: Generated<Date>;
}

export interface PosTransactionTaxes {
  amount: Generated<Decimal>;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  outlet_id: number;
  pos_transaction_id: number;
  tax_rate_id: number;
}

export interface RecipeIngredients {
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  ingredient_item_id: number;
  is_active: Generated<number>;
  quantity: Decimal;
  recipe_item_id: number;
  unit_of_measure: Generated<string>;
  updated_at: Generated<Date>;
}

export interface ReservationGroups {
  company_id: number;
  created_at: Generated<Date>;
  group_name: Generated<string | null>;
  id: Generated<number>;
  outlet_id: number;
  total_guest_count: number;
  updated_at: Generated<Date>;
}

export interface Reservations {
  arrived_at: Generated<Date | null>;
  cancelled_at: Generated<Date | null>;
  company_id: number;
  created_at: Generated<Date>;
  customer_name: string;
  customer_phone: Generated<string | null>;
  duration_minutes: Generated<number | null>;
  guest_count: number;
  id: Generated<number>;
  linked_order_id: Generated<string | null>;
  notes: Generated<string | null>;
  outlet_id: number;
  reservation_at: Date;
  reservation_end_ts: Generated<number | null>;
  reservation_group_id: Generated<number | null>;
  reservation_start_ts: Generated<number | null>;
  seated_at: Generated<Date | null>;
  status: Generated<string>;
  status_id: number;
  table_id: Generated<number | null>;
  updated_at: Generated<Date>;
}

export interface Roles {
  code: string;
  company_id: Generated<number | null>;
  created_at: Generated<Date>;
  id: Generated<number>;
  is_global: Generated<number>;
  name: string;
  role_level: Generated<number>;
  updated_at: Generated<Date>;
}

export interface SalesCreditNoteLines {
  company_id: number;
  created_at: Generated<Date>;
  credit_note_id: number;
  description: string;
  id: Generated<number>;
  line_no: number;
  line_total: Decimal;
  outlet_id: number;
  qty: Decimal;
  unit_price: Decimal;
  updated_at: Generated<Date>;
}

export interface SalesCreditNotes {
  amount: Generated<Decimal>;
  client_ref: Generated<string | null>;
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  credit_note_date: Date;
  credit_note_no: string;
  id: Generated<number>;
  invoice_id: number;
  notes: Generated<string | null>;
  outlet_id: number;
  reason: Generated<string | null>;
  status: Generated<string>;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
}

export interface SalesForecasts {
  company_id: number;
  confidence_lower: Generated<Decimal | null>;
  confidence_upper: Generated<Decimal | null>;
  forecast_date: Date;
  forecast_type: "DAILY" | "MONTHLY" | "WEEKLY";
  generated_at: Generated<Date>;
  id: Generated<number>;
  model_version: Generated<string>;
  outlet_id: Generated<number | null>;
  predicted_amount: Decimal;
}

export interface SalesInvoiceLines {
  company_id: number;
  created_at: Generated<Date>;
  description: string;
  id: Generated<number>;
  invoice_id: number;
  item_id: Generated<number | null>;
  line_no: number;
  line_total: Decimal;
  line_type: Generated<string>;
  outlet_id: number;
  qty: Decimal;
  unit_price: Decimal;
  updated_at: Generated<Date>;
}

export interface SalesInvoices {
  approved_at: Generated<Date | null>;
  approved_by_user_id: Generated<number | null>;
  client_ref: Generated<string | null>;
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  due_date: Generated<Date | null>;
  grand_total: Generated<Decimal>;
  id: Generated<number>;
  invoice_date: Date;
  invoice_no: string;
  order_id: Generated<number | null>;
  outlet_id: number;
  paid_total: Generated<Decimal>;
  payment_status: Generated<string>;
  status: Generated<string>;
  subtotal: Generated<Decimal>;
  tax_amount: Generated<Decimal>;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
}

export interface SalesInvoiceTaxes {
  amount: Generated<Decimal>;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  outlet_id: number;
  sales_invoice_id: number;
  tax_rate_id: number;
}

export interface SalesOrderLines {
  company_id: number;
  created_at: Generated<Date>;
  description: string;
  id: Generated<number>;
  item_id: Generated<number | null>;
  line_no: number;
  line_total: Decimal;
  line_type: Generated<string>;
  order_id: number;
  outlet_id: number;
  qty: Decimal;
  unit_price: Decimal;
  updated_at: Generated<Date>;
}

export interface SalesOrders {
  client_ref: Generated<string | null>;
  company_id: number;
  completed_at: Generated<Date | null>;
  completed_by_user_id: Generated<number | null>;
  confirmed_at: Generated<Date | null>;
  confirmed_by_user_id: Generated<number | null>;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  expected_date: Generated<Date | null>;
  grand_total: Generated<Decimal>;
  id: Generated<number>;
  notes: Generated<string | null>;
  order_date: Date;
  order_no: string;
  outlet_id: number;
  status: Generated<string>;
  subtotal: Generated<Decimal>;
  tax_amount: Generated<Decimal>;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
}

export interface SalesPayments {
  account_id: number;
  amount: Decimal;
  client_ref: Generated<string | null>;
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  id: Generated<number>;
  invoice_amount_idr: Generated<Decimal | null>;
  invoice_id: number;
  method: string;
  outlet_id: number;
  payment_amount_idr: Generated<Decimal | null>;
  payment_at: Date;
  payment_delta_idr: Generated<Decimal>;
  payment_no: string;
  shortfall_reason: Generated<string | null>;
  shortfall_settled_as_loss: Generated<number>;
  shortfall_settled_at: Generated<Date | null>;
  shortfall_settled_by_user_id: Generated<number | null>;
  status: Generated<string>;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
}

export interface SalesPaymentSplits {
  account_id: number;
  amount: Decimal;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  outlet_id: number;
  payment_id: number;
  split_index: Generated<number>;
  updated_at: Generated<Date>;
}

export interface ScheduledExports {
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: number;
  delivery_method: Generated<"DOWNLOAD" | "EMAIL" | "WEBHOOK">;
  export_format: Generated<"CSV" | "JSON" | "XLSX">;
  filters: Generated<string | null>;
  id: Generated<number>;
  is_active: Generated<number>;
  last_run_at: Generated<Date | null>;
  name: string;
  next_run_at: Date;
  recipients: string;
  report_type: "AUDIT" | "FINANCIAL" | "INVENTORY" | "JOURNAL" | "POS_TRANSACTIONS" | "SALES";
  schedule_config: string;
  schedule_type: "DAILY" | "MONTHLY" | "ONCE" | "WEEKLY";
  updated_at: Generated<Date>;
  webhook_url: Generated<string | null>;
}

export interface SettingsBooleans {
  company_id: number;
  created_at: Generated<Date | null>;
  id: Generated<number>;
  outlet_id: Generated<number | null>;
  setting_key: string;
  setting_value: Generated<number | null>;
  updated_at: Generated<Date | null>;
}

export interface SettingsNumbers {
  company_id: number;
  created_at: Generated<Date | null>;
  id: Generated<number>;
  outlet_id: Generated<number | null>;
  setting_key: string;
  setting_value: Generated<Decimal | null>;
  updated_at: Generated<Date | null>;
}

export interface SettingsStrings {
  company_id: number;
  created_at: Generated<Date | null>;
  id: Generated<number>;
  outlet_id: Generated<number | null>;
  setting_key: string;
  setting_value: Generated<string | null>;
  updated_at: Generated<Date | null>;
}

export interface StaticPages {
  content_md: string;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  id: Generated<number>;
  meta_json: Generated<string | null>;
  published_at: Generated<Date | null>;
  slug: string;
  status: Generated<string>;
  title: string;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
}

export interface ExchangeRates {
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  currency_code: string;
  effective_date: Date;
  id: Generated<number>;
  is_active: Generated<number>;
  notes: Generated<string | null>;
  rate: Decimal;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
}

export interface GoodsReceiptLines {
  company_id: number;
  created_at: Generated<Date>;
  description: Generated<string | null>;
  id: Generated<number>;
  item_id: Generated<number | null>;
  line_no: number;
  over_receipt_allowed: Generated<number>;
  po_line_id: Generated<number | null>;
  qty: Decimal;
  receipt_id: number;
  unit: Generated<string | null>;
  updated_at: Generated<Date>;
}

export interface GoodsReceipts {
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  id: Generated<number>;
  notes: Generated<string | null>;
  receipt_date: Generated<Date>;
  reference_number: string;
  status: Generated<number>;
  supplier_id: number;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
}

export interface SupplierContacts {
  created_at: Generated<Date>;
  email: Generated<string | null>;
  id: Generated<number>;
  is_primary: Generated<number>;
  name: string;
  notes: Generated<string | null>;
  phone: Generated<string | null>;
  role: Generated<string | null>;
  supplier_id: number;
  updated_at: Generated<Date>;
}

export interface SupplierStatements {
  closing_balance: Generated<Decimal>;
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  currency_code: string;
  id: Generated<number>;
  reconciled_at: Generated<Date | null>;
  reconciled_by_user_id: Generated<number | null>;
  statement_date: Date;
  status: Generated<number>;
  supplier_id: number;
  updated_at: Generated<Date>;
}

export interface PurchaseInvoiceLines {
  company_id: number;
  created_at: Generated<Date>;
  description: string;
  id: Generated<number>;
  invoice_id: number;
  item_id: Generated<number | null>;
  line_no: number;
  line_total: Decimal;
  line_type: Generated<string>;
  po_line_id: Generated<number | null>;
  qty: Decimal;
  tax_amount: Generated<Decimal>;
  tax_rate_id: Generated<number | null>;
  unit_price: Decimal;
  updated_at: Generated<Date>;
}

export interface PurchaseCreditApplications {
  applied_amount: Decimal;
  applied_at: Generated<Date>;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  purchase_credit_id: number;
  purchase_credit_line_id: number;
  purchase_invoice_id: number;
}

export interface PurchaseCreditLines {
  created_at: Generated<Date>;
  description: Generated<string | null>;
  id: Generated<number>;
  item_id: Generated<number | null>;
  line_amount: Decimal;
  line_no: number;
  purchase_credit_id: number;
  purchase_invoice_id: Generated<number | null>;
  purchase_invoice_line_id: Generated<number | null>;
  qty: Decimal;
  reason: Generated<string | null>;
  unit_price: Decimal;
  updated_at: Generated<Date>;
}

export interface PurchaseCredits {
  applied_amount: Generated<Decimal>;
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  credit_date: Date;
  credit_no: string;
  description: Generated<string | null>;
  id: Generated<number>;
  journal_batch_id: Generated<number | null>;
  posted_at: Generated<Date | null>;
  posted_by_user_id: Generated<number | null>;
  status: Generated<number>;
  supplier_id: number;
  total_credit_amount: Generated<Decimal>;
  updated_at: Generated<Date>;
  voided_at: Generated<Date | null>;
  voided_by_user_id: Generated<number | null>;
}

export interface PurchaseInvoices {
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  currency_code: Generated<string>;
  due_date: Generated<Date | null>;
  exchange_rate: Generated<Decimal>;
  grand_total: Generated<Decimal>;
  id: Generated<number>;
  invoice_date: Date;
  invoice_no: string;
  journal_batch_id: Generated<number | null>;
  notes: Generated<string | null>;
  posted_at: Generated<Date | null>;
  posted_by_user_id: Generated<number | null>;
  reference_number: Generated<string | null>;
  status: Generated<number>;
  subtotal: Generated<Decimal>;
  supplier_id: number;
  tax_amount: Generated<Decimal>;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
  voided_at: Generated<Date | null>;
  voided_by_user_id: Generated<number | null>;
}

export interface PurchaseOrderLines {
  company_id: number;
  created_at: Generated<Date>;
  description: Generated<string | null>;
  id: Generated<number>;
  item_id: Generated<number | null>;
  line_no: number;
  line_total: Decimal;
  order_id: number;
  qty: Decimal;
  received_qty: Generated<Decimal>;
  tax_rate: Generated<Decimal>;
  unit_price: Decimal;
  updated_at: Generated<Date>;
}

export interface PurchaseOrders {
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  currency_code: Generated<string>;
  expected_date: Generated<Date | null>;
  id: Generated<number>;
  notes: Generated<string | null>;
  order_date: Generated<Date>;
  order_no: string;
  status: Generated<number>;
  supplier_id: number;
  total_amount: Generated<Decimal>;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
}

export interface Suppliers {
  address_line1: Generated<string | null>;
  address_line2: Generated<string | null>;
  city: Generated<string | null>;
  company_id: number;
  country: Generated<string | null>;
  code: string;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  credit_limit: Generated<Decimal>;
  currency: string;
  email: Generated<string | null>;
  id: Generated<number>;
  is_active: Generated<number>;
  name: string;
  notes: Generated<string | null>;
  payment_terms_days: Generated<number | null>;
  phone: Generated<string | null>;
  postal_code: Generated<string | null>;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
}

export interface Supplies {
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  is_active: Generated<number>;
  name: string;
  sku: Generated<string | null>;
  unit: Generated<string>;
  updated_at: Generated<Date>;
}

export interface SyncAuditEvents {
  client_device_id: Generated<string | null>;
  client_version: Generated<string | null>;
  company_id: number;
  completed_at: Generated<Date | null>;
  created_at: Generated<Date>;
  duration_ms: Generated<number | null>;
  error_code: Generated<string | null>;
  error_message: Generated<string | null>;
  id: Generated<number>;
  items_count: Generated<number | null>;
  operation_type: string;
  outlet_id: Generated<number | null>;
  request_size_bytes: Generated<number | null>;
  response_size_bytes: Generated<number | null>;
  started_at: Date;
  status: string;
  tier_name: string;
  version_after: Generated<number | null>;
  version_before: Generated<number | null>;
}

export interface SyncVersions {
  company_id: number;
  created_at: Generated<Date | null>;
  current_version: Generated<number | null>;
  id: Generated<number>;
  last_synced_at: Generated<Date | null>;
  min_version: Generated<number | null>;
  tier: Generated<string | null>;
  tier_key: Generated<string | null>;
  updated_at: Generated<Date | null>;
}

export interface TableEvents {
  client_tx_id: string;
  company_id: number;
  conflict_reason: Generated<string | null>;
  created_at: Generated<Date>;
  created_by: Generated<string | null>;
  event_data: Generated<string | null>;
  event_type_id: number;
  id: Generated<number>;
  is_conflict: Generated<number>;
  occupancy_version_after: Generated<number | null>;
  occupancy_version_before: Generated<number | null>;
  occurred_at: Date;
  outlet_id: number;
  pos_order_id: Generated<string | null>;
  reservation_id: Generated<number | null>;
  service_session_id: Generated<number | null>;
  source_device: Generated<string | null>;
  status_id_after: Generated<number | null>;
  status_id_before: Generated<number | null>;
  synced_at: Generated<Date | null>;
  table_id: number;
}

export interface TableOccupancy {
  company_id: number;
  created_at: Generated<Date>;
  created_by: Generated<string | null>;
  guest_count: Generated<number | null>;
  id: Generated<number>;
  notes: Generated<string | null>;
  occupied_at: Generated<Date | null>;
  outlet_id: number;
  reservation_id: Generated<number | null>;
  reserved_until: Generated<Date | null>;
  service_session_id: Generated<number | null>;
  status_id: number;
  table_id: number;
  updated_at: Generated<Date>;
  updated_by: Generated<string | null>;
  version: Generated<number>;
}

export interface TableServiceSessionCheckpoints {
  batch_no: number;
  client_tx_id: string;
  company_id: number;
  created_at: Generated<Date>;
  finalized_at: Date;
  finalized_by: Generated<string | null>;
  id: Generated<number>;
  outlet_id: number;
  session_id: number;
  snapshot_id: string;
}

export interface TableServiceSessionLines {
  adjustment_parent_line_id: Generated<number | null>;
  batch_no: Generated<number | null>;
  created_at: Generated<Date>;
  discount_amount: Generated<Decimal>;
  id: Generated<number>;
  is_voided: Generated<number>;
  line_number: number;
  line_state: Generated<number>;
  line_total: Decimal;
  notes: Generated<string | null>;
  product_id: number;
  product_name: string;
  product_sku: Generated<string | null>;
  quantity: number;
  session_id: number;
  tax_amount: Generated<Decimal>;
  unit_price: Decimal;
  updated_at: Generated<Date>;
  void_reason: Generated<string | null>;
  voided_at: Generated<Date | null>;
}

export interface TableServiceSessions {
  cashier_user_id: Generated<number | null>;
  closed_at: Generated<Date | null>;
  company_id: number;
  completed_at: Generated<Date | null>;
  created_at: Generated<Date>;
  created_by: Generated<string | null>;
  guest_count: number;
  guest_name: Generated<string | null>;
  id: Generated<number>;
  last_finalized_batch_no: Generated<number>;
  locked_at: Generated<Date | null>;
  notes: Generated<string | null>;
  outlet_id: number;
  pos_order_id: Generated<string | null>;
  pos_order_snapshot_id: Generated<string | null>;
  reservation_id: Generated<number | null>;
  server_user_id: Generated<number | null>;
  session_version: Generated<number>;
  started_at: Date;
  status_id: number;
  table_id: number;
  total_amount: Generated<Decimal | null>;
  updated_at: Generated<Date>;
  updated_by: Generated<string | null>;
}

export interface TaxRates {
  account_id: Generated<number | null>;
  code: string;
  company_id: number;
  created_at: Generated<Date>;
  created_by_user_id: Generated<number | null>;
  id: Generated<number>;
  is_active: Generated<number>;
  is_inclusive: Generated<number>;
  name: string;
  rate_percent: Generated<Decimal>;
  updated_at: Generated<Date>;
  updated_by_user_id: Generated<number | null>;
}

export interface UserRoleAssignments {
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  outlet_id: Generated<number | null>;
  role_id: number;
  user_id: number;
}

export interface Users {
  company_id: number;
  created_at: Generated<Date>;
  email: string;
  email_verified_at: Generated<Date | null>;
  id: Generated<number>;
  is_active: Generated<number>;
  name: Generated<string | null>;
  password_hash: string;
  updated_at: Generated<Date>;
}

export interface VariantSales {
  client_tx_id: string;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  item_id: number;
  outlet_id: number;
  qty: Decimal;
  total_amount: Decimal;
  trx_at: Date;
  unit_price: Decimal;
  variant_id: number;
}

export interface VariantStockAdjustments {
  adjusted_at: Date;
  adjustment_type: "DECREASE" | "INCREASE" | "SET";
  client_tx_id: string;
  company_id: number;
  created_at: Generated<Date>;
  id: Generated<number>;
  new_stock: number;
  outlet_id: number;
  previous_stock: number;
  quantity: number;
  reason: string;
  reference: Generated<string | null>;
  variant_id: number;
}

export interface VPosDailyTotals {
  company_id: number;
  gross_total: Generated<Decimal>;
  outlet_id: number;
  paid_total: Generated<Decimal>;
  status: string;
  trx_date: Generated<Date | null>;
  tx_count: Generated<number>;
}

export interface DB {
  account_balances_current: AccountBalancesCurrent;
  account_mapping_types: AccountMappingTypes;
  account_mappings: AccountMappings;
  account_types: AccountTypes;
  accounts: Accounts;
  analytics_insights: AnalyticsInsights;
  ap_exceptions: ApExceptions;
  ap_payment_lines: ApPaymentLines;
  ap_payments: ApPayments;
  archive_sync_data_versions: ArchiveSyncDataVersions;
  archive_sync_operations: ArchiveSyncOperations;
  archive_sync_tier_versions: ArchiveSyncTierVersions;
  archive_user_outlets: ArchiveUserOutlets;
  asset_depreciation_plans: AssetDepreciationPlans;
  asset_depreciation_runs: AssetDepreciationRuns;
  audit_logs: AuditLogs;
  auth_login_throttles: AuthLoginThrottles;
  auth_oauth_accounts: AuthOauthAccounts;
  auth_password_reset_throttles: AuthPasswordResetThrottles;
  auth_refresh_tokens: AuthRefreshTokens;
  auth_throttles: AuthThrottles;
  backoffice_sync_queue: BackofficeSyncQueue;
  cash_bank_transactions: CashBankTransactions;
  companies: Companies;
  company_account_mappings: CompanyAccountMappings;
  company_account_mappings_view: CompanyAccountMappingsView;
  company_modules: CompanyModules;
  company_payment_method_mappings: CompanyPaymentMethodMappings;
  company_payment_method_mappings_view: CompanyPaymentMethodMappingsView;
  company_tax_defaults: CompanyTaxDefaults;
  cost_layer_consumption: CostLayerConsumption;
  customers: Customers;
  data_imports: DataImports;
  email_outbox: EmailOutbox;
  email_tokens: EmailTokens;
  export_files: ExportFiles;
  feature_flags: FeatureFlags;
  fiscal_year_close_requests: FiscalYearCloseRequests;
  fiscal_periods: FiscalPeriods;
  fiscal_years: FiscalYears;
  fixed_asset_books: FixedAssetBooks;
  fixed_asset_categories: FixedAssetCategories;
  fixed_asset_disposals: FixedAssetDisposals;
  fixed_asset_events: FixedAssetEvents;
  fixed_assets: FixedAssets;
  import_sessions: ImportSessions;
  inventory_cost_layers: InventoryCostLayers;
  inventory_item_costs: InventoryItemCosts;
  inventory_stock: InventoryStock;
  inventory_transactions: InventoryTransactions;
  item_groups: ItemGroups;
  item_images: ItemImages;
  item_prices: ItemPrices;
  item_variant_attribute_values: ItemVariantAttributeValues;
  item_variant_attributes: ItemVariantAttributes;
  item_variant_combinations: ItemVariantCombinations;
  item_variants: ItemVariants;
  items: Items;
  journal_batches: JournalBatches;
  journal_lines: JournalLines;
  module_roles: ModuleRoles;
  modules: Modules;
  numbering_templates: NumberingTemplates;
  operation_progress: OperationProgress;
  outlet_account_mappings: OutletAccountMappings;
  outlet_account_mappings_view: OutletAccountMappingsView;
  outlet_payment_method_mappings: OutletPaymentMethodMappings;
  outlet_payment_method_mappings_view: OutletPaymentMethodMappingsView;
  outlet_tables: OutletTables;
  outlets: Outlets;
  payment_method_mappings: PaymentMethodMappings;
  period_close_overrides: PeriodCloseOverrides;
  platform_settings: PlatformSettings;
  pos_item_cancellations: PosItemCancellations;
  purchase_invoice_lines: PurchaseInvoiceLines;
  purchase_credit_applications: PurchaseCreditApplications;
  purchase_credit_lines: PurchaseCreditLines;
  purchase_credits: PurchaseCredits;
  purchase_invoices: PurchaseInvoices;
  purchase_order_lines: PurchaseOrderLines;
  purchase_orders: PurchaseOrders;
  pos_order_snapshot_lines: PosOrderSnapshotLines;
  goods_receipts: GoodsReceipts;
  goods_receipt_lines: GoodsReceiptLines;
  pos_order_snapshots: PosOrderSnapshots;
  pos_order_updates: PosOrderUpdates;
  pos_sync_metadata: PosSyncMetadata;
  pos_transaction_items: PosTransactionItems;
  pos_transaction_payments: PosTransactionPayments;
  pos_transaction_taxes: PosTransactionTaxes;
  pos_transactions: PosTransactions;
  recipe_ingredients: RecipeIngredients;
  reservation_groups: ReservationGroups;
  reservations: Reservations;
  roles: Roles;
  sales_credit_note_lines: SalesCreditNoteLines;
  sales_credit_notes: SalesCreditNotes;
  sales_forecasts: SalesForecasts;
  sales_invoice_lines: SalesInvoiceLines;
  sales_invoice_taxes: SalesInvoiceTaxes;
  sales_invoices: SalesInvoices;
  sales_order_lines: SalesOrderLines;
  sales_orders: SalesOrders;
  sales_payment_splits: SalesPaymentSplits;
  sales_payments: SalesPayments;
  scheduled_exports: ScheduledExports;
  settings_booleans: SettingsBooleans;
  settings_numbers: SettingsNumbers;
  settings_strings: SettingsStrings;
  static_pages: StaticPages;
  exchange_rates: ExchangeRates;
  supplier_contacts: SupplierContacts;
  supplier_statements: SupplierStatements;
  suppliers: Suppliers;
  supplies: Supplies;
  sync_audit_events: SyncAuditEvents;
  sync_versions: SyncVersions;
  table_events: TableEvents;
  table_occupancy: TableOccupancy;
  table_service_session_checkpoints: TableServiceSessionCheckpoints;
  table_service_session_lines: TableServiceSessionLines;
  table_service_sessions: TableServiceSessions;
  tax_rates: TaxRates;
  user_role_assignments: UserRoleAssignments;
  users: Users;
  v_pos_daily_totals: VPosDailyTotals;
  variant_sales: VariantSales;
  variant_stock_adjustments: VariantStockAdjustments;
}
