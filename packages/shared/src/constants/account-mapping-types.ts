// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export const ACCOUNT_MAPPING_TYPE_ID_BY_CODE = {
  AR: 1,
  SALES_REVENUE: 2,
  SALES_RETURNS: 3,
  INVOICE_PAYMENT_BANK: 4,
  PAYMENT_VARIANCE_GAIN: 5,
  PAYMENT_VARIANCE_LOSS: 6,
  COGS_DEFAULT: 7,
  INVENTORY_ASSET_DEFAULT: 8,
  CASH: 9,
  QRIS: 10,
  CARD: 11,
  SALES_DISCOUNTS: 12
} as const;

export type AccountMappingCode = keyof typeof ACCOUNT_MAPPING_TYPE_ID_BY_CODE;

export const ACCOUNT_MAPPING_CODE_BY_ID: Readonly<Record<number, AccountMappingCode>> = {
  1: "AR",
  2: "SALES_REVENUE",
  3: "SALES_RETURNS",
  4: "INVOICE_PAYMENT_BANK",
  5: "PAYMENT_VARIANCE_GAIN",
  6: "PAYMENT_VARIANCE_LOSS",
  7: "COGS_DEFAULT",
  8: "INVENTORY_ASSET_DEFAULT",
  9: "CASH",
  10: "QRIS",
  11: "CARD",
  12: "SALES_DISCOUNTS"
};

export function accountMappingCodeToId(code: string): number | undefined {
  const normalized = code.trim().toUpperCase() as AccountMappingCode;
  return ACCOUNT_MAPPING_TYPE_ID_BY_CODE[normalized];
}

export function accountMappingIdToCode(mappingTypeId: number | null | undefined): AccountMappingCode | undefined {
  if (!Number.isFinite(mappingTypeId)) {
    return undefined;
  }
  return ACCOUNT_MAPPING_CODE_BY_ID[Number(mappingTypeId)];
}
