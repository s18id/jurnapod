// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// FilterBar convenience factories for data-grid.
//
// These factory functions create FilterField objects that can be
// used with the canonical FilterBar from @/components/ui/FilterBar.

import type { FilterField, SelectOption } from "@/components/ui/FilterBar";

// ---------------------------------------------------------------------------
// Convenience filter field factories
// ---------------------------------------------------------------------------

/**
 * Create a text search filter field.
 */
export function createSearchFilter(
  key: string,
  label: string,
  placeholder?: string,
): FilterField {
  return {
    key,
    type: "text",
    label,
    placeholder: placeholder ?? `Search ${label.toLowerCase()}...`,
  };
}

/**
 * Create a select/dropdown filter field.
 */
export function createSelectFilter(
  key: string,
  label: string,
  options: SelectOption[],
  placeholder?: string,
): FilterField {
  return {
    key,
    type: "select",
    label,
    options,
    placeholder: placeholder ?? `Select ${label.toLowerCase()}...`,
  };
}

/**
 * Create a date filter field.
 */
export function createDateFilter(
  key: string,
  label: string,
  placeholder?: string,
): FilterField {
  return {
    key,
    type: "date",
    label,
    placeholder: placeholder ?? "Select date...",
  };
}

/**
 * Create a date range filter field.
 */
export function createDateRangeFilter(
  key: string,
  label: string,
): FilterField {
  return {
    key,
    type: "daterange",
    label,
  };
}

/**
 * Create a multi-select status filter field.
 */
export function createStatusFilter(
  key: string,
  label: string,
  options: SelectOption[],
  placeholder?: string,
): FilterField {
  return {
    key,
    type: "status",
    label,
    options,
    placeholder: placeholder ?? `Select ${label.toLowerCase()}...`,
  };
}
