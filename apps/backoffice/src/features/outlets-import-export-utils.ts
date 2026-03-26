// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { rowsToCsv, downloadCsv } from "../lib/import/csv";
import { parseDelimited as parseDelimitedShared } from "../lib/import/delimited";

export type NormalizedOutletRow = {
  code: string | null;
  name: string;
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
};

export type ValidationError = {
  row: number;
  field: string;
  message: string;
};

export type ImportAction = "CREATE" | "ERROR";

export type ImportPlanRow = {
  rowIndex: number;
  original: NormalizedOutletRow;
  action: ImportAction;
  error?: string;
};

export type ImportSummary = {
  create: number;
  error: number;
  total: number;
};

export type ApplyResult = {
  rowIndex: number;
  action: ImportAction;
  success: boolean;
  outletId?: number;
  error?: string;
};

export type OutletForImport = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  is_active: boolean;
  updated_at: string;
};

export const parseDelimited = parseDelimitedShared;

const HEADER_ALIASES: Record<string, keyof NormalizedOutletRow> = {
  code: "code",
  kode: "code",
  branch_code: "code",
  name: "name",
  branch_name: "name",
  nama: "name",
  "nama cabang": "name",
  city: "city",
  kota: "city",
  address_line1: "address_line1",
  alamat: "address_line1",
  address_line2: "address_line2",
  alamat2: "address_line2",
  postal_code: "postal_code",
  kode_pos: "postal_code",
  zip: "postal_code",
  phone: "phone",
  telephone: "phone",
  telp: "phone",
  email: "email",
  email_address: "email",
  timezone: "timezone",
  zona_waktu: "timezone"
};

export function normalizeHeaderName(name: string): keyof NormalizedOutletRow | null {
  const normalized = name.toLowerCase().trim();
  return HEADER_ALIASES[normalized] || null;
}

export type NormalizedOutletRowWithRaw = NormalizedOutletRow;

export function normalizeImportRow(cells: string[], header: string[]): NormalizedOutletRowWithRaw {
  const row: NormalizedOutletRowWithRaw = {
    code: null,
    name: "",
    city: null,
    address_line1: null,
    address_line2: null,
    postal_code: null,
    phone: null,
    email: null,
    timezone: null
  };

  header.forEach((colName, idx) => {
    const field = normalizeHeaderName(colName);
    const value = cells[idx]?.trim() ?? "";

    switch (field) {
      case "code":
        row.code = value || null;
        break;
      case "name":
        row.name = value;
        break;
      case "city":
        row.city = value || null;
        break;
      case "address_line1":
        row.address_line1 = value || null;
        break;
      case "address_line2":
        row.address_line2 = value || null;
        break;
      case "postal_code":
        row.postal_code = value || null;
        break;
      case "phone":
        row.phone = value || null;
        break;
      case "email":
        row.email = value || null;
        break;
      case "timezone":
        row.timezone = value || null;
        break;
    }
  });

  return row;
}

