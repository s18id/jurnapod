// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * PrinterPort
 * 
 * Platform-agnostic interface for receipt and document printing.
 * Implementations may use window.print(), PDF generation, native printers,
 * or thermal printer APIs.
 * 
 * This abstraction ensures business logic does not directly depend on
 * browser print APIs, PDF libraries, or native printer plugins.
 */

export type PrintFormat = "receipt" | "invoice" | "report";
export type PrintOutputMode = "print" | "pdf" | "preview";

export interface PrintReceiptInput {
  // Transaction details
  transaction_id: string;
  transaction_date: string;
  
  // Outlet info
  outlet_name: string;
  outlet_address?: string;
  outlet_phone?: string;
  
  // Cashier info
  cashier_name?: string;
  
  // Line items
  items: Array<{
    name: string;
    quantity: number;
    unit_price: number;
    discount_amount: number;
    line_total: number;
  }>;
  
  // Payment details
  payments: Array<{
    method: string;
    amount: number;
    reference_no?: string;
  }>;
  
  // Totals
  totals: {
    subtotal: number;
    discount_total: number;
    tax_total: number;
    grand_total: number;
    paid_total: number;
    change_total: number;
  };
  
  // Footer notes
  footer_note?: string;
}

export interface PrintInvoiceInput {
  // Invoice details
  invoice_number: string;
  invoice_date: string;
  due_date?: string;
  
  // Company info
  company_name: string;
  company_address?: string;
  company_phone?: string;
  company_tax_id?: string;
  
  // Customer info
  customer_name?: string;
  customer_address?: string;
  customer_phone?: string;
  customer_tax_id?: string;
  
  // Line items
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    discount_amount: number;
    tax_amount: number;
    line_total: number;
  }>;
  
  // Totals
  totals: {
    subtotal: number;
    discount_total: number;
    tax_total: number;
    grand_total: number;
  };
  
  // Payment info
  payment_terms?: string;
  payment_status?: "UNPAID" | "PARTIAL" | "PAID";
  
  // Notes
  notes?: string;
}

export interface PrintReportInput {
  title: string;
  date_range?: {
    from: string;
    to: string;
  };
  headers: string[];
  rows: string[][];
  summary?: Array<{
    label: string;
    value: string;
  }>;
}

export interface PrintOptions {
  format: PrintFormat;
  output_mode?: PrintOutputMode;
  paper_width_mm?: number; // For thermal printers
  auto_cut?: boolean; // For thermal printers
  open_cash_drawer?: boolean; // For POS printers with cash drawer
}

export interface PrintResult {
  success: boolean;
  message?: string;
  pdf_url?: string; // If output_mode is 'pdf'
  error?: string;
}

/**
 * PrinterPort
 * 
 * Abstracts receipt, invoice, and report printing across platforms.
 */
export interface PrinterPort {
  /**
   * Print a receipt (typically for POS transactions).
   */
  printReceipt(
    input: PrintReceiptInput,
    options?: Partial<PrintOptions>
  ): Promise<PrintResult>;

  /**
   * Print an invoice (formal billing document).
   */
  printInvoice(
    input: PrintInvoiceInput,
    options?: Partial<PrintOptions>
  ): Promise<PrintResult>;

  /**
   * Print a report (tabular data).
   */
  printReport(
    input: PrintReportInput,
    options?: Partial<PrintOptions>
  ): Promise<PrintResult>;

  /**
   * Check if printer is available/ready.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get printer capabilities (e.g., supported paper sizes).
   */
  getCapabilities(): Promise<{
    supports_thermal: boolean;
    supports_pdf: boolean;
    supports_cash_drawer: boolean;
    paper_widths_mm: number[];
  }>;
}
