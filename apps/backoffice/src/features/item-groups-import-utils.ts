// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export type NormalizedItemGroupRow = {
  code: string | null;
  name: string;
  parent_code: string | null;
  is_active: boolean;
};

export type ValidationError = {
  row: number;
  field: string;
  message: string;
};

export type ImportAction = "CREATE" | "ERROR";

export type ImportPlanRow = {
  rowIndex: number;
  original: NormalizedItemGroupRow;
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
  groupId?: number;
  error?: string;
};

type ItemGroup = {
  id: number;
  company_id: number;
  parent_id: number | null;
  code: string | null;
  name: string;
  is_active: boolean;
  updated_at: string;
};

export function parseDelimited(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;

  let delimiter = ",";
  if (tabCount > commaCount && tabCount > semicolonCount) {
    delimiter = "\t";
  } else if (semicolonCount > commaCount && semicolonCount > tabCount) {
    delimiter = ";";
  }

  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

const HEADER_ALIASES: Record<string, "code" | "name" | "parent_code" | "is_active"> = {
  code: "code",
  kode: "code",
  group_code: "code",
  name: "name",
  group_name: "name",
  nama: "name",
  "nama grup": "name",
  parent_code: "parent_code",
  parent: "parent_code",
  kode_parent: "parent_code",
  "kode parent": "parent_code",
  is_active: "is_active",
  active: "is_active",
  status: "is_active",
  aktif: "is_active"
};

export function normalizeHeaderName(name: string): "code" | "name" | "parent_code" | "is_active" | null {
  const normalized = name.toLowerCase().trim();
  return HEADER_ALIASES[normalized] || null;
}

export function toBoolean(value: string): boolean | null {
  const v = value.toLowerCase().trim();
  if (v === "" || v === "true" || v === "1" || v === "yes" || v === "y" || v === "aktif" || v === "active") {
    return true;
  }
  if (v === "false" || v === "0" || v === "no" || v === "n" || v === "nonaktif" || v === "inactive") {
    return false;
  }
  return null;
}

export type NormalizedItemGroupRowWithRaw = NormalizedItemGroupRow & {
  is_active_raw: string;
};

export function normalizeImportRow(cells: string[], header: string[]): NormalizedItemGroupRowWithRaw {
  const row: NormalizedItemGroupRowWithRaw = {
    code: null,
    name: "",
    parent_code: null,
    is_active: true,
    is_active_raw: ""
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
      case "parent_code":
        row.parent_code = value || null;
        break;
      case "is_active":
        row.is_active_raw = value;
        const parsed = toBoolean(value);
        row.is_active = parsed ?? true;
        break;
    }
  });

  return row;
}

export function validateImportRows(rows: NormalizedItemGroupRowWithRaw[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const maxNameLength = 191;
  const maxCodeLength = 64;

  const seenCode = new Set<string>();

  rows.forEach((row, idx) => {
    if (!row.name.trim()) {
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

    if (row.name.length > maxNameLength) {
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

    if (row.is_active_raw && toBoolean(row.is_active_raw) === null) {
      errors.push({
        row: idx,
        field: "is_active",
        message: "Invalid is_active value. Use true/false/1/0/yes/no."
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
  rows: NormalizedItemGroupRowWithRaw[],
  existingItemGroups: ItemGroup[]
): ImportPlanRow[] {
  const codeMap = new Map<string, ItemGroup>();
  existingItemGroups.forEach((group) => {
    if (group.code) {
      codeMap.set(group.code.toLowerCase(), group);
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

export function escapeCsvCell(value: string): string {
  if (value == null) return "";
  const stringValue = String(value);
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n") || stringValue.includes("\r")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export type ItemGroupExportRow = {
  id: number;
  code: string | null;
  name: string;
  parent_id: number | null;
  parent_code: string | null;
  parent_name: string | null;
  hierarchy_path: string;
  is_active: boolean;
  updated_at: string;
};

export function buildItemGroupsCsv(rows: ItemGroupExportRow[]): string {
  const headers = [
    "id",
    "code",
    "name",
    "parent_id",
    "parent_code",
    "parent_name",
    "hierarchy_path",
    "is_active",
    "updated_at"
  ];

  const lines: string[] = [];
  lines.push(headers.map(escapeCsvCell).join(","));

  for (const row of rows) {
    const cells = [
      String(row.id),
      row.code ?? "",
      row.name,
      row.parent_id != null ? String(row.parent_id) : "",
      row.parent_code ?? "",
      row.parent_name ?? "",
      row.hierarchy_path,
      row.is_active ? "true" : "false",
      row.updated_at
    ];
    lines.push(cells.map(escapeCsvCell).join(","));
  }

  return lines.join("\n");
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
