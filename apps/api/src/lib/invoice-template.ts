type InvoiceData = {
  id: number;
  invoice_no: string;
  invoice_date: string;
  status: string;
  payment_status: string;
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  paid_total: number;
  lines: Array<{
    line_no: number;
    description: string;
    qty: number;
    unit_price: number;
    line_total: number;
  }>;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

export function generateInvoiceHTML(invoice: InvoiceData): string {
  const linesHTML = invoice.lines
    .map(
      (line) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: center;">${line.line_no}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${line.description}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: right;">${line.qty}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: right;">${formatCurrency(line.unit_price)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: right;">${formatCurrency(line.line_total)}</td>
      </tr>
    `
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoice_no}</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 800px;
      margin: 20px auto;
      padding: 20px;
      line-height: 1.6;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #333;
      padding-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      color: #333;
    }
    .header p {
      margin: 5px 0;
      color: #666;
    }
    .invoice-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .invoice-info div {
      flex: 1;
    }
    .invoice-info strong {
      display: inline-block;
      width: 120px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background-color: #f5f5f5;
      padding: 12px 8px;
      text-align: left;
      border-bottom: 2px solid #333;
    }
    th.text-right, td.text-right {
      text-align: right;
    }
    .summary {
      margin-left: auto;
      width: 300px;
      border-top: 2px solid #333;
      padding-top: 10px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
    }
    .summary-row.total {
      font-weight: bold;
      font-size: 18px;
      border-top: 2px solid #333;
      padding-top: 10px;
      margin-top: 10px;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
    }
    .badge-posted {
      background-color: #4caf50;
      color: white;
    }
    .badge-draft {
      background-color: #ff9800;
      color: white;
    }
    .badge-paid {
      background-color: #2196f3;
      color: white;
    }
    .badge-unpaid {
      background-color: #f44336;
      color: white;
    }
    .badge-partial {
      background-color: #ff9800;
      color: white;
    }
    .actions {
      margin-top: 30px;
      text-align: center;
    }
    .btn {
      display: inline-block;
      padding: 10px 20px;
      margin: 0 5px;
      background-color: #2196f3;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-size: 14px;
    }
    .btn:hover {
      background-color: #1976d2;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>INVOICE</h1>
    <p>Sales Invoice / Faktur Penjualan Jasa</p>
  </div>

  <div class="invoice-info">
    <div>
      <p><strong>Invoice No:</strong> ${invoice.invoice_no}</p>
      <p><strong>Date:</strong> ${invoice.invoice_date}</p>
    </div>
    <div>
      <p><strong>Status:</strong> <span class="badge badge-${invoice.status.toLowerCase()}">${invoice.status}</span></p>
      <p><strong>Payment:</strong> <span class="badge badge-${invoice.payment_status.toLowerCase()}">${invoice.payment_status}</span></p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 50px; text-align: center;">No</th>
        <th>Description</th>
        <th class="text-right" style="width: 80px;">Qty</th>
        <th class="text-right" style="width: 120px;">Unit Price</th>
        <th class="text-right" style="width: 150px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${linesHTML}
    </tbody>
  </table>

  <div class="summary">
    <div class="summary-row">
      <span>Subtotal:</span>
      <span>${formatCurrency(invoice.subtotal)}</span>
    </div>
    ${
      invoice.tax_amount > 0
        ? `
    <div class="summary-row">
      <span>Tax:</span>
      <span>${formatCurrency(invoice.tax_amount)}</span>
    </div>
    `
        : ""
    }
    <div class="summary-row total">
      <span>Grand Total:</span>
      <span>${formatCurrency(invoice.grand_total)}</span>
    </div>
    ${
      invoice.paid_total > 0
        ? `
    <div class="summary-row">
      <span>Paid:</span>
      <span>${formatCurrency(invoice.paid_total)}</span>
    </div>
    <div class="summary-row">
      <span>Outstanding:</span>
      <span>${formatCurrency(invoice.grand_total - invoice.paid_total)}</span>
    </div>
    `
        : ""
    }
  </div>

  <div class="actions no-print">
    <button class="btn" onclick="window.print()">Print</button>
  </div>
</body>
</html>
  `.trim();
}
