// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Shared decimal helpers for scale-4 purchasing amounts.
 */

export function toScaled(value: string, scale: number): bigint {
  const trimmed = value.trim();
  const re = new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`);
  if (!re.test(trimmed)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  const [integer, fraction = ""] = trimmed.split(".");
  const scaleFactor = 10n ** BigInt(scale);
  const fracScaled = (fraction + "0".repeat(scale)).slice(0, scale);
  return BigInt(integer) * scaleFactor + BigInt(fracScaled);
}

export function toScaled4(value: string): bigint {
  return toScaled(value, 4);
}

export function fromScaled4(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const intPart = abs / 10000n;
  const fracPart = (abs % 10000n).toString().padStart(4, "0");
  return `${sign}${intPart.toString()}.${fracPart}`;
}

export function scale4Mul(a: bigint, b: bigint): bigint {
  return (a * b) / 10000n;
}
