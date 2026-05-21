// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, expect, it } from "vitest";

import {
  apAgingToCsv,
  buildReportCsvFilename,
  escapeCsvCell,
  receivablesAgeingToCsv,
  trialBalanceToCsv,
} from "@/lib/reports/csv-export";

describe("reports.csv-export", () => {
  it("escapes commas, quotes, and newlines", () => {
    expect(escapeCsvCell('ACME, "North"\nBranch')).toBe('"ACME, ""North""\nBranch"');
    expect(escapeCsvCell(null)).toBe("");
  });

  it("hardens formula-leading text without corrupting numeric amount strings", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("+SUM(A1:A2)")).toBe("'+SUM(A1:A2)");
    expect(escapeCsvCell("-not-a-number")).toBe("'-not-a-number");
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");
    expect(escapeCsvCell("-123.4500")).toBe("-123.4500");
  });

  it("builds deterministic report filenames", () => {
    expect(buildReportCsvFilename("trial-balance", "2026-05-21")).toBe("trial-balance-2026-05-21.csv");
    expect(buildReportCsvFilename("trial-balance", "bad/date")).toBe("trial-balance-report.csv");
  });

  it("serializes trial balance rows with totals", () => {
    const csv = trialBalanceToCsv([
      {
        account_id: 10,
        account_code: "1000",
        account_name: "=Cash, Bank",
        total_debit: 100,
        total_credit: 0,
        balance: 100,
      },
    ], { total_debit: 100, total_credit: 0, balance: 100 });

    expect(csv).toContain("account_id,account_code,account_name,total_debit,total_credit,balance");
    expect(csv).toContain('10,1000,"\'=Cash, Bank",100,0,100');
    expect(csv).toContain(",,TOTAL,100,0,100");
  });

  it("serializes receivables ageing with customer_display_name", () => {
    const csv = receivablesAgeingToCsv({
      buckets: { current: 0, "1_30_days": 50, "31_60_days": 0, "61_90_days": 0, over_90_days: 0 },
      total_outstanding: 50,
      invoices: [{
        invoice_id: 1,
        invoice_no: "SI-1",
        outlet_id: 2,
        outlet_name: "Main",
        invoice_date: "2026-05-01",
        due_date: "2026-05-10",
        days_overdue: 11,
        outstanding_amount: 50,
        age_bucket: "1_30_days",
        customer_id: 3,
        customer_code: "C-1",
        customer_type: 1,
        customer_display_name: "ACME",
        overdue: true,
      }],
    });

    expect(csv).toContain("customer_display_name");
    expect(csv).toContain("1,SI-1,3,C-1,ACME");
  });

  it("serializes AP aging supplier rows and grand totals", () => {
    const csv = apAgingToCsv({
      as_of_date: "2026-05-21",
      suppliers: [{
        supplier_id: 7,
        supplier_name: "Supplier A",
        currency: "IDR",
        total_open_amount: "100.0000",
        base_open_amount: "100.0000",
        exchange_rate_note: "base currency",
        buckets: { current: "0.0000", due_1_30: "100.0000", due_31_60: "0.0000", due_61_90: "0.0000", due_over_90: "0.0000" },
      }],
      grand_totals: {
        base_open_amount: "100.0000",
        buckets: { current: "0.0000", due_1_30: "100.0000", due_31_60: "0.0000", due_61_90: "0.0000", due_over_90: "0.0000" },
        currency_totals: [{ currency: "IDR", total_open_amount: "100.0000" }],
      },
    });

    expect(csv).toContain("supplier_id,supplier_name,currency,total_open_amount");
    expect(csv).toContain("7,Supplier A,IDR,100.0000");
    expect(csv).toContain(",GRAND TOTAL,BASE,,100.0000");
  });
});
