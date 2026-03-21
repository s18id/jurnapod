// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * FilterBar Component Types
 * 
 * Provides type-safe filter schema definitions and utilities for
 * consistent filtering behavior across report and history pages.
 */

import { z } from "zod";

// ============================================================================
// Filter Field Types
// ============================================================================

/**
 * Supported filter field types
 */
export type FilterFieldType = "text" | "select" | "date" | "daterange" | "status";

/**
 * Option for select and status filter fields
 */
export interface SelectOption {
  /** Unique identifier for the option */
  value: string;
  /** Display label for the option */
  label: string;
}

/**
 * Date range value for daterange filter type
 */
export interface DateRange {
  /** Start date (inclusive) in YYYY-MM-DD format */
  from: string;
  /** End date (inclusive) in YYYY-MM-DD format */
  to: string;
}

/**
 * Union type for all possible filter values
 */
export type FilterValue = 
  | string                           // text, select, date
  | DateRange                        // daterange
  | string[]                         // status (multi-select)
  | null                             // null/undefined for empty
  | undefined;

/**
 * Individual filter field definition
 */
export interface FilterField {
  /** Unique key for the filter field (used in URL params and state) */
  key: string;
  /** Field type determining input behavior */
  type: FilterFieldType;
  /** Human-readable label for the filter */
  label: string;
  /** Placeholder text for text inputs (optional) */
  placeholder?: string;
  /** Options for select and status field types (required for these types) */
  options?: SelectOption[];
  /** Validation pattern for text fields (optional, regex string) */
  validationPattern?: string;
  /** Help text displayed below the input (optional) */
  helpText?: string;
}

/**
 * Complete filter schema definition
 */
export interface FilterSchema {
  /** Array of filter field definitions */
  fields: FilterField[];
  /** Default values for filters (optional) */
  defaultValues?: Record<string, FilterValue>;
}

// ============================================================================
// Zod Schemas for Request Payload Validation
// ============================================================================

/**
 * Creates a Zod schema for a single filter field
 */
function createFieldSchema(field: FilterField): z.ZodTypeAny {
  switch (field.type) {
    case "text":
      return z.string();
    case "select":
      return z.string();
    case "date":
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD required)");
    case "daterange":
      return z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional(),
      }).refine(
        (data) => !data.from || !data.to || data.from <= data.to,
        { message: "Start date must be before or equal to end date" }
      );
    case "status":
      return z.array(z.string());
    default:
      return z.unknown();
  }
}

/**
 * Creates a Zod schema for validating filter payloads before API requests.
 * Validates based on the FilterSchema field definitions.
 * 
 * @param schema - The filter schema to create validation schema for
 * @returns Zod schema for filter values
 * 
 * @example
 * ```typescript
 * const schema: FilterSchema = {
 *   fields: [
 *     { key: "search", type: "text" },
 *     { key: "status", type: "select", options: [...] },
 *   ],
 * };
 * 
 * const validator = createFilterPayloadSchema(schema);
 * const result = validator.safeParse({ search: "foo", status: "active" });
 * ```
 */
export function createFilterPayloadSchema(schema: FilterSchema): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  
  for (const field of schema.fields) {
    shape[field.key] = createFieldSchema(field).optional();
  }
  
  return z.object(shape);
}

/**
 * Validation error result with field-specific messages
 */
export interface FilterValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Field-specific error messages (key = field key) */
  errors: Record<string, string>;
}

/**
 * Validates filter values against schema using Zod
 * Returns detailed error messages for each invalid field.
 * 
 * @param schema - The filter schema
 * @param values - The filter values to validate
 * @returns Validation result with error messages
 */
export function validateFilterPayload(
  schema: FilterSchema,
  values: Record<string, FilterValue>
): FilterValidationResult {
  const validator = createFilterPayloadSchema(schema);
  const result = validator.safeParse(values);
  
  if (result.success) {
    return { valid: true, errors: {} };
  }
  
  const errors: Record<string, string> = {};
  
  for (const issue of result.error.issues) {
    const path = issue.path[0] as string;
    if (path) {
      errors[path] = issue.message;
    }
  }
  
  return { valid: false, errors };
}

