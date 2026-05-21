// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  GeneralLedgerAccountDetail,
  ReceivablesAgeingResult,
  TrialBalanceResultRow,
} from "@jurnapod/modules-reporting";
import type { APAgingSummary } from "@jurnapod/modules-purchasing";

type CsvCellValue = string | number | boolean | null | undefined;
type CsvTextCell = { value: CsvCellValue; protectFormula: true };
type CsvCell = CsvCellValue | CsvTextCell;

export type TrialBalanceCsvTotals = {
  total_debit: number;
  total_credit: number;
  balance: number;
};

function isCsvTextCell(value: CsvCell): value is CsvTextCell {
  return typeof value === "object" && value !== null && "protectFormula" in value;
}

function protectFormulaText(text: string): string {
  if (!/^[=+\-@]/.test(text)) return text;
  if (/^-?\d+(\.\d+)?$/.test(text)) return text;
  return `'${text}`;
}

function textCell(value: CsvCellValue): CsvTextCell {
  return { value, protectFormula: true };
}

export function escapeCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  const rawValue = isCsvTextCell(value) ? value.value : value;
  if (rawValue === null || rawValue === undefined) return "";
  const text = typeof rawValue === "string" ? protectFormulaText(rawValue) : String(rawValue);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsvContent(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n") + "\n";
}

export function buildReportCsvFilename(prefix: string, datePart: string): string {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : "report";
  return `${prefix}-${safeDate}.csv`;
}

export function trialBalanceToCsv(rows: TrialBalanceResultRow[], totals: TrialBalanceCsvTotals): string {
  return buildCsvContent(
    ["account_id", "account_code", "account_name", "total_debit", "total_credit", "balance"],
    [
      ...rows.map((row) => [
        row.account_id,
        textCell(row.account_code),
        textCell(row.account_name),
        row.total_debit,
        row.total_credit,
        row.balance,
      ]),
      ["", "", "TOTAL", totals.total_debit, totals.total_credit, totals.balance],
    ]
  );
}

export function generalLedgerToCsv(accounts: GeneralLedgerAccountDetail[]): string {
  const rows = accounts.flatMap((account) => {
    if (account.lines.length === 0) {
      return [[
        account.account_id,
        textCell(account.account_code),
        textCell(account.account_name),
        textCell(account.report_group),
        textCell(account.normal_balance),
        account.opening_debit,
        account.opening_credit,
        account.period_debit,
        account.period_credit,
        account.opening_balance,
        account.ending_balance,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ]];
    }

    return account.lines.map((line) => [
      account.account_id,
      textCell(account.account_code),
      textCell(account.account_name),
      textCell(account.report_group),
      textCell(account.normal_balance),
      account.opening_debit,
      account.opening_credit,
      account.period_debit,
      account.period_credit,
      account.opening_balance,
      account.ending_balance,
      line.line_id,
      line.line_date,
      textCell(line.description),
      line.debit,
      line.credit,
      line.balance,
      line.outlet_id,
      textCell(line.outlet_name),
      line.journal_batch_id,
      textCell(line.doc_type),
      line.doc_id,
      line.posted_at,
    ]);
  });

  return buildCsvContent(
    [
      "account_id",
      "account_code",
      "account_name",
      "report_group",
      "normal_balance",
      "opening_debit",
      "opening_credit",
      "period_debit",
      "period_credit",
      "opening_balance",
      "ending_balance",
      "line_id",
      "line_date",
      "description",
      "debit",
      "credit",
      "running_balance",
      "outlet_id",
      "outlet_name",
      "journal_batch_id",
      "doc_type",
      "doc_id",
      "posted_at",
    ],
    rows
  );
}

export function receivablesAgeingToCsv(report: ReceivablesAgeingResult): string {
  return buildCsvContent(
    [
      "invoice_id",
      "invoice_no",
      "customer_id",
      "customer_code",
      "customer_display_name",
      "outlet_id",
      "outlet_name",
      "invoice_date",
      "due_date",
      "days_overdue",
      "age_bucket",
      "outstanding_amount",
      "overdue",
    ],
    [
      ...report.invoices.map((invoice) => [
        invoice.invoice_id,
        textCell(invoice.invoice_no),
        invoice.customer_id,
        textCell(invoice.customer_code),
        textCell(invoice.customer_display_name),
        invoice.outlet_id,
        textCell(invoice.outlet_name),
        invoice.invoice_date,
        invoice.due_date,
        invoice.days_overdue,
        textCell(invoice.age_bucket),
        invoice.outstanding_amount,
        invoice.overdue,
      ]),
      ["", "", "", "", "TOTAL", "", "", "", "", "", "", report.total_outstanding, ""],
    ]
  );
}

export function apAgingToCsv(report: APAgingSummary): string {
  return buildCsvContent(
    [
      "supplier_id",
      "supplier_name",
      "currency",
      "total_open_amount",
      "base_open_amount",
      "current",
      "due_1_30",
      "due_31_60",
      "due_61_90",
      "due_over_90",
      "exchange_rate_note",
    ],
    [
      ...report.suppliers.map((supplier) => [
        supplier.supplier_id,
        textCell(supplier.supplier_name),
        textCell(supplier.currency),
        supplier.total_open_amount,
        supplier.base_open_amount,
        supplier.buckets.current,
        supplier.buckets.due_1_30,
        supplier.buckets.due_31_60,
        supplier.buckets.due_61_90,
        supplier.buckets.due_over_90,
        textCell(supplier.exchange_rate_note),
      ]),
      [
        "",
        "GRAND TOTAL",
        "BASE",
        "",
        report.grand_totals.base_open_amount,
        report.grand_totals.buckets.current,
        report.grand_totals.buckets.due_1_30,
        report.grand_totals.buckets.due_31_60,
        report.grand_totals.buckets.due_61_90,
        report.grand_totals.buckets.due_over_90,
        "",
      ],
    ]
  );
}
