// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Subledger reconciliation providers.
 *
 * This module provides:
 * - SubledgerBalanceProvider interface for querying subledger balances
 * - SignedAmount helpers with debit-positive convention
 * - CASH subledger implementation
 *
 * @example
 * import { CashSubledgerProvider } from './subledger/cash-provider.js';
 *
 * const cashProvider = new CashSubledgerProvider({ db });
 * const result = await cashProvider.getBalance({
 *   companyId: 1,
 *   asOfEpochMs: Date.now(),
 *   includeDrilldown: true
 * });
 */

// Re-export types
export {
  type SignedAmount,
  type SignedAmountBreakdown,
  type ReconciliationSourceType,
  type ReconciliationDrilldownLine,
  type ReconciliationDrilldown,
  SubledgerType,
  type SubledgerTypeCode,
  type SubledgerBalanceQuery,
  type SubledgerBalanceResult,
  SubledgerBalanceProvider,
} from "./types.js";

// Re-export provider interface and helpers
export {
  makeSignedAmount,
  toSignedAmountBreakdown,
  toSignedAmount,
  fromSignedAmount,
  addSignedAmounts,
  negateSignedAmount,
  mapJournalLineToDrilldown,
  zeroBreakdown,
  zeroSignedAmount,
} from "./provider.js";

// Re-export CASH provider
export { CashSubledgerProvider, type CashSubledgerDbClient, type CashSubledgerProviderOptions } from "./cash-provider.js";

// Re-export RECEIVABLES provider
export {
  ReceivablesSubledgerProvider,
  type ReceivablesSubledgerDbClient,
  type ReceivablesSubledgerProviderOptions,
} from "./receivables-provider.js";

// Re-export INVENTORY provider
export {
  InventorySubledgerProvider,
  type InventorySubledgerDbClient,
  type InventorySubledgerProviderOptions,
} from "./inventory-provider.js";

// Re-export AR reconciliation types and service
export {
  type ARReconciliationSettings,
  type ARReconciliationSummaryResult,
  type ARDocumentType,
  type ARGLDetailLine,
  type ARDetailLine,
  type ARGLDetailResult,
  type ARDetailResult,
  type GetARGLDetailParams,
  type GetARDetailParams,
  type GetARReconciliationSummaryParams,
  type GetARReconciliationSettingsParams,
  type ValidateARReconciliationAccountIdsParams,
  type SaveARReconciliationSettingsParams,
  type ARDrilldownCategory,
  type ARDrilldownLineItem,
  type ARDrilldownResult,
  type GetARReconciliationDrilldownParams,
  ARReconciliationError,
  ARReconciliationSettingsRequiredError,
  ARReconciliationInvalidAccountError,
  ARReconciliationCrossTenantAccountError,
  ARReconciliationTimezoneRequiredError,
} from "./ar-reconciliation-types.js";

export {
  ARReconciliationService,
  toScaled,
  fromScaled,
  fromScaled4,
} from "./ar-reconciliation-service.js";

// Re-export AP reconciliation types and service
export {
  type APReconciliationSettings,
  type APReconciliationSummaryResult,
  type APDocumentType,
  type GetAPReconciliationSummaryParams,
  type GetAPReconciliationSettingsParams,
  type ValidateAPReconciliationAccountIdsParams,
  type SaveAPReconciliationSettingsParams,
  type APDrilldownCategory,
  type APDrilldownLineItem,
  type APDrilldownResult,
  type GetAPReconciliationDrilldownParams,
  APReconciliationError,
  APReconciliationSettingsRequiredError,
  APReconciliationInvalidAccountError,
  APReconciliationCrossTenantAccountError,
  APReconciliationTimezoneRequiredError,
} from "./ap-reconciliation-types.js";

export {
  APReconciliationService,
} from "./ap-reconciliation-service.js";

// Re-export INVENTORY reconciliation types and service
export {
  type InventoryReconciliationSettings,
  type InventoryReconciliationSummaryResult,
  type InventoryMovementType,
  type InventoryGLDetailLine,
  type InventoryDetailLine,
  type InventoryGLDetailResult,
  type InventoryDetailResult,
  type GetInventoryGLDetailParams,
  type GetInventoryDetailParams,
  type GetInventoryReconciliationSummaryParams,
  type GetInventoryReconciliationSettingsParams,
  type ValidateInventoryReconciliationAccountIdsParams,
  type SaveInventoryReconciliationSettingsParams,
  type InventoryDrilldownCategory,
  type InventoryDrilldownLineItem,
  type InventoryDrilldownResult,
  type GetInventoryReconciliationDrilldownParams,
  InventoryReconciliationError,
  InventoryReconciliationSettingsRequiredError,
  InventoryReconciliationInvalidAccountError,
  InventoryReconciliationCrossTenantAccountError,
  InventoryReconciliationTimezoneRequiredError,
} from "./inventory-reconciliation-types.js";

export {
  InventoryReconciliationService,
  toScaled as inventoryToScaled,
  fromScaled as inventoryFromScaled,
  fromScaled4 as inventoryFromScaled4,
} from "./inventory-reconciliation-service.js";
