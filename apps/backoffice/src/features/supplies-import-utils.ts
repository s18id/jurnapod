// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { parseDelimited as parseDelimitedShared, parseImportBoolean } from "../lib/import/delimited";

export type NormalizedSupplyRow = {
  sku: string | null;
  name: string;
  unit: string;
  is_active: boolean;
};

export type ValidationError = {
  row: number;
  field: string;
  message: string;
};

export type ImportAction = "CREATE" | "UPDATE" | "SKIP" | "ERROR";

export type ImportPlanRow = {
  rowIndex: number;
  original: NormalizedSupplyRow;
  action: ImportAction;
  existingSupplyId?: number;
  reason?: string;
  error?: string;
};

export type ImportSummary = {
  create: number;
  update: number;
  skip: number;
  error: number;
  total: number;
};

export type ApplyResult = {
  rowIndex: number;
  action: ImportAction;
  success: boolean;
  supplyId?: number;
  error?: string;
};

type Supply = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  unit: string;
  is_active: boolean;
  updated_at: string;
};

export const parseDelimited = parseDelimitedShared;

const HEADER_ALIASES: Record<string, "sku" | "name" | "unit" | "is_active"> = {
  sku: "sku",
  kode: "sku",
  code: "sku",
  name: "name",
  nama: "name",
  "nama barang": "name",
  unit: "unit",
  satuan: "unit",
  is_active: "is_active",
  active: "is_active",
  status: "is_active",
  aktif: "is_active"
};

export function normalizeHeaderName(name: string): "sku" | "name" | "unit" | "is_active" | null {
  const normalized = name.toLowerCase().trim();
  return HEADER_ALIASES[normalized] || null;
}

export const toBoolean = parseImportBoolean;

export type NormalizedSupplyRowWithRaw = NormalizedSupplyRow & {
  is_active_raw: string;
};

