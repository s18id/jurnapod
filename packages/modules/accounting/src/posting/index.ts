// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export type {
  PostingMapper,
  PostingRepository,
  PostingTransactionOwner,
  PostingOptions
} from "../posting.js";
export {
  UnbalancedJournalError,
  PostingService
} from "../posting.js";
export * from "./common.js";
export {
  // Sales posting
  SalesInvoicePostingData,
  SalesPaymentPostingData,
  SalesCreditNotePostingData,
  OutletAccountMapping,
  PaymentVarianceAccounts,
  TaxRateInfo,
  SalesPostingExecutor,
  SalesInvoicePostingMapper,
  SalesPaymentPostingMapper,
  SalesCreditNotePostingMapper,
  VoidCreditNotePostingMapper,
  SalesPostingRepository,
  PaymentVarianceConfigError,
  postSalesInvoice,
  postSalesPayment,
  postCreditNote,
  voidCreditNote,
  SALES_OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE,
  SALES_OUTLET_PAYMENT_MAPPING_MISSING_MESSAGE,
  SALES_TAX_ACCOUNT_MISSING_MESSAGE,
  PAYMENT_VARIANCE_GAIN_MISSING_MESSAGE,
  PAYMENT_VARIANCE_LOSS_MISSING_MESSAGE,
} from "./sales.js";
export type {
  // COGS posting types
  CogsPostingInput,
  CogsPostingResult,
  CogsItemDetail,
  ItemAccountMapping,
  CogsSaleDetail,
  CogsPostingExecutor,
  StockCostEntry,
  CogsCalculationError,
  CogsAccountConfigError,
  CogsPostingError,
} from "./cogs.js";
export {
  // COGS posting values
  CogsRepository,
  CogsPostingMapper,
  postCogsForSale,
  calculateSaleCogs,
  getItemAccounts,
  getItemAccountsBatch,
} from "./cogs.js";
export type {
  // Depreciation posting types
  DepreciationPlan,
  DepreciationRun,
  DepreciationPostingExecutor,
  DepreciationPostingRepository,
  DepreciationPostingMapper,
} from "./depreciation.js";
export {
  // Depreciation posting values
  postDepreciationRun,
} from "./depreciation.js";
export type {
  // Sync push posting types
  SyncPushPostingMode,
  SyncPushPostingHookResult,
  SyncPushPostingContext,
  SyncPushPostingExecutor,
  PosSyncPushPostingRepository,
  PosSyncPushPostingMapper,
} from "./sync-push.js";
export {
  // Sync push posting values
  SyncPushPostingHookError,
  OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE,
  OUTLET_PAYMENT_MAPPING_MISSING_MESSAGE,
  TAX_ACCOUNT_MISSING_MESSAGE,
  UNSUPPORTED_PAYMENT_METHOD_MESSAGE,
  POS_EMPTY_PAYMENT_SET_MESSAGE,
  POS_OVERPAYMENT_NOT_SUPPORTED_MESSAGE,
  runSyncPushPostingHook,
} from "./sync-push.js";
