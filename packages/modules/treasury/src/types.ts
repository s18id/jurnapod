// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Domain types for cash-bank transactions.
 *
 * Extracted from apps/api/src/lib/cash-bank.ts (Story 25.2)
 */

import type { CashBankTransaction as SharedCashBankTransaction } from "@jurnapod/shared";

export type CashBankType = "MUTATION" | "TOP_UP" | "WITHDRAWAL" | "FOREX";
export type CashBankStatus = "DRAFT" | "POSTED" | "VOID";
export type AccountClass = "CASH" | "BANK";

/**
 * Treasury-specific cash-bank transaction type.
 * Extends the shared schema with treasury-specific fields if needed.
 */
export interface CashBankTransaction extends SharedCashBankTransaction {
  // Treasury-specific extensions go here (currently none - mirrors shared)
}

/**
 * Account information for cash-bank validation.
 * Used to check if an account can be used in cash-bank transactions.
 */
export interface AccountInfo {
  id: number;
  company_id: number;
  name: string;
  type_name: string | null;
}

/**
 * Input type for creating a cash-bank transaction.
 */
export interface CreateCashBankInput {
  outlet_id?: number | null;
  transaction_type: CashBankType;
  transaction_date: string;
  reference?: string;
  description: string;
  source_account_id: number;
  destination_account_id: number;
  amount: number;
  currency_code?: string;
  exchange_rate?: number;
  base_amount?: number;
  fx_account_id?: number | null;
}

/**
 * Filter options for listing cash-bank transactions.
 */
export interface CashBankListFilters {
  outletId?: number;
  transactionType?: CashBankType;
  status?: CashBankStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}
