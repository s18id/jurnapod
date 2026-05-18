// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ApplyResult, ValidationResult } from "../../hooks/use-import";

type CsvRow = Array<string | number | boolean | null | undefined>;

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowsToCsv(rows: CsvRow[]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

export function generateApplyErrorCsv(result: Pick<ApplyResult, "errors">): string {
  const rows: CsvRow[] = [["row", "error", "field_values"]];
  for (const error of result.errors) {
    rows.push([
      error.row,
      error.error ?? error.message ?? "Import failed",
      error.values ? JSON.stringify(error.values) : "",
    ]);
  }
  return rowsToCsv(rows);
}

export function generateValidationErrorCsv(
  validationResult: Pick<ValidationResult, "errors">
): string {
  const rows: CsvRow[] = [["row", "column", "value", "error"]];
  for (const error of validationResult.errors) {
    rows.push([error.row, error.column, error.value, error.message]);
  }
  return rowsToCsv(rows);
}

export function downloadCsvFile(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
