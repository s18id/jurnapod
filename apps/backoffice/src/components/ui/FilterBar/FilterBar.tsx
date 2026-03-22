// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ReactNode } from "react";
import {
  Box,
  Button,
  Group,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useDidUpdate } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  DateRange,
  FilterField,
  FilterSchema,
  FilterValue,
  SelectOption,
} from "./types";
import {
  DEBOUNCE_MS,
  getFilterDefaults,
  getFilterErrorId,
  getFilterHelpId,
  getFilterInputId,
  isValidFilterField,
  validateFieldValue,
} from "./types";

/**
 * FilterBar Component
 * 
 * A configurable, reusable filter bar for consistent filtering behavior
 * across report and history pages.
 * 
 * Features:
 * - Supported field types: text, select, date, daterange, status
 * - URL state synchronization via query parameters (controlled by parent)
 * - Debounced text input
 * - Multi-select for status fields
 * - WCAG 2.1 AA accessibility compliance
 * - Live region announcements for screen readers
 * - Field-level validation with error messages
 * - Focus management on filter apply/clear
 * 
 * @example
 * ```tsx
 * const schema: FilterSchema = {
 *   fields: [
 *     { key: "search", type: "text", label: "Search", placeholder: "Search..." },
 *     { key: "status", type: "select", label: "Status", options: statusOptions },
 *     { key: "date_range", type: "daterange", label: "Date Range" },
 *   ],
 *   defaultValues: { search: "", status: "all" },
 * };
 * 
 * <FilterBar
 *   schema={schema}
 *   onFilterChange={handleFilterChange}
 *   resultCount={results.length}
 *   isLoading={isLoading}
 * />
 * ```
 */

export interface FilterBarProps {
  /** Filter schema definition */
  schema: FilterSchema;
  /** Callback when filter values change */
  onFilterChange: (filters: Record<string, FilterValue>) => void;
  /** Number of results (for accessibility announcements) */
  resultCount?: number;
  /** Loading state (for accessibility announcements) */
  isLoading?: boolean;
  /** Test ID for testing */
  "data-testid"?: string;
  /** Additional CSS class */
  className?: string;
  /** Whether to manage URL state internally (default: true) */
  manageUrlState?: boolean;
  /** Focus target element ID after filter changes (e.g., results container) */
  focusTargetId?: string;
}

// ============================================================================
// Text Filter Component
// ============================================================================

interface TextFilterProps {
  field: FilterField;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  debounceMs?: number;
  testId?: string;
}

function TextFilter({
  field,
  value,
  onChange,
  error,
  debounceMs = DEBOUNCE_MS,
  testId,
}: TextFilterProps) {
  const [localValue, setLocalValue] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync local value with external value
  useDidUpdate(() => {
    setLocalValue(value);
  }, [value]);

  // Debounced onChange
  const handleChange = useCallback(
    (newValue: string) => {
      setLocalValue(newValue);
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        onChange(newValue);
      }, debounceMs);
    },
    [onChange, debounceMs]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const inputId = getFilterInputId(field.key, testId);
  const helpId = field.helpText ? getFilterHelpId(field.key) : undefined;
  const errorId = error ? getFilterErrorId(field.key) : undefined;
  const ariaDescribedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <TextInput
      ref={inputRef}
      id={inputId}
      label={field.label}
      placeholder={field.placeholder}
      value={localValue}
      onChange={(e) => handleChange(e.currentTarget.value)}
      aria-describedby={ariaDescribedBy}
      aria-invalid={!!error}
      aria-errormessage={errorId}
      error={error}
      data-testid={testId ? `${testId}-${field.key}` : undefined}
      style={{ minWidth: 200 }}
    />
  );
}

// ============================================================================
// Select Filter Component
// ============================================================================

interface SelectFilterProps {
  field: FilterField;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  testId?: string;
}

