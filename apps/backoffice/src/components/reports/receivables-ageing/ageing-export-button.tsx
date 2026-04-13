// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Button } from "@mantine/core";
import { IconFileTypeCsv } from "@tabler/icons-react";
import { useState } from "react";

import type { AggregatedCustomer, ReceivablesAgeingReport } from "../../../types/reports/receivables-ageing";

interface AgeingExportButtonProps {
  report: ReceivablesAgeingReport | null;
  customers: AggregatedCustomer[];
  asOfDate: string;
  outletName?: string;
  isLoading?: boolean;
}

/**
 * Export receivables ageing report to CSV
 */
export function AgeingExportButton({
  report,
  customers,
  asOfDate,
  outletName = "All",
  isLoading,
}: AgeingExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!report || customers.length === 0) return;

    setExporting(true);
    try {
      // Get current timestamp for generation time
      const generatedAt = new Date().toISOString();

      // Build CSV content with metadata header
      const metadataRows: string[][] = [
        ["Receivables Ageing Report"],
        [`As-of Date,${asOfDate}`],
        [`Generated,${generatedAt}`],
        [`Outlet,${outletName}`],
        [""],
      ];

      const headers: string[][] = [
        [
          "Customer",
          "Current",
          "1-30 Days",
          "31-60 Days",
          "61-90 Days",
          "90+ Days",
          "Total Outstanding",
        ],
      ];

      const rows = customers.map((customer) => [
        customer.customer_name,
        customer.current.toFixed(2),
        customer.bucket_1_30.toFixed(2),
        customer.bucket_31_60.toFixed(2),
        customer.bucket_61_90.toFixed(2),
        customer.bucket_90_plus.toFixed(2),
        customer.total_outstanding.toFixed(2),
      ]);

      // Add grand totals
      const grandTotals = customers.reduce(
        (acc, customer) => ({
          current: acc.current + customer.current,
          bucket_1_30: acc.bucket_1_30 + customer.bucket_1_30,
          bucket_31_60: acc.bucket_31_60 + customer.bucket_31_60,
          bucket_61_90: acc.bucket_61_90 + customer.bucket_61_90,
          bucket_90_plus: acc.bucket_90_plus + customer.bucket_90_plus,
          total_outstanding: acc.total_outstanding + customer.total_outstanding,
        }),
        { current: 0, bucket_1_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0, total_outstanding: 0 }
      );

      rows.push([
        "GRAND TOTAL",
        grandTotals.current.toFixed(2),
        grandTotals.bucket_1_30.toFixed(2),
        grandTotals.bucket_31_60.toFixed(2),
        grandTotals.bucket_61_90.toFixed(2),
        grandTotals.bucket_90_plus.toFixed(2),
        grandTotals.total_outstanding.toFixed(2),
      ]);

      // Combine metadata and data
      const allRows = [...metadataRows, headers, ...rows];

      // CSV content with BOM for Excel compatibility
      const BOM = "\uFEFF";
      const csvContent = BOM + allRows.map((row) => row.join(",")).join("\n");

      // Create download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `receivables-ageing-${asOfDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      variant="light"
      leftSection={<IconFileTypeCsv size={16} />}
      onClick={handleExport}
      loading={exporting || isLoading}
      disabled={!report || customers.length === 0}
    >
      Export CSV
    </Button>
  );
}