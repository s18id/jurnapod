// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

// Tax resolution service interface
export interface TaxResolver {
  /**
   * Resolve effective tax rates for a company at a given timestamp
   */
  resolveTaxRates(companyId: number, outletId: number | undefined, atTimestamp: string): Promise<TaxRateResolution>;
}

// Stock service interface
export interface StockService {
  /**
   * Adjust variant stock levels
   */
  adjustVariantStock(companyId: number, adjustments: StockAdjustment[]): Promise<StockAdjustmentResult>;

  /**
   * Get current stock levels for variants
   */
  getVariantStock(companyId: number, variantIds: number[]): Promise<Map<number, number>>;
}

// COGS posting service interface
export interface CogsPostingService {
  /**
   * Post COGS entries for a transaction
   */
  postCogs(companyId: number, transactionId: number, lines: CogsLine[]): Promise<CogsPostingResult>;
}

// Supporting types
export interface TaxRateResolution {
  defaultRate: number;
  rates: Array<{
    tax_type_id: number;
    rate: number;
    name: string;
  }>;
}

export interface StockAdjustment {
  variant_id: number;
  outlet_id: number;
  quantity_change: number; // negative for deductions
  reason: string;
  reference_id?: string;
}

export interface StockAdjustmentResult {
  success: boolean;
  adjustments: Array<{
    variant_id: number;
    new_quantity: number;
  }>;
  errors?: string[];
}

export interface CogsLine {
  item_id: number;
  variant_id: number;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

export interface CogsPostingResult {
  success: boolean;
  cogs_posting_id?: number;
  errors?: string[];
}