function SelectFilter({ field, value, onChange, error, testId }: SelectFilterProps) {
  const options = useMemo(() => {
    if (!field.options) return [];
    return field.options.map((opt) => ({
      value: opt.value,
      label: opt.label,
    }));
  }, [field.options]);

  const inputId = getFilterInputId(field.key, testId);
  const helpId = field.helpText ? getFilterHelpId(field.key) : undefined;
  const errorId = error ? getFilterErrorId(field.key) : undefined;
  const ariaDescribedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <Select
      id={inputId}
      label={field.label}
      placeholder={field.placeholder || "Select..."}
      data={options}
      value={value}
      onChange={(newValue) => newValue && onChange(newValue)}
      aria-describedby={ariaDescribedBy}
      aria-invalid={!!error}
      aria-errormessage={errorId}
      error={error}
      data-testid={testId ? `${testId}-${field.key}` : undefined}
      searchable={options.length > 5}
      style={{ minWidth: 150 }}
    />
  );
}

// ============================================================================
// Date Filter Component
// ============================================================================

interface DateFilterProps {
  field: FilterField;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  error?: string;
  testId?: string;
}

function DateFilter({ field, value, onChange, error, testId }: DateFilterProps) {
  const inputId = getFilterInputId(field.key, testId);
  const helpId = field.helpText ? getFilterHelpId(field.key) : undefined;
  const errorId = error ? getFilterErrorId(field.key) : undefined;
  const ariaDescribedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  // Convert string to Date for DatePickerInput
  const dateValue = value ? new Date(value) : null;

  const handleChange = useCallback(
    (date: Date | null) => {
      if (date) {
        // Format as YYYY-MM-DD
        const formatted = date.toISOString().split("T")[0];
        onChange(formatted);
      } else {
        onChange(undefined);
      }
    },
    [onChange]
  );

  return (
    <DatePickerInput
      id={inputId}
      label={field.label}
      placeholder={field.placeholder || "Select date..."}
      value={dateValue}
      onChange={handleChange}
      aria-describedby={ariaDescribedBy}
      aria-invalid={!!error}
      aria-errormessage={errorId}
      error={error}
      data-testid={testId ? `${testId}-${field.key}` : undefined}
      clearable
      style={{ minWidth: 150 }}
    />
  );
}

// ============================================================================
// Date Range Filter Component
// ============================================================================

interface DateRangeFilterProps {
  field: FilterField;
  value: DateRange | undefined;
  onChange: (value: DateRange | undefined) => void;
  error?: string;
  testId?: string;
}

function DateRangeFilter({ field, value, onChange, error, testId }: DateRangeFilterProps) {
  const inputId = getFilterInputId(field.key, testId);
  const helpId = field.helpText ? getFilterHelpId(field.key) : undefined;
  const errorId = error ? getFilterErrorId(field.key) : undefined;
  const ariaDescribedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  // Convert strings to Dates for DatePickerInput
  const fromDate = value?.from ? new Date(value.from) : null;
  const toDate = value?.to ? new Date(value.to) : null;

  const handleChange = useCallback(
    (dates: [Date | null, Date | null]) => {
      const [from, to] = dates;
      if (from || to) {
        onChange({
          from: from ? from.toISOString().split("T")[0] : "",
          to: to ? to.toISOString().split("T")[0] : "",
        });
      } else {
        onChange(undefined);
      }
    },
    [onChange]
  );

  return (
    <Box>
      <Text size="sm" fw={500} mb={4}>
        {field.label}
      </Text>
      <Group gap="xs" align="flex-end">
        <DatePickerInput
          id={`${inputId}-from`}
          placeholder="From"
          value={fromDate}
          onChange={(date) =>
            handleChange([date, toDate])
          }
          aria-label={`${field.label} from`}
          aria-invalid={!!error}
          aria-describedby={ariaDescribedBy}
          data-testid={testId ? `${testId}-${field.key}-from` : undefined}
          clearable
          style={{ minWidth: 140 }}
        />
        <Text size="sm" c="dimmed">to</Text>
        <DatePickerInput
          id={`${inputId}-to`}
          placeholder="To"
          value={toDate}
          onChange={(date) =>
            handleChange([fromDate, date])
          }
          aria-label={`${field.label} to`}
          aria-invalid={!!error}
          data-testid={testId ? `${testId}-${field.key}-to` : undefined}
          clearable
          style={{ minWidth: 140 }}
        />
      </Group>
      {field.helpText && !error && (
        <Text size="xs" c="dimmed" id={helpId} mt={4}>
          {field.helpText}
        </Text>
      )}
      {error && (
        <Text size="xs" c="red" id={errorId} mt={4} role="alert">
          {error}
        </Text>
      )}
    </Box>
  );
}

