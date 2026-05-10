// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Test fixture types for the sales module.
 */

export interface CustomerFixture {
  id: number;
  company_id: number;
  code: string;
}

export interface SalesInvoiceFixture {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
}
