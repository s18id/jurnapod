/**
 * NotImplementedError — thrown by fixture functions that have not yet been migrated
 * from the legacy location (apps/api/src/lib/test-fixtures.ts) to this package.
 */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

/**
 * Supplier fixture type — mirrors production Supplier entity shape.
 */
export interface SupplierFixture {
  id: number;
  company_id: number;
  code: string;
  name: string;
  currency: string;
  payment_terms_days: number | null;
  is_active: boolean;
}

/**
 * Purchasing accounts fixture type — AP and expense account IDs.
 */
export interface PurchasingAccountsFixture {
  ap_account_id: number;
  expense_account_id: number;
}

/**
 * Purchasing settings fixture type — company_modules configuration for purchasing.
 */
export interface PurchasingSettingsFixture {
  company_id: number;
  ap_account_id: number;
  expense_account_id: number;
}
