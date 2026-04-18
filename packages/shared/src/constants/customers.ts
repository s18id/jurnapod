// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Customer Type Constants
 *
 * Integer constants for customer.type column.
 * Replaces MySQL ENUM('PERSON','BUSINESS') with TINYINT UNSIGNED.
 *
 * Database mapping:
 * - PERSON = 1
 * - BUSINESS = 2
 */

export const CUSTOMER_TYPE = {
  PERSON: 1,
  BUSINESS: 2
} as const;

export type CustomerTypeValue = typeof CUSTOMER_TYPE[keyof typeof CUSTOMER_TYPE];

export const CUSTOMER_TYPE_LABELS: Record<CustomerTypeValue, string> = {
  [CUSTOMER_TYPE.PERSON]: "PERSON",
  [CUSTOMER_TYPE.BUSINESS]: "BUSINESS"
};

/**
 * Convert database integer to domain string.
 */
export function customerTypeToString(type: CustomerTypeValue): "PERSON" | "BUSINESS" {
  return type === CUSTOMER_TYPE.PERSON ? "PERSON" : "BUSINESS";
}

/**
 * Convert domain string to database integer.
 */
export function customerTypeToNumber(type: "PERSON" | "BUSINESS"): CustomerTypeValue {
  return type === "PERSON" ? CUSTOMER_TYPE.PERSON : CUSTOMER_TYPE.BUSINESS;
}