export function normalizeImportRow(cells: string[], header: string[]): NormalizedSupplyRowWithRaw {
  const row: NormalizedSupplyRowWithRaw = {
    sku: null,
    name: "",
    unit: "unit",
    is_active: true,
    is_active_raw: ""
  };

  header.forEach((colName, idx) => {
    const field = normalizeHeaderName(colName);
    const value = cells[idx]?.trim() ?? "";

    switch (field) {
      case "sku":
        row.sku = value || null;
        break;
      case "name":
        row.name = value;
        break;
      case "unit":
        row.unit = value || "unit";
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

export function validateImportRows(rows: NormalizedSupplyRowWithRaw[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const maxNameLength = 200;
  const maxSkuLength = 50;
  const maxUnitLength = 50;

  const seenSku = new Set<string>();
  const seenNameUnit = new Set<string>();
  const nameUnitAggregate = new Map<string, { hasAnyMissingSku: boolean }>();

  rows.forEach((row, idx) => {
    if (!row.name.trim()) {
      errors.push({
        row: idx,
        field: "name",
        message: "Name is required"
      });
    }

    if (row.name.length > maxNameLength) {
      errors.push({
        row: idx,
        field: "name",
        message: `Name exceeds ${maxNameLength} characters`
      });
    }

    if (row.sku && row.sku.length > maxSkuLength) {
      errors.push({
        row: idx,
        field: "sku",
        message: `SKU exceeds ${maxSkuLength} characters`
      });
    }

    if (row.unit.length > maxUnitLength) {
      errors.push({
        row: idx,
        field: "unit",
        message: `Unit exceeds ${maxUnitLength} characters`
      });
    }

    if (row.is_active_raw && toBoolean(row.is_active_raw) === null) {
      errors.push({
        row: idx,
        field: "is_active",
        message: "Invalid is_active value. Use true/false/1/0/yes/no."
      });
    }

    const nameUnitKey = `${row.name.toLowerCase()}|${row.unit.toLowerCase()}`;
    const existing = nameUnitAggregate.get(nameUnitKey);
    const currentMissingSku = !row.sku;
    let hasNameUnitDuplicateError = false;

    if (existing && (existing.hasAnyMissingSku || currentMissingSku)) {
      errors.push({
        row: idx,
        field: "name",
        message: "Duplicate name+unit where SKU is missing on at least one row"
      });
      hasNameUnitDuplicateError = true;
    }

    nameUnitAggregate.set(nameUnitKey, {
      hasAnyMissingSku: (existing?.hasAnyMissingSku || currentMissingSku)
    });

    if (row.sku) {
      const skuKey = row.sku.toLowerCase();
      if (seenSku.has(skuKey)) {
        errors.push({
          row: idx,
          field: "sku",
          message: "Duplicate SKU in import file"
        });
      }
      seenSku.add(skuKey);
    } else {
      if (!hasNameUnitDuplicateError && seenNameUnit.has(nameUnitKey)) {
        errors.push({
          row: idx,
          field: "name",
          message: "Duplicate name+unit combination in import file"
        });
      }
      seenNameUnit.add(nameUnitKey);
    }
  });

  return errors;
}

export function buildImportPlan(
  rows: NormalizedSupplyRowWithRaw[],
  existingSupplies: Supply[]
): ImportPlanRow[] {
  const skuMap = new Map<string, Supply>();
  const nameUnitMap = new Map<string, Supply>();

  existingSupplies.forEach((supply) => {
    if (supply.sku) {
      skuMap.set(supply.sku.toLowerCase(), supply);
    }
    const key = `${supply.name.toLowerCase()}|${supply.unit.toLowerCase()}`;
    nameUnitMap.set(key, supply);
  });

  const validationErrors = validateImportRows(rows);
  const validationErrorByRow = new Map<number, ValidationError>();
  validationErrors.forEach((err) => {
    if (!validationErrorByRow.has(err.row)) {
      validationErrorByRow.set(err.row, err);
    }
  });

  const matchedExistingIds = new Set<number>();
  const createNameUnitTracker = new Map<string, { hasAnyMissingSku: boolean }>();

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

    let matchedSupply: Supply | undefined;
    let matchBy: "sku" | "name_unit" | null = null;

    if (row.sku) {
      matchedSupply = skuMap.get(row.sku.toLowerCase());
      if (matchedSupply) {
        matchBy = "sku";
      }
    }

    if (!matchedSupply && !row.sku) {
      const nameUnitKey = `${row.name.toLowerCase()}|${row.unit.toLowerCase()}`;
      matchedSupply = nameUnitMap.get(nameUnitKey);
      if (matchedSupply) {
        matchBy = "name_unit";
      }
    }

    if (!matchedSupply) {
      const nameUnitKey = `${row.name.toLowerCase()}|${row.unit.toLowerCase()}`;
      const existingCreate = createNameUnitTracker.get(nameUnitKey);
      const currentMissingSku = !row.sku;

      if (existingCreate && (existingCreate.hasAnyMissingSku || currentMissingSku)) {
        return {
          rowIndex: idx,
          original: row,
          action: "ERROR" as ImportAction,
          error: "Duplicate name+unit where SKU is missing on at least one row"
        };
      }

      createNameUnitTracker.set(nameUnitKey, {
        hasAnyMissingSku: (existingCreate?.hasAnyMissingSku || currentMissingSku)
      });

      const reason = row.sku
        ? "No SKU match found - will create new"
        : "No name+unit match found - will create new";
      return {
        rowIndex: idx,
        original: row,
        action: "CREATE" as ImportAction,
        reason
      };
    }

    if (matchedExistingIds.has(matchedSupply.id)) {
      return {
        rowIndex: idx,
        original: row,
        action: "ERROR" as ImportAction,
        error: `Multiple rows target the same existing supply (ID: ${matchedSupply.id}). Keep only one row for this supply.`
      };
    }

    matchedExistingIds.add(matchedSupply.id);

    const isIdentical =
      (row.sku ?? null) === matchedSupply.sku &&
      row.name === matchedSupply.name &&
      row.unit === matchedSupply.unit &&
      row.is_active === matchedSupply.is_active;

    if (isIdentical) {
      return {
        rowIndex: idx,
        original: row,
        action: "SKIP" as ImportAction,
        existingSupplyId: matchedSupply.id,
        reason: "No changes detected"
      };
    }

    const updateReason = matchBy === "sku"
      ? `Update existing (matched by SKU, ID: ${matchedSupply.id})`
      : `Update existing (matched by name+unit, ID: ${matchedSupply.id})`;

    return {
      rowIndex: idx,
      original: row,
      action: "UPDATE" as ImportAction,
      existingSupplyId: matchedSupply.id,
      reason: updateReason
    };
  });
}

export function computeImportSummary(plan: ImportPlanRow[]): ImportSummary {
  const summary: ImportSummary = {
    create: 0,
    update: 0,
    skip: 0,
    error: 0,
    total: plan.length
  };

  plan.forEach((row) => {
    switch (row.action) {
      case "CREATE":
        summary.create++;
        break;
      case "UPDATE":
        summary.update++;
        break;
      case "SKIP":
        summary.skip++;
        break;
      case "ERROR":
        summary.error++;
        break;
    }
  });

  return summary;
}
