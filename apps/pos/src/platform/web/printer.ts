// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Web Platform Printer Adapter
 * 
 * Implements PrinterPort using browser window.print() and HTML rendering.
 * Generates printable HTML receipts and invoices.
 */

import type {
  PrinterPort,
  PrintReceiptInput,
  PrintInvoiceInput,
  PrintReportInput,
  PrintOptions,
  PrintResult
} from "../../ports/printer-port.js";

export class WebPrinterAdapter implements PrinterPort {
  async printReceipt(
    input: PrintReceiptInput,
    options?: Partial<PrintOptions>
  ): Promise<PrintResult> {
    try {
      const html = this.generateReceiptHTML(input);
      await this.printHTML(html, options);
      
      return {
        success: true,
        message: "Receipt printed successfully"
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to print receipt: ${message}`
      };
    }
  }

  async printInvoice(
    input: PrintInvoiceInput,
    options?: Partial<PrintOptions>
  ): Promise<PrintResult> {
    try {
      const html = this.generateInvoiceHTML(input);
      await this.printHTML(html, options);
      
      return {
        success: true,
        message: "Invoice printed successfully"
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to print invoice: ${message}`
      };
    }
  }

  async printReport(
    input: PrintReportInput,
    options?: Partial<PrintOptions>
  ): Promise<PrintResult> {
    try {
      const html = this.generateReportHTML(input);
      await this.printHTML(html, options);
      
      return {
        success: true,
        message: "Report printed successfully"
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to print report: ${message}`
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    return typeof window !== "undefined" && typeof window.print === "function";
  }

  async getCapabilities() {
    return {
      supports_thermal: false, // Web doesn't support thermal printers directly
      supports_pdf: true, // Can use browser print-to-PDF
      supports_cash_drawer: false,
      paper_widths_mm: [80, 210] // 80mm receipt, A4
    };
  }

  private generateReceiptHTML(input: PrintReceiptInput): string {
    const formatMoney = (amount: number) => {
      return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
      }).format(amount);
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Receipt - ${input.transaction_id}</title>
        <style>
          @media print {
            @page { margin: 0; size: 80mm auto; }
            body { margin: 0; padding: 10mm; }
          }
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            max-width: 80mm;
            margin: 0 auto;
          }
          .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
          .header h2 { margin: 0; font-size: 16px; }
          .header p { margin: 2px 0; font-size: 11px; }
          .info { margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
          .info p { margin: 2px 0; }
          .items { margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
          .item { margin-bottom: 5px; }
          .item-name { font-weight: bold; }
          .item-details { display: flex; justify-content: space-between; font-size: 11px; }
          .totals { margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
          .totals-row { display: flex; justify-content: space-between; margin: 3px 0; }
          .totals-row.grand { font-weight: bold; font-size: 14px; margin-top: 5px; }
          .payments { margin-bottom: 10px; }
          .payment-row { display: flex; justify-content: space-between; margin: 3px 0; }
          .footer { text-align: center; margin-top: 10px; font-size: 11px; }
          .no-print { display: block; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>${input.outlet_name}</h2>
          ${input.outlet_address ? `<p>${input.outlet_address}</p>` : ""}
          ${input.outlet_phone ? `<p>Tel: ${input.outlet_phone}</p>` : ""}
        </div>
        
        <div class="info">
          <p><strong>Receipt #:</strong> ${input.transaction_id}</p>
          <p><strong>Date:</strong> ${new Date(input.transaction_date).toLocaleString("id-ID")}</p>
          ${input.cashier_name ? `<p><strong>Cashier:</strong> ${input.cashier_name}</p>` : ""}
        </div>
        
        <div class="items">
          ${input.items.map(item => `
            <div class="item">
              <div class="item-name">${item.name}</div>
              <div class="item-details">
                <span>${item.quantity} x ${formatMoney(item.unit_price)}</span>
                <span>${formatMoney(item.line_total)}</span>
              </div>
              ${item.discount_amount > 0 ? `
                <div class="item-details">
                  <span>  Discount</span>
                  <span>-${formatMoney(item.discount_amount)}</span>
                </div>
              ` : ""}
            </div>
          `).join("")}
        </div>
        
        <div class="totals">
          <div class="totals-row">
            <span>Subtotal:</span>
            <span>${formatMoney(input.totals.subtotal)}</span>
          </div>
          ${input.totals.discount_total > 0 ? `
            <div class="totals-row">
              <span>Discount:</span>
              <span>-${formatMoney(input.totals.discount_total)}</span>
            </div>
          ` : ""}
          ${input.totals.tax_total > 0 ? `
            <div class="totals-row">
              <span>Tax:</span>
              <span>${formatMoney(input.totals.tax_total)}</span>
            </div>
          ` : ""}
          <div class="totals-row grand">
            <span>TOTAL:</span>
            <span>${formatMoney(input.totals.grand_total)}</span>
          </div>
        </div>
        
        <div class="payments">
          ${input.payments.map(payment => `
            <div class="payment-row">
              <span>${payment.method}:</span>
              <span>${formatMoney(payment.amount)}</span>
            </div>
          `).join("")}
          ${input.totals.change_total > 0 ? `
            <div class="payment-row">
              <span>Change:</span>
              <span>${formatMoney(input.totals.change_total)}</span>
            </div>
          ` : ""}
        </div>
        
        ${input.footer_note ? `
          <div class="footer">
            <p>${input.footer_note}</p>
          </div>
        ` : ""}
        
        <div class="footer">
          <p>Thank you for your purchase!</p>
        </div>
        
        <div class="no-print" style="margin-top: 20px; text-align: center;">
          <button onclick="window.print()" style="padding: 10px 20px; font-size: 14px; cursor: pointer;">
            Print Receipt
          </button>
          <button onclick="window.close()" style="padding: 10px 20px; font-size: 14px; cursor: pointer; margin-left: 10px;">
            Close
          </button>
        </div>
      </body>
      </html>
    `;
  }

  private generateInvoiceHTML(input: PrintInvoiceInput): string {
    // Similar to receipt but with more formal invoice formatting
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Invoice - ${input.invoice_number}</title>
        <style>
          @media print {
            @page { margin: 20mm; size: A4; }
          }
          body {
            font-family: Arial, sans-serif;
            font-size: 12px;
            margin: 0;
            padding: 20px;
          }
          .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
          .header h1 { margin: 0; font-size: 28px; }
          .company-info, .customer-info { margin-bottom: 20px; }
          .info-label { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f5f5f5; font-weight: bold; }
          .text-right { text-align: right; }
          .totals { margin-left: auto; width: 300px; }
          .totals-row { display: flex; justify-content: space-between; padding: 5px 0; }
          .totals-row.grand { font-weight: bold; font-size: 16px; border-top: 2px solid #000; margin-top: 10px; padding-top: 10px; }
          .footer { margin-top: 50px; font-size: 11px; color: #666; }
          .no-print { display: block; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>INVOICE</h1>
            <p><strong>${input.invoice_number}</strong></p>
          </div>
          <div class="company-info">
            <p><strong>${input.company_name}</strong></p>
            ${input.company_address ? `<p>${input.company_address}</p>` : ""}
            ${input.company_phone ? `<p>Phone: ${input.company_phone}</p>` : ""}
            ${input.company_tax_id ? `<p>Tax ID: ${input.company_tax_id}</p>` : ""}
          </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div>
            <p><span class="info-label">Invoice Date:</span> ${input.invoice_date}</p>
            ${input.due_date ? `<p><span class="info-label">Due Date:</span> ${input.due_date}</p>` : ""}
            ${input.payment_status ? `<p><span class="info-label">Status:</span> ${input.payment_status}</p>` : ""}
          </div>
          ${input.customer_name ? `
            <div class="customer-info">
              <p class="info-label">Bill To:</p>
              <p><strong>${input.customer_name}</strong></p>
              ${input.customer_address ? `<p>${input.customer_address}</p>` : ""}
              ${input.customer_phone ? `<p>Phone: ${input.customer_phone}</p>` : ""}
              ${input.customer_tax_id ? `<p>Tax ID: ${input.customer_tax_id}</p>` : ""}
            </div>
          ` : ""}
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Discount</th>
              <th class="text-right">Tax</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${input.items.map(item => `
              <tr>
                <td>${item.description}</td>
                <td class="text-right">${item.quantity}</td>
                <td class="text-right">${item.unit_price.toFixed(2)}</td>
                <td class="text-right">${item.discount_amount.toFixed(2)}</td>
                <td class="text-right">${item.tax_amount.toFixed(2)}</td>
                <td class="text-right"><strong>${item.line_total.toFixed(2)}</strong></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        
        <div class="totals">
          <div class="totals-row">
            <span>Subtotal:</span>
            <span>${input.totals.subtotal.toFixed(2)}</span>
          </div>
          ${input.totals.discount_total > 0 ? `
            <div class="totals-row">
              <span>Discount:</span>
              <span>-${input.totals.discount_total.toFixed(2)}</span>
            </div>
          ` : ""}
          ${input.totals.tax_total > 0 ? `
            <div class="totals-row">
              <span>Tax:</span>
              <span>${input.totals.tax_total.toFixed(2)}</span>
            </div>
          ` : ""}
          <div class="totals-row grand">
            <span>TOTAL:</span>
            <span>${input.totals.grand_total.toFixed(2)}</span>
          </div>
        </div>
        
        ${input.notes ? `
          <div style="margin-top: 30px;">
            <p class="info-label">Notes:</p>
            <p>${input.notes}</p>
          </div>
        ` : ""}
        
        ${input.payment_terms ? `
          <div class="footer">
            <p><strong>Payment Terms:</strong> ${input.payment_terms}</p>
          </div>
        ` : ""}
        
        <div class="no-print" style="margin-top: 30px; text-align: center;">
          <button onclick="window.print()" style="padding: 10px 20px; font-size: 14px; cursor: pointer;">
            Print Invoice
          </button>
          <button onclick="window.close()" style="padding: 10px 20px; font-size: 14px; cursor: pointer; margin-left: 10px;">
            Close
          </button>
        </div>
      </body>
      </html>
    `;
  }

  private generateReportHTML(input: PrintReportInput): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${input.title}</title>
        <style>
          @media print {
            @page { margin: 20mm; size: A4 landscape; }
          }
          body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 20px; }
          h1 { margin: 0 0 10px 0; font-size: 20px; }
          .date-range { margin-bottom: 20px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { padding: 8px; text-align: left; border: 1px solid #ddd; }
          th { background-color: #f5f5f5; font-weight: bold; }
          .summary { margin-top: 20px; }
          .summary-row { display: flex; justify-content: space-between; padding: 5px 0; max-width: 400px; margin-left: auto; }
          .summary-row.total { font-weight: bold; border-top: 2px solid #000; margin-top: 10px; padding-top: 10px; }
          .no-print { display: block; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <h1>${input.title}</h1>
        ${input.date_range ? `
          <p class="date-range">Period: ${input.date_range.from} to ${input.date_range.to}</p>
        ` : ""}
        
        <table>
          <thead>
            <tr>
              ${input.headers.map(header => `<th>${header}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${input.rows.map(row => `
              <tr>
                ${row.map(cell => `<td>${cell}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
        
        ${input.summary ? `
          <div class="summary">
            ${input.summary.map((item, index) => `
              <div class="summary-row ${index === input.summary!.length - 1 ? "total" : ""}">
                <span>${item.label}:</span>
                <span>${item.value}</span>
              </div>
            `).join("")}
          </div>
        ` : ""}
        
        <div class="no-print" style="margin-top: 30px; text-align: center;">
          <button onclick="window.print()" style="padding: 10px 20px; font-size: 14px; cursor: pointer;">
            Print Report
          </button>
          <button onclick="window.close()" style="padding: 10px 20px; font-size: 14px; cursor: pointer; margin-left: 10px;">
            Close
          </button>
        </div>
      </body>
      </html>
    `;
  }

  private async printHTML(html: string, options?: Partial<PrintOptions>): Promise<void> {
    // Open a new window with the HTML
    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (!printWindow) {
      throw new Error("Failed to open print window. Popup may be blocked.");
    }

    printWindow.document.write(html);
    printWindow.document.close();

    // Wait for content to load
    await new Promise<void>((resolve) => {
      printWindow.onload = () => resolve();
      // Fallback timeout
      setTimeout(resolve, 500);
    });

    if (options?.output_mode === "preview") {
      // Just show the preview, don't auto-print
      return;
    }

    // Trigger print dialog
    printWindow.print();

    // Close window after printing (or if cancelled)
    setTimeout(() => {
      printWindow.close();
    }, 100);
  }
}

export function createWebPrinterAdapter(): PrinterPort {
  return new WebPrinterAdapter();
}