// ============================================================================
// Configuration Constants
// ============================================================================

/** Debounce delay for text input filters (milliseconds) */
export const DEBOUNCE_MS = 300;

/** Date format used in URL params (ISO 8601 date-only) */
export const DATE_FORMAT = "YYYY-MM-DD";

/** URL parameter prefix for all filter values */
export const URL_PARAM_PREFIX = "filter_";

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a filter field definition
 * @param field - The filter field to validate
 * @returns true if the field is valid
 */
export function isValidFilterField(field: FilterField): boolean {
  // Check if type is valid
  const validTypes: FilterFieldType[] = ["text", "select", "date", "daterange", "status"];
  if (!validTypes.includes(field.type)) {
    return false;
  }
  
  // Select and status fields require options
  if ((field.type === "select" || field.type === "status") && 
      (!field.options || field.options.length === 0)) {
    return false;
  }
  
  return true;
}

/**
 * Validates a text filter value against a pattern
 * @param value - The value to validate
 * @param pattern - Optional regex pattern string
 * @returns true if valid
 */
export function validateTextFilter(value: string, pattern?: string): boolean {
  if (!pattern) return true;
  
  try {
    const regex = new RegExp(pattern);
    return regex.test(value);
  } catch {
    return false;
  }
}

/**
 * Validates a date string is in YYYY-MM-DD format
 * @param dateStr - The date string to validate
 * @returns true if valid format
 */
export function validateDateFormat(dateStr: string): boolean {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  return datePattern.test(dateStr);
}

/**
 * Validates a date range (from <= to)
 * @param range - The date range to validate
 * @returns true if valid (from <= to) or if range is partial
 */
export function validateDateRange(range: DateRange): boolean {
  if (!range.from || !range.to) return true; // Allow partial ranges
  return range.from <= range.to;
}

/**
 * Validates a select value is in the options list
 * @param value - The value to validate
 * @param options - The available options
 * @returns true if value is in options
 */
export function validateSelectValue(value: string, options: SelectOption[]): boolean {
  return options.some(opt => opt.value === value);
}

/**
 * Validates status values are all in the options list
 * @param values - The values to validate
 * @param options - The available options
 * @returns true if all values are in options
 */
export function validateStatusValues(values: string[], options: SelectOption[]): boolean {
  return values.every(v => options.some(opt => opt.value === v));
}

// ============================================================================
// Validation with Error Messages (for UI display)
// ============================================================================

/**
 * Result of validating a single filter value with error message
 */
export interface ValidationResult {
  /** Whether the value is valid */
  valid: boolean;
  /** Error message if invalid, undefined if valid */
  error?: string;
}

/**
 * Validates a text filter value and returns error message
 * @param value - The value to validate
 * @param pattern - Optional regex pattern string
 * @returns Validation result with error message
 */