// ============================================================================
// Status Filter Component (Multi-select)
// ============================================================================

interface StatusFilterProps {
  field: FilterField;
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
  testId?: string;
}

function StatusFilter({ field, value, onChange, error, testId }: StatusFilterProps) {
  const options = useMemo(() => {
    if (!field.options) return [];
    return field.options.map((opt) => ({
      value: opt.value,
      label: opt.label,
    }));
  }, [field.options]);

  const inputId = getFilterInputId(field.key, testId);
  const helpId = field.helpText ? getFilterHelpId(field.key) : undefined;
  const errorId = error ? getFilterErrorId(field.key) : undefined;
  const ariaDescribedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <MultiSelect
      id={inputId}
      label={field.label}
      placeholder={field.placeholder || "Select status..."}
      data={options}
      value={value}
      onChange={onChange}
      aria-describedby={ariaDescribedBy}
      aria-invalid={!!error}
      aria-errormessage={errorId}
      error={error}
      data-testid={testId ? `${testId}-${field.key}` : undefined}
      searchable
      clearable
      style={{ minWidth: 180 }}
    />
  );
}

// ============================================================================
// Live Region for Accessibility
// ============================================================================

interface LiveRegionProps {
  resultCount?: number;
  isLoading?: boolean;
  lastAction?: "apply" | "clear" | "error" | null;
  errorMessage?: string;
}

function LiveRegion({ resultCount, isLoading, lastAction, errorMessage }: LiveRegionProps) {
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (isLoading) {
      setAnnouncement("Loading results...");
    } else if (lastAction === "clear") {
      setAnnouncement("Filters cleared");
    } else if (lastAction === "error" && errorMessage) {
      setAnnouncement(`Error: ${errorMessage}`);
    } else if (resultCount !== undefined) {
      setAnnouncement(
        `${resultCount} result${resultCount === 1 ? "" : "s"} found`
      );
    }
  }, [isLoading, lastAction, errorMessage, resultCount]);

  return (
    <Box
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: 0,
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {announcement}
    </Box>
  );
}

// ============================================================================
// Main FilterBar Component
// ============================================================================

