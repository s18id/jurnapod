// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

type TimezoneOption = { value: string; label: string };

const PRIORITY_TIMEZONES = [
  { value: "Asia/Jakarta", label: "Asia/Jakarta (WIB)" },
  { value: "Asia/Makassar", label: "Asia/Makassar (WITA)" },
  { value: "Asia/Jayapura", label: "Asia/Jayapura (WIT)" },
  { value: "Asia/Singapore", label: "Asia/Singapore" },
  { value: "Asia/Bangkok", label: "Asia/Bangkok" },
  { value: "Asia/Kuala_Lumpur", label: "Asia/Kuala_Lumpur" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
  { value: "Australia/Sydney", label: "Australia/Sydney" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  { value: "UTC", label: "UTC" }
] as const;

function buildTimezoneOptions(): TimezoneOption[] {
  const priorityMap = new Map<string, TimezoneOption>(PRIORITY_TIMEZONES.map((row) => [row.value, row]));
  const globalValues =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : PRIORITY_TIMEZONES.map((x) => x.value);
  const globalOptions = globalValues
    .filter((value) => !priorityMap.has(value))
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));

  return [...PRIORITY_TIMEZONES, ...globalOptions];
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = buildTimezoneOptions();