export function validateTextFilterResult(value: string, pattern?: string): ValidationResult {
  if (!pattern) return { valid: true };
  
  try {
    const regex = new RegExp(pattern);
    if (!regex.test(value)) {
      return { valid: false, error: `Value does not match pattern: ${pattern}` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid validation pattern" };
  }
}

/**
 * Validates a date string and returns error message
 * @param dateStr - The date string to validate
 * @returns Validation result with error message
 */
export function validateDateFormatResult(dateStr: string): ValidationResult {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(dateStr)) {
    return { valid: false, error: "Invalid date format. Use YYYY-MM-DD" };
  }
  return { valid: true };
}

/**
 * Validates a date range and returns error message
 * @param range - The date range to validate
 * @returns Validation result with error message
 */
export function validateDateRangeResult(range: DateRange): ValidationResult {
  if (!range.from && !range.to) return { valid: true }; // Empty is valid (use defaults)
  if (range.from && !validateDateFormat(range.from)) {
    return { valid: false, error: "Invalid start date format" };
  }
  if (range.to && !validateDateFormat(range.to)) {
    return { valid: false, error: "Invalid end date format" };
  }
  if (range.from && range.to && range.from > range.to) {
    return { valid: false, error: "Start date must be before or equal to end date" };
  }
  return { valid: true };
}

/**
 * Validates a select value and returns error message
 * @param value - The value to validate
 * @param options - The available options
 * @returns Validation result with error message
 */
export function validateSelectValueResult(value: string, options: SelectOption[]): ValidationResult {
  const isValid = options.some(opt => opt.value === value);
  if (!isValid) {
    return { valid: false, error: "Invalid selection" };
  }
  return { valid: true };
}

/**
 * Validates status values and returns error message
 * @param values - The values to validate
 * @param options - The available options
 * @returns Validation result with error message
 */
export function validateStatusValuesResult(values: string[], options: SelectOption[]): ValidationResult {
  const invalidValues = values.filter(v => !options.some(opt => opt.value === v));
  if (invalidValues.length > 0) {
    return { valid: false, error: `Invalid selection(s): ${invalidValues.join(", ")}` };
  }
  return { valid: true };
}

/**
 * Validates a single filter field value and returns error message
 * @param field - The filter field definition
 * @param value - The value to validate
 * @returns Validation result with error message
 */
export function validateFieldValue(field: FilterField, value: FilterValue): ValidationResult {
  // Handle empty/undefined values - they are valid (optional)
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
    return { valid: true };
  }
  
  switch (field.type) {
    case "text":
      return validateTextFilterResult(value as string, field.validationPattern);
    case "select":
      return validateSelectValueResult(value as string, field.options || []);
    case "date":
      return validateDateFormatResult(value as string);
    case "daterange":
      return validateDateRangeResult(value as DateRange);
    case "status":
      return validateStatusValuesResult(value as string[], field.options || []);
    default:
      return { valid: true };
  }
}

// ============================================================================
// Serialization Functions
// ============================================================================

/**
 * Serializes a single filter value to URL parameter format
 * @param key - The filter key
 * @param value - The filter value
 * @returns URL parameter string or null if value is empty
 */
export function serializeFilterValue(key: string, value: FilterValue): string | null {
  // Handle empty values
  if (value === null || value === undefined || value === "") {
    return null;
  }
  
  const prefix = `${URL_PARAM_PREFIX}${key}`;
  
  // Handle date range specially (needs two params)
  // Check if value is a date range object (has 'from' and 'to' properties)
  if (typeof value === "object" && !Array.isArray(value) && "from" in value && "to" in value) {
    const range = value as DateRange;
    if (!range.from && !range.to) return null;
    const parts: string[] = [];
    if (range.from) parts.push(`${prefix}_from=${encodeURIComponent(range.from)}`);
    if (range.to) parts.push(`${prefix}_to=${encodeURIComponent(range.to)}`);
    return parts.length > 0 ? parts.join("&") : null;
  }
  
  // Handle array values (status multi-select)
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return `${prefix}=${value.map(v => encodeURIComponent(v)).join(",")}`;
  }
  
  // Handle string values
  if (typeof value === "string") {
    return `${prefix}=${encodeURIComponent(value)}`;
  }
  
  return null;
}

/**
 * Serializes all filters to URL search params string
 * @param filters - Record of filter values
 * @returns URL search params string (without leading ?)
 */
export function serializeFiltersToUrl(filters: Record<string, FilterValue>): string {
  const parts: string[] = [];
  
  for (const [key, value] of Object.entries(filters)) {
    const serialized = serializeFilterValue(key, value);
    if (serialized) {
      parts.push(serialized);
    }
  }
  
  return parts.join("&");
}

/**
 * Parses a single filter value from URL search params
 * @param key - The filter key
 * @param type - The filter field type
 * @param params - URL search params
 * @returns Parsed filter value or undefined
 */