export function FilterBar({
  schema,
  onFilterChange,
  resultCount,
  isLoading = false,
  "data-testid": testId,
  className,
  manageUrlState = true,
  focusTargetId,
}: FilterBarProps) {
  // Initialize filter values from schema defaults
  const [filterValues, setFilterValues] = useState<Record<string, FilterValue>>(() =>
    getFilterDefaults(schema)
  );
  
  const [lastAction, setLastAction] = useState<"apply" | "clear" | "error" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Validate schema on mount
  useEffect(() => {
    for (const field of schema.fields) {
      if (!isValidFilterField(field)) {
        console.error(`Invalid filter field: ${field.key}`);
      }
    }
  }, [schema.fields]);

  // Update URL when filters change (only if manageUrlState is true)
  useEffect(() => {
    if (!manageUrlState) return;
    
    // Dynamically import serializeFiltersToUrl to avoid circular dependency
    // This allows parent to control URL state via useFilters hook
    import("./types").then(({ serializeFiltersToUrl }) => {
      const urlParams = serializeFiltersToUrl(filterValues);
      if (urlParams) {
        const newUrl = `${window.location.pathname}?${urlParams}`;
        window.history.replaceState(null, "", newUrl);
      }
    });
  }, [filterValues, manageUrlState]);

  // Validate filters when they change
  useEffect(() => {
    const errors: Record<string, string> = {};
    
    for (const field of schema.fields) {
      const value = filterValues[field.key];
      const result = validateFieldValue(field, value);
      if (!result.valid && result.error) {
        errors[field.key] = result.error;
      }
    }
    
    setFieldErrors(errors);
  }, [filterValues, schema.fields]);

  // Handle individual filter changes
  const handleFilterChange = useCallback(
    (key: string, value: FilterValue) => {
      setFilterValues((prev) => ({
        ...prev,
        [key]: value,
      }));
      setLastAction("apply");
      setErrorMessage(undefined);
      
      // Focus management: move focus to results area after filter change
      if (focusTargetId) {
        const target = document.getElementById(focusTargetId);
        if (target) {
          target.focus();
        }
      }
    },
    [focusTargetId]
  );

  // Handle clear all
  const handleClearAll = useCallback(() => {
    const defaults = getFilterDefaults(schema);
    setFilterValues(defaults);
    setLastAction("clear");
    setErrorMessage(undefined);
    setFieldErrors({});
    onFilterChange(defaults);
    
    // Focus management: move focus to first filter after clear
    if (focusTargetId) {
      const target = document.getElementById(focusTargetId);
      if (target) {
        target.focus();
      }
    }
  }, [schema, onFilterChange, focusTargetId]);

  // Notify parent of filter changes (only if valid)
  useDidUpdate(() => {
    if (Object.keys(fieldErrors).length === 0) {
      onFilterChange(filterValues);
    }
  }, [filterValues, onFilterChange, fieldErrors]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    const defaults = getFilterDefaults(schema);
    return Object.keys(filterValues).some(
      (key) => filterValues[key] !== defaults[key]
    );
  }, [filterValues, schema]);

  // Render filter field based on type
  const renderFilterField = useCallback(
    (field: FilterField): ReactNode => {
      const value = filterValues[field.key];
      const error = fieldErrors[field.key];
      const handleChange = (newValue: FilterValue) =>
        handleFilterChange(field.key, newValue);

      switch (field.type) {
        case "text":
          return (
            <TextFilter
              key={field.key}
              field={field}
              value={(value as string) || ""}
              onChange={handleChange}
              error={error}
              testId={testId}
            />
          );

        case "select":
          return (
            <SelectFilter
              key={field.key}
              field={field}
              value={(value as string) || ""}
              onChange={handleChange}
              error={error}
              testId={testId}
            />
          );

        case "date":
          return (
            <DateFilter
              key={field.key}
              field={field}
              value={value as string | undefined}
              onChange={handleChange}
              error={error}
              testId={testId}
            />
          );

        case "daterange":
          return (
            <DateRangeFilter
              key={field.key}
              field={field}
              value={value as DateRange | undefined}
              onChange={handleChange}
              error={error}
              testId={testId}
            />
          );

        case "status":
          return (
            <StatusFilter
              key={field.key}
              field={field}
              value={(value as string[]) || []}
              onChange={handleChange}
              error={error}
              testId={testId}
            />
          );

        default:
          return null;
      }
    },
    [filterValues, fieldErrors, handleFilterChange, testId]
  );

  return (
    <Box
      className={className}
      data-testid={testId}
      style={{ position: "relative" }}
    >
      <Group gap="sm" align="flex-end" wrap="wrap" justify="space-between">
        <Group gap="sm" align="flex-end" wrap="wrap">
          {schema.fields.map(renderFilterField)}
        </Group>

        {hasActiveFilters && (
          <Button
            variant="subtle"
            size="xs"
            onClick={handleClearAll}
            data-testid={testId ? `${testId}-clear-all` : undefined}
          >
            Clear All
          </Button>
        )}
      </Group>

      <LiveRegion
        resultCount={resultCount}
        isLoading={isLoading}
        lastAction={lastAction}
        errorMessage={errorMessage}
      />
    </Box>
  );
}

export default FilterBar;
