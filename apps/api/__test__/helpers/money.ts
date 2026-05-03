// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Shared test helpers for money and decimal handling.
 *
 * Parses scaled-4 decimal strings (e.g. "800.0000") to bigint.
 * This is the inverse of fromScaled4() in the purchasing module.
 */

/** Parse a scaled-4 decimal string (e.g. "800.0000") to bigint. */
export function toScaledBigInt(value: string, scale = 4): bigint {
  const negative = value.startsWith('-');
  const normalized = negative ? value.slice(1) : value;
  const [integerPart, fractionalRaw = ''] = normalized.split('.');
  const fractional = `${fractionalRaw}${'0'.repeat(scale)}`.slice(0, scale);
  const scaled = BigInt(`${integerPart || '0'}${fractional}`);
  return negative ? -scaled : scaled;
}