export function parseFilterValue(
  key: string,
  type: FilterFieldType,
  params: URLSearchParams
): FilterValue {
  const prefix = `${URL_PARAM_PREFIX}${key}`;
  
  // Handle date range specially (needs two params)
  if (type === "daterange") {
    const from = params.get(`${prefix}_from`) || undefined;
    const to = params.get(`${prefix}_to`) || undefined;
    
    if (!from && !to) return undefined;
    return { from: from || "", to: to || "" };
  }
  
  // Handle status (multi-select) - comma-separated values
  if (type === "status") {
    const value = params.get(prefix);
    if (!value) return undefined;
    return value.split(",").map(v => decodeURIComponent(v));
  }
  
  // Handle single values
  const value = params.get(prefix);
  if (value === null) return undefined;
  
  return decodeURIComponent(value);
}

/**
 * Parses all filter values from URL search params based on schema
 * @param schema - The filter schema
 * @param params - URL search params
 * @returns Record of parsed filter values
 */
export function parseFiltersFromUrl(
  schema: FilterSchema,
  params: URLSearchParams
): Record<string, FilterValue> {
  const result: Record<string, FilterValue> = {};
  
  for (const field of schema.fields) {
    const value = parseFilterValue(field.key, field.type, params);
    if (value !== undefined) {
      result[field.key] = value;
    }
  }
  
  return result;
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Gets default filter values from schema
 * @param schema - The filter schema
 * @returns Record of default values (only includes explicitly specified defaults)
 */
export function getFilterDefaults(schema: FilterSchema): Record<string, FilterValue> {
  // Only return explicitly defined defaultValues
  // Type-specific defaults (like "" for text) are applied at the component level, not here
  if (schema.defaultValues) {
    return { ...schema.defaultValues };
  }
  
  return {};
}

// ============================================================================
// Accessibility Helpers
// ============================================================================

/**
 * Gets the input element ID for a filter field
 * @param key - The filter key
 * @param testId - Optional test ID prefix
 * @returns The input ID
 */
export function getFilterInputId(key: string, testId?: string): string {
  return testId ? `${testId}-${key}` : `filter-${key}`;
}

/**
 * Gets the help text element ID for a filter field
 * @param key - The filter key
 * @returns The help text ID
 */
export function getFilterHelpId(key: string): string {
  return `filter-${key}-help`;
}

/**
 * Gets the error message element ID for a filter field
 * @param key - The filter key
 * @returns The error message ID
 */
export function getFilterErrorId(key: string): string {
  return `filter-${key}-error`;
}

/**
 * Gets the aria-describedby attribute value for a filter field
 * @param key - The filter key
 * @param hasHelp - Whether help text is present
 * @param hasError - Whether error is present
 * @returns The aria-describedby value
 */
export function getFilterAriaDescribedBy(
  key: string,
  hasHelp: boolean = false,
  hasError: boolean = false
): string | undefined {
  const parts: string[] = [];
  
  if (hasHelp) parts.push(getFilterHelpId(key));
  if (hasError) parts.push(getFilterErrorId(key));
  
  return parts.length > 0 ? parts.join(" ") : undefined;
}

// ============================================================================
// Live Region Announcements
// ============================================================================

/**
 * Generates announcement text for filter apply
 * @param count - Number of results
 * @returns Announcement text
 */
export function announceFilterApply(count: number): string {
  return `${count} result${count === 1 ? "" : "s"} found`;
}

/**
 * Generates announcement text for filter clear
 * @returns Announcement text
 */
export function announceFilterClear(): string {
  return "Filters cleared";
}

/**
 * Generates announcement text for filter error
 * @param field - The field key
 * @param message - Error message
 * @returns Announcement text
 */
export function announceError(field: string, message: string): string {
  return `Error in ${field}: ${message}`;
}

/**
 * Generates announcement text for loading
 * @returns Announcement text
 */
export function announceLoading(): string {
  return "Loading results...";
}
