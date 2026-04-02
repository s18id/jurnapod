// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { AccountMappingCode } from "@jurnapod/shared";
import { ACCOUNT_MAPPING_TYPE_ID_BY_CODE, accountMappingIdToCode } from "@jurnapod/shared";

const MONEY_SCALE = 100;

export function toMinorUnits(value: number): number {
  return Math.round(value * MONEY_SCALE);
}

export function fromMinorUnits(value: number): number {
  return value / MONEY_SCALE;
}

export function normalizeMoney(value: number): number {
  return fromMinorUnits(toMinorUnits(value));
}

export function resolveMappingCode(
  row: { mapping_type_id?: number | null; mapping_key?: string | null }
): AccountMappingCode | undefined {
  const fromId = accountMappingIdToCode(row.mapping_type_id);
  if (fromId) {
    return fromId;
  }

  if (typeof row.mapping_key === "string") {
    const normalized = row.mapping_key.trim().toUpperCase() as AccountMappingCode;
    if (ACCOUNT_MAPPING_TYPE_ID_BY_CODE[normalized]) {
      return normalized;
    }
  }

  return undefined;
}
