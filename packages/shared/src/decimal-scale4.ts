// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Canonical decimal arithmetic for scale-4 amounts.
 *
 * Public API:
 * - String wrappers: add, sub, mul, div, gt, lt, eq, gte, lte, sum
 * - BigInt primitives: scaled, unscaled, scaledMul, scaledDiv, scaledN (for multi-step arithmetic)
 *
 * Quantity operations MUST use Number(), NOT this module.
 */

const SCALE = 4;
const FACTOR = 10000n;

// ═══════════════════════════════════════════════════════════════════════════
// BigInt primitives — for multi-step arithmetic (FX conversion, etc.)
// ═══════════════════════════════════════════════════════════════════════════

/** Convert decimal string to scaled BigInt (×10000).
 *  Pass `{ signed: true }` to accept negative values (for variance/adjustment paths). */
export function scaled(value: string, opts?: { signed?: boolean }): bigint {
  const trimmed = value.trim();
  const re = opts?.signed ? /^-?\d+(\.\d{1,4})?$/ : /^\d+(\.\d{1,4})?$/;
  if (!re.test(trimmed))
    throw new Error(`Invalid decimal: ${value}`);
  const neg = trimmed.startsWith("-");
  const abs = neg ? trimmed.slice(1) : trimmed;
  const [i, f = ""] = abs.split(".");
  const magnitude = BigInt(i) * FACTOR + BigInt((f + "0000").slice(0, SCALE));
  return neg ? -magnitude : magnitude;
}

/** Convert scaled BigInt back to decimal string. */
export function unscaled(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  return `${sign}${(abs / FACTOR).toString()}.${(abs % FACTOR).toString().padStart(SCALE, "0")}`;
}

/** Multiply two scaled BigInts, returning a scaled BigInt. */
export function scaledMul(a: bigint, b: bigint): bigint {
  return (a * b) / FACTOR;
}

/**
 * Divide a scale-4 amount by a scale-N amount, producing a scale-4 result.
 * Half-up rounding. Returns `a` if divisor ≤ 0.
 *
 * Used for: base-currency ÷ exchange-rate → supplier-currency conversion
 * and any pattern where a fixed-scale amount must be divided by an arbitrary-scale divisor.
 */
export function scaledDiv(a: bigint, divisor: bigint, divisorScale: number): bigint {
  if (divisor <= 0n) return a;
  const factor = 10n ** BigInt(divisorScale);
  return (a * factor + divisor / 2n) / divisor;
}

/** Convert decimal string to scaled BigInt with arbitrary scale (e.g. scale 8 for FX rates).
 *  Pass `{ signed: true }` to accept negative values. */
export function scaledN(value: string, scale: number, opts?: { signed?: boolean }): bigint {
  const trimmed = value.trim();
  const re = opts?.signed
    ? new RegExp(`^-?\\d+(\\.\\d{1,${scale}})?$`)
    : new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`);
  if (!re.test(trimmed))
    throw new Error(`Invalid decimal: ${value}`);
  const neg = trimmed.startsWith("-");
  const abs = neg ? trimmed.slice(1) : trimmed;
  const [i, f = ""] = abs.split(".");
  const factor = 10n ** BigInt(scale);
  const magnitude = BigInt(i) * factor + BigInt((f + "0".repeat(scale)).slice(0, scale));
  return neg ? -magnitude : magnitude;
}

// ═══════════════════════════════════════════════════════════════════════════
// String wrappers — for simple operations
// ═══════════════════════════════════════════════════════════════════════════

export function add(a: string, b: string): string {
  return unscaled(scaled(a) + scaled(b));
}

export function sub(a: string, b: string): string {
  return unscaled(scaled(a) - scaled(b));
}

export function mul(a: string, b: string): string {
  return unscaled(scaledMul(scaled(a), scaled(b)));
}

export function div(a: string, b: string): string {
  const sa = scaled(a), sb = scaled(b);
  if (sb === 0n) throw new Error("Division by zero");
  return unscaled((sa * FACTOR) / sb);
}

export function gt(a: string, b: string): boolean { return scaled(a) > scaled(b); }
export function lt(a: string, b: string): boolean { return scaled(a) < scaled(b); }
export function eq(a: string, b: string): boolean { return scaled(a) === scaled(b); }
export function gte(a: string, b: string): boolean { return scaled(a) >= scaled(b); }
export function lte(a: string, b: string): boolean { return scaled(a) <= scaled(b); }

export function sum(values: string[]): string {
  return unscaled(values.reduce((acc, v) => acc + scaled(v), 0n));
}
