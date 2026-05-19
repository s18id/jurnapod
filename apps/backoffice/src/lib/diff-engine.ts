export type DiffChangeKind = "added" | "deleted" | "changed" | "reordered";

export type DiffValueType = "array" | "boolean" | "date" | "money" | "null" | "number" | "object" | "string" | "undefined";

export interface DiffChange {
  path: string;
  label: string;
  kind: DiffChangeKind;
  oldValue: unknown;
  newValue: unknown;
  oldFormatted: string;
  newFormatted: string;
  valueType: DiffValueType;
}

export interface DiffOptions {
  labels?: Record<string, string>;
  moneyFields?: string[];
  dateFields?: string[];
  moneyPrecision?: number;
  includeUnchanged?: boolean;
}

export class DiffEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiffEngineError";
  }
}

const DEFAULT_MONEY_PRECISION = 2;
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joinPath(parent: string, key: string): string {
  return parent ? `${parent}.${key}` : key;
}

function humanizePath(path: string): string {
  const leaf = path.split(".").at(-1) ?? path;
  return leaf.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stableStringify(value: unknown, seen = new WeakSet<object>()): string {
  if (value === undefined) return "__undefined__";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (seen.has(value)) throw new DiffEngineError("Cannot diff circular references.");
  seen.add(value);
  if (Array.isArray(value)) {
    const rendered = `[${value.map((item) => stableStringify(item, seen)).join(",")}]`;
    seen.delete(value);
    return rendered;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key], seen)}`);
  seen.delete(value);
  return `{${entries.join(",")}}`;
}

function isEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function sameArrayMembers(left: unknown[], right: unknown[]): boolean {
  if (left.length !== right.length) return false;
  const leftMembers = left.map((item) => stableStringify(item)).sort();
  const rightMembers = right.map((item) => stableStringify(item)).sort();
  return leftMembers.every((item, index) => item === rightMembers[index]);
}

function fieldMatches(path: string, fields: string[] | undefined): boolean {
  if (!fields?.length) return false;
  return fields.some((field) => field === path || path.endsWith(`.${field}`));
}

function inferValueType(path: string, value: unknown, options: DiffOptions): DiffValueType {
  if (fieldMatches(path, options.moneyFields)) return "money";
  if (fieldMatches(path, options.dateFields)) return "date";
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string" && ISO_DATE_TIME_PATTERN.test(value)) return "date";
  if (typeof value === "object") return "object";
  return typeof value as DiffValueType;
}

function formatMoney(value: unknown, precision: number): string {
  if (value === null || value === undefined || value === "") return "—";
  // Money formatting preserves provided fractional precision for both number and string inputs.
  // `moneyPrecision` is a minimum display scale, not a truncation setting.
  const initial = String(value);
  const raw = initial.toLowerCase().includes("e") && typeof value === "number"
    ? value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 })
    : initial;
  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = sign ? raw.slice(1) : raw;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const decimals = fraction.length > precision ? fraction : fraction.padEnd(precision, "0");
  return `${sign}${whole}${precision > 0 || decimals ? `.${decimals}` : ""}`;
}

function formatDateString(value: string): string {
  if (!ISO_DATE_TIME_PATTERN.test(value)) return value;
  return value.replace("T", " ").replace(/\.\d+Z?$/, " UTC").replace(/Z$/, " UTC");
}

export function formatDiffValue(path: string, value: unknown, options: DiffOptions = {}): string {
  const type = inferValueType(path, value, options);
  if (type === "undefined" || type === "null") return "—";
  if (type === "money") return formatMoney(value, options.moneyPrecision ?? DEFAULT_MONEY_PRECISION);
  if (type === "date" && typeof value === "string") return formatDateString(value);
  if (type === "array") return `Array(${(value as unknown[]).length}) ${stableStringify(value)}`;
  if (type === "object") return stableStringify(value);
  if (type === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function makeChange(path: string, kind: DiffChangeKind, oldValue: unknown, newValue: unknown, options: DiffOptions): DiffChange {
  const comparisonValue = newValue !== undefined ? newValue : oldValue;
  return {
    path,
    label: options.labels?.[path] ?? humanizePath(path),
    kind,
    oldValue,
    newValue,
    oldFormatted: formatDiffValue(path, oldValue, options),
    newFormatted: formatDiffValue(path, newValue, options),
    valueType: inferValueType(path, comparisonValue, options),
  };
}

function walkDiff(oldValue: unknown, newValue: unknown, path: string, options: DiffOptions, changes: DiffChange[]): void {
  if (isEqual(oldValue, newValue)) return;

  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    if (sameArrayMembers(oldValue, newValue)) {
      changes.push(makeChange(path, "reordered", oldValue, newValue, options));
      return;
    }
    changes.push(makeChange(path, "changed", oldValue, newValue, options));
    return;
  }

  if (isPlainObject(oldValue) && isPlainObject(newValue)) {
    const keys = Array.from(new Set([...Object.keys(oldValue), ...Object.keys(newValue)])).sort();
    for (const key of keys) {
      const childPath = joinPath(path, key);
      if (!(key in oldValue)) {
        changes.push(makeChange(childPath, "added", undefined, newValue[key], options));
      } else if (!(key in newValue)) {
        changes.push(makeChange(childPath, "deleted", oldValue[key], undefined, options));
      } else {
        walkDiff(oldValue[key], newValue[key], childPath, options, changes);
      }
    }
    return;
  }

  if (oldValue === undefined) {
    changes.push(makeChange(path, "added", undefined, newValue, options));
    return;
  }
  if (newValue === undefined) {
    changes.push(makeChange(path, "deleted", oldValue, undefined, options));
    return;
  }
  changes.push(makeChange(path, "changed", oldValue, newValue, options));
}

export function diffValues(oldValue: unknown, newValue: unknown, options: DiffOptions = {}): DiffChange[] {
  stableStringify(oldValue);
  stableStringify(newValue);
  const changes: DiffChange[] = [];
  walkDiff(oldValue, newValue, "", options, changes);
  return changes;
}

export function hasHighValueMoneyDelta(changes: DiffChange[], threshold: number): boolean {
  return changes.some((change) => {
    if (change.valueType !== "money") return false;
    const oldAmount = Number(change.oldValue ?? 0);
    const newAmount = Number(change.newValue ?? 0);
    return Number.isFinite(oldAmount) && Number.isFinite(newAmount) && Math.abs(newAmount - oldAmount) >= threshold;
  });
}