export function validateImportRows(rows: NormalizedOutletRowWithRaw[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const maxNameLength = 191;
  const maxCodeLength = 32;
  const maxCityLength = 96;
  const maxAddressLength = 191;
  const maxPostalLength = 20;
  const maxPhoneLength = 32;
  const maxEmailLength = 191;
  const maxTimezoneLength = 64;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const seenCode = new Set<string>();

  rows.forEach((row, idx) => {
    if (!row.name?.trim()) {
      errors.push({
        row: idx,
        field: "name",
        message: "Name is required"
      });
    }

    if (!row.code?.trim()) {
      errors.push({
        row: idx,
        field: "code",
        message: "Code is required"
      });
    }

    if (row.name && row.name.length > maxNameLength) {
      errors.push({
        row: idx,
        field: "name",
        message: `Name exceeds ${maxNameLength} characters`
      });
    }

    if (row.code && row.code.length > maxCodeLength) {
      errors.push({
        row: idx,
        field: "code",
        message: `Code exceeds ${maxCodeLength} characters`
      });
    }

    if (row.city && row.city.length > maxCityLength) {
      errors.push({
        row: idx,
        field: "city",
        message: `City exceeds ${maxCityLength} characters`
      });
    }

    if (row.address_line1 && row.address_line1.length > maxAddressLength) {
      errors.push({
        row: idx,
        field: "address_line1",
        message: `Address line 1 exceeds ${maxAddressLength} characters`
      });
    }

    if (row.address_line2 && row.address_line2.length > maxAddressLength) {
      errors.push({
        row: idx,
        field: "address_line2",
        message: `Address line 2 exceeds ${maxAddressLength} characters`
      });
    }

    if (row.postal_code && row.postal_code.length > maxPostalLength) {
      errors.push({
        row: idx,
        field: "postal_code",
        message: `Postal code exceeds ${maxPostalLength} characters`
      });
    }

    if (row.phone && row.phone.length > maxPhoneLength) {
      errors.push({
        row: idx,
        field: "phone",
        message: `Phone exceeds ${maxPhoneLength} characters`
      });
    }

    if (row.email && row.email.length > maxEmailLength) {
      errors.push({
        row: idx,
        field: "email",
        message: `Email exceeds ${maxEmailLength} characters`
      });
    }

    if (row.email && !emailRegex.test(row.email)) {
      errors.push({
        row: idx,
        field: "email",
        message: "Invalid email format"
      });
    }

    if (row.timezone && row.timezone.length > maxTimezoneLength) {
      errors.push({
        row: idx,
        field: "timezone",
        message: `Timezone exceeds ${maxTimezoneLength} characters`
      });
    }

    if (row.code) {
      const codeKey = row.code.toLowerCase();
      if (seenCode.has(codeKey)) {
        errors.push({
          row: idx,
          field: "code",
          message: "Duplicate code in import file"
        });
      }
      seenCode.add(codeKey);
    }
  });

  return errors;
}

export function buildImportPlan(
  rows: NormalizedOutletRowWithRaw[],
  existingOutlets: OutletForImport[]
): ImportPlanRow[] {
  const codeMap = new Map<string, OutletForImport>();
  existingOutlets.forEach((outlet) => {
    if (outlet.code) {
      codeMap.set(outlet.code.toLowerCase(), outlet);
    }
  });

  const validationErrors = validateImportRows(rows);
  const validationErrorByRow = new Map<number, ValidationError>();
  validationErrors.forEach((err) => {
    if (!validationErrorByRow.has(err.row)) {
      validationErrorByRow.set(err.row, err);
    }
  });

  return rows.map((row, idx) => {
    const rowError = validationErrorByRow.get(idx);
    if (rowError) {
      return {
        rowIndex: idx,
        original: row,
        action: "ERROR" as ImportAction,
        error: rowError.message
      };
    }

    if (row.code && codeMap.has(row.code.toLowerCase())) {
      return {
        rowIndex: idx,
        original: row,
        action: "ERROR" as ImportAction,
        error: `Code already exists: ${row.code}`
      };
    }

    return {
      rowIndex: idx,
      original: row,
      action: "CREATE" as ImportAction
    };
  });
}

export function computeImportSummary(plan: ImportPlanRow[]): ImportSummary {
  const summary: ImportSummary = {
    create: 0,
    error: 0,
    total: plan.length
  };

  plan.forEach((row) => {
    switch (row.action) {
      case "CREATE":
        summary.create++;
        break;
      case "ERROR":
        summary.error++;
        break;
    }
  });

  return summary;
}

export type OutletExportRow = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  is_active: boolean;
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  updated_at: string;
};

export function buildOutletsCsv(outlets: OutletExportRow[]): string {
  const headers = [
    "id",
    "company_id",
    "code",
    "name",
    "is_active",
    "city",
    "address_line1",
    "address_line2",
    "postal_code",
    "phone",
    "email",
    "timezone",
    "updated_at"
  ];
  const rows = outlets.map((outlet) => [
    outlet.id,
    outlet.company_id,
    outlet.code,
    outlet.name,
    outlet.is_active ? "true" : "false",
    outlet.city ?? "",
    outlet.address_line1 ?? "",
    outlet.address_line2 ?? "",
    outlet.postal_code ?? "",
    outlet.phone ?? "",
    outlet.email ?? "",
    outlet.timezone ?? "",
    outlet.updated_at
  ]);
  return rowsToCsv(headers, rows);
}

export function downloadOutletsCsv(outlets: OutletExportRow[], companyId?: number): void {
  const csv = buildOutletsCsv(outlets);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const companyPart = companyId ? `-${companyId}` : "";
  downloadCsv(csv, `outlets${companyPart}-${date}.csv`);
}
