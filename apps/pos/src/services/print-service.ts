// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Print Service
 * 
 * Orchestrates printing operations across different document types.
 * Provides high-level printing methods that abstract platform details.
 */

import type { PrinterPort, PrintReceiptInput, PrintResult } from "../ports/printer-port.js";
import type { PosStoragePort } from "../ports/storage-port.js";

export interface PrintSaleReceiptInput {
  sale_id: string;
  company_id: number;
  outlet_id: number;
}

/**
 * PrintService
 * 
 * Provides high-level printing operations that coordinate
 * data retrieval and printing.
 */
export class PrintService {
  constructor(
    private printer: PrinterPort,
    private storage: PosStoragePort
  ) {}

  /**
   * Print a receipt for a completed sale.
   * Retrieves sale data from storage and formats for printing.
   */
  async printSaleReceipt(input: PrintSaleReceiptInput): Promise<PrintResult> {
    // Retrieve sale data
    const sale = await this.storage.getSale(input.sale_id);
    if (!sale) {
      return {
        success: false,
        error: `Sale not found: ${input.sale_id}`
      };
    }

    // Retrieve sale items
    const saleItems = await this.storage.getSaleItems(input.sale_id);
    if (saleItems.length === 0) {
      return {
        success: false,
        error: `No items found for sale: ${input.sale_id}`
      };
    }

    // Retrieve payments
    const payments = await this.storage.getPayments(input.sale_id);
    if (payments.length === 0) {
      return {
        success: false,
        error: `No payments found for sale: ${input.sale_id}`
      };
    }

    // Format receipt data
    const receiptData: PrintReceiptInput = {
      transaction_id: sale.client_tx_id ?? sale.sale_id,
      transaction_date: sale.trx_at,
      outlet_name: `Outlet ${input.outlet_id}`, // TODO: Get from outlet metadata
      items: saleItems.map(item => ({
        name: item.name_snapshot,
        quantity: item.qty,
        unit_price: item.unit_price_snapshot,
        discount_amount: item.discount_amount,
        line_total: item.line_total
      })),
      payments: payments.map(payment => ({
        method: payment.method,
        amount: payment.amount,
        reference_no: payment.reference_no ?? undefined
      })),
      totals: {
        subtotal: sale.subtotal,
        discount_total: sale.discount_total,
        tax_total: sale.tax_total,
        grand_total: sale.grand_total,
        paid_total: sale.paid_total,
        change_total: sale.change_total
      },
      footer_note: "Thank you for your business!"
    };

    // Print receipt
    return await this.printer.printReceipt(receiptData);
  }

  /**
   * Check if printer is available.
   */
  async isPrinterAvailable(): Promise<boolean> {
    return await this.printer.isAvailable();
  }

  /**
   * Get printer capabilities.
   */
  async getPrinterCapabilities() {
    return await this.printer.getCapabilities();
  }
}
