// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useCallback, useMemo } from "react";
import { getApiBaseUrl } from "../lib/api-client";

// ============================================================================
// Types
// ============================================================================

export type ExportEntityType = "items" | "prices";
export type ExportFormat = "csv" | "xlsx";

/**
 * Column definition for export
 */
export interface ExportColumn {
  key: string;
  header: string;
  description?: string;
  group: string;
  fieldType?: "string" | "number" | "boolean" | "date" | "datetime" | "money";
  sortable?: boolean;
  filterable?: boolean;
}

/**
 * Export configuration
 */
export interface ExportConfig {
  entityType: ExportEntityType;
  format: ExportFormat;
  selectedColumns: string[];
  filters?: ExportFilters;
}

/**
 * Filters to apply to export
 */
export interface ExportFilters {
  search?: string;
  type?: string;
  groupId?: number | null;
  status?: boolean | null;
  outletId?: number;
  viewMode?: "defaults" | "outlet";
  scopeFilter?: "override" | "default" | null;
  /** Start date for date range filter (ISO string) */
  dateFrom?: string;
  /** End date for date range filter (ISO string) */
  dateTo?: string;
}

/**
 * Export progress info
 */
export interface ExportProgress {
  phase: "preparing" | "streaming" | "complete" | "error";
  rowsProcessed?: number;
  bytesWritten?: number;
  error?: string;
}

/**
 * Export result
 */
export interface ExportResult {
  success: boolean;
  rowCount?: number;
  fileSize?: number;
  filename?: string;
  error?: string;
}

// ============================================================================
// Column Definitions
// ============================================================================

export const ITEM_EXPORT_COLUMNS: ExportColumn[] = [
  // Basic Info
  { key: "id", header: "ID", description: "Unique item identifier", group: "Basic Info", fieldType: "number", sortable: true },
  { key: "sku", header: "SKU", description: "Stock keeping unit code", group: "Basic Info", sortable: true },
  { key: "name", header: "Name", description: "Item name", group: "Basic Info", sortable: true },
  { key: "description", header: "Description", description: "Item description", group: "Basic Info" },
  { key: "item_type", header: "Type", description: "Item type (PRODUCT, SERVICE, etc.)", group: "Basic Info", sortable: true },
  { key: "unit_of_measure", header: "Unit of Measure", description: "Unit for pricing", group: "Basic Info" },
  
  // Classification
  { key: "category_name", header: "Category", description: "Item category", group: "Classification", sortable: true },
  { key: "group_name", header: "Group", description: "Item group name", group: "Classification", sortable: true },
  
  // Pricing
  { key: "base_price", header: "Base Price", description: "Default selling price", group: "Pricing", fieldType: "money", sortable: true },
  { key: "cost_price", header: "Cost Price", description: "Cost for COGS calculation", group: "Pricing", fieldType: "money" },
  
  // Status
  { key: "is_active", header: "Active", description: "Whether item is active", group: "Status", fieldType: "boolean", sortable: true },
  
  // Timestamps
  { key: "created_at", header: "Created At", description: "Creation timestamp", group: "Timestamps", fieldType: "datetime" },
  { key: "updated_at", header: "Updated At", description: "Last update timestamp", group: "Timestamps", fieldType: "datetime" },
];

export const PRICE_EXPORT_COLUMNS: ExportColumn[] = [
  // Item Info
  { key: "item_sku", header: "Item SKU", description: "Item SKU code", group: "Item Info", sortable: true },
  { key: "item_name", header: "Item Name", description: "Item name", group: "Item Info", sortable: true },
  
  // Outlet Info
  { key: "outlet_name", header: "Outlet", description: "Outlet name", group: "Outlet Info", sortable: true },
  
  // Pricing
  { key: "base_price", header: "Base Price", description: "Company default price", group: "Pricing", fieldType: "money", sortable: true },
  { key: "outlet_price", header: "Outlet Price", description: "Outlet-specific price", group: "Pricing", fieldType: "money" },
  { key: "is_overridden", header: "Is Overridden", description: "Whether price is overridden at outlet", group: "Pricing", fieldType: "boolean" },
  
  // Dates
  { key: "effective_date", header: "Effective Date", description: "When price became effective", group: "Dates", fieldType: "date" },
  
  // Timestamps
  { key: "created_at", header: "Created At", description: "Creation timestamp", group: "Timestamps", fieldType: "datetime" },
];

export const DEFAULT_ITEM_COLUMNS = ["id", "sku", "name", "item_type", "group_name", "base_price", "is_active"];
export const DEFAULT_PRICE_COLUMNS = ["item_sku", "item_name", "outlet_name", "base_price", "outlet_price", "is_overridden"];

export const COLUMN_GROUPS = ["Basic Info", "Classification", "Pricing", "Status", "Timestamps", "Item Info", "Outlet Info", "Dates"];

// ============================================================================
// useExportColumns Hook
// ============================================================================

interface UseExportColumnsProps {
  entityType: ExportEntityType;
}

interface UseExportColumnsReturn {
  columns: ExportColumn[];
  defaultColumns: string[];
  availableGroups: string[];
  getColumnsByGroup: (group: string) => ExportColumn[];
}

/**
 * Hook to get available columns for an entity type
 */
export function useExportColumns({ entityType }: UseExportColumnsProps): UseExportColumnsReturn {
  const columns = useMemo(() => {
    return entityType === "items" ? ITEM_EXPORT_COLUMNS : PRICE_EXPORT_COLUMNS;
  }, [entityType]);

  const defaultColumns = useMemo(() => {
    return entityType === "items" ? DEFAULT_ITEM_COLUMNS : DEFAULT_PRICE_COLUMNS;
  }, [entityType]);

  const availableGroups = useMemo(() => {
    const groups = new Set(columns.map((col) => col.group));
    return Array.from(groups);
  }, [columns]);

  const getColumnsByGroup = useCallback(
    (group: string) => {
      return columns.filter((col) => col.group === group);
    },
    [columns]
  );

  return { columns, defaultColumns, availableGroups, getColumnsByGroup };
}

// ============================================================================
// Column Preferences Storage
// ============================================================================

const STORAGE_KEY_PREFIX = "jurnapod-export-columns-";

function getStorageKey(entityType: ExportEntityType): string {
  return `${STORAGE_KEY_PREFIX}${entityType}`;
}

function loadSavedColumns(entityType: ExportEntityType): string[] | null {
  try {
    const saved = sessionStorage.getItem(getStorageKey(entityType));
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function saveColumns(entityType: ExportEntityType, columns: string[]): void {
  try {
    sessionStorage.setItem(getStorageKey(entityType), JSON.stringify(columns));
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// useExport Hook
// ============================================================================

interface UseExportProps {
  accessToken: string;
}

interface UseExportReturn {
  // Configuration state
  config: ExportConfig;
  setFormat: (format: ExportFormat) => void;
  setSelectedColumns: (columns: string[]) => void;
  toggleColumn: (key: string) => void;
  selectAllColumns: () => void;
  selectDefaultColumns: () => void;
  selectNoColumns: () => void;
  moveColumn: (key: string, direction: "up" | "down") => void;

  // Filters
  setFilters: (filters: ExportFilters) => void;

  // Export execution
  executeExport: () => Promise<ExportResult>;

  // State
  loading: boolean;
  progress: ExportProgress | null;
  error: string | null;

  // Preview
  estimatedRowCount: number;
}

export function useExport({ accessToken }: UseExportProps): UseExportReturn {
  // Configuration state
  const [entityType] = useState<ExportEntityType>("items");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [selectedColumns, setSelectedColumnsState] = useState<string[]>(DEFAULT_ITEM_COLUMNS);
  const [filters, setFilters] = useState<ExportFilters>({});
  
  // Execution state
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Estimated row count (would come from API in real implementation)
  const [estimatedRowCount] = useState(0);

  // Get columns for current entity type
  const { columns: allColumns, defaultColumns } = useExportColumns({ entityType });

  // Set selected columns with session storage
  const setSelectedColumns = useCallback(
    (columns: string[]) => {
      setSelectedColumnsState(columns);
      saveColumns(entityType, columns);
    },
    [entityType]
  );

  // Toggle a single column
  const toggleColumn = useCallback(
    (key: string) => {
      const newColumns = selectedColumns.includes(key)
        ? selectedColumns.filter((k) => k !== key)
        : [...selectedColumns, key];
      setSelectedColumns(newColumns);
    },
    [selectedColumns, setSelectedColumns]
  );

  // Select all columns
  const selectAllColumns = useCallback(() => {
    setSelectedColumns(allColumns.map((col) => col.key));
  }, [allColumns, setSelectedColumns]);

  // Select default columns
  const selectDefaultColumns = useCallback(() => {
    setSelectedColumns(defaultColumns);
  }, [defaultColumns, setSelectedColumns]);

  // Select no columns
  const selectNoColumns = useCallback(() => {
    setSelectedColumns([]);
  }, [setSelectedColumns]);

  // Move column up/down in the order
  const moveColumn = useCallback((key: string, direction: "up" | "down") => {
    setSelectedColumnsState((prev) => {
      const index = prev.indexOf(key);
      if (index === -1) return prev;
      
      const newColumns = [...prev];
      if (direction === "up" && index > 0) {
        // Swap with previous
        [newColumns[index - 1], newColumns[index]] = [newColumns[index], newColumns[index - 1]];
      } else if (direction === "down" && index < newColumns.length - 1) {
        // Swap with next
        [newColumns[index], newColumns[index + 1]] = [newColumns[index + 1], newColumns[index]];
      }
      
      saveColumns(entityType, newColumns);
      return newColumns;
    });
  }, [entityType]);

  // Execute export
  const executeExport = useCallback(async (): Promise<ExportResult> => {
    setLoading(true);
    setError(null);
    setProgress({ phase: "preparing" });

    try {
      // Build query params
      const params = new URLSearchParams();
      params.set("format", format);
      params.set("columns", selectedColumns.join(","));
      
      if (filters.search) params.set("search", filters.search);
      if (filters.type) params.set("type", filters.type);
      if (filters.groupId) params.set("group_id", String(filters.groupId));
      if (filters.status !== null && filters.status !== undefined) {
        params.set("is_active", String(filters.status));
      }
      if (filters.outletId) params.set("outlet_id", String(filters.outletId));
      if (filters.viewMode) params.set("view_mode", filters.viewMode);
      if (filters.scopeFilter) params.set("scope_filter", filters.scopeFilter);
      if (filters.dateFrom) params.set("date_from", filters.dateFrom);
      if (filters.dateTo) params.set("date_to", filters.dateTo);

      setProgress({ phase: "streaming" });

      // Use fetch with streaming for large exports
      const response = await fetch(
        `${getApiBaseUrl()}/export/${entityType}?${params.toString()}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`);
      }

      // Get filename from content-disposition header
      const contentDisposition = response.headers.get("content-disposition");
      let filename = `export-${Date.now()}.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match) {
          filename = match[1]?.replace(/['"]/g, "") ?? filename;
        }
      }

      // Get total size for progress tracking
      const contentLength = response.headers.get("content-length");
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      // Stream the response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Response body is not readable");
      }

      const chunks: Uint8Array[] = [];
      let bytesReceived = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        bytesReceived += value.length;

        // Update progress
        if (totalBytes > 0) {
          setProgress({
            phase: "streaming",
            bytesWritten: bytesReceived,
          });
        }
      }

      // Combine chunks into blob
      const blob = new Blob(chunks as BlobPart[], {
        type: format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv;charset=utf-8",
      });

      // Trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setProgress({ phase: "complete" });

      return {
        success: true,
        rowCount: selectedColumns.length, // Approximation
        fileSize: blob.size,
        filename,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Export failed";
      setError(errorMessage);
      setProgress({ phase: "error", error: errorMessage });
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [entityType, format, selectedColumns, filters, accessToken]);

  return {
    config: {
      entityType,
      format,
      selectedColumns,
      filters,
    },
    setFormat,
    setSelectedColumns,
    toggleColumn,
    selectAllColumns,
    selectDefaultColumns,
    selectNoColumns,
    moveColumn,
    setFilters,
    executeExport,
    loading,
    progress,
    error,
    estimatedRowCount,
  };
}

// ============================================================================
// useExportDialog Hook (Standalone)
// ============================================================================

interface UseExportDialogProps {
  entityType: ExportEntityType;
  accessToken: string;
  initialFilters?: ExportFilters;
}

interface UseExportDialogReturn {
  // Columns
  columns: ExportColumn[];
  defaultColumns: string[];
  availableGroups: string[];
  selectedColumns: string[];
  
  // Format
  format: ExportFormat;
  
  // Filters
  filters: ExportFilters;
  
  // Actions
  toggleColumn: (key: string) => void;
  selectAll: () => void;
  selectDefault: () => void;
  selectNone: () => void;
  setFormat: (format: ExportFormat) => void;
  setFilters: (filters: ExportFilters) => void;
  moveColumn: (key: string, direction: "up" | "down") => void;

  // Execution
  export: (overrideFilters?: Partial<ExportFilters>) => Promise<ExportResult>;
  loading: boolean;
  progress: ExportProgress | null;
  error: string | null;
  retry: () => void;
}

/**
 * Standalone hook for export dialog
 */
export function useExportDialog({
  entityType,
  accessToken,
  initialFilters = {},
}: UseExportDialogProps): UseExportDialogReturn {
  const { columns, defaultColumns, availableGroups } = useExportColumns({ entityType });
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => {
    const saved = loadSavedColumns(entityType);
    return saved ?? defaultColumns;
  });
  const [filters, setFilters] = useState<ExportFilters>(initialFilters);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleColumn = useCallback(
    (key: string) => {
      setSelectedColumns((prev) => {
        const newColumns = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
        saveColumns(entityType, newColumns);
        return newColumns;
      });
    },
    [entityType]
  );

  const selectAll = useCallback(() => {
    const allKeys = columns.map((col) => col.key);
    setSelectedColumns(allKeys);
    saveColumns(entityType, allKeys);
  }, [columns, entityType]);

  const selectDefault = useCallback(() => {
    setSelectedColumns(defaultColumns);
    saveColumns(entityType, defaultColumns);
  }, [defaultColumns, entityType]);

  const selectNone = useCallback(() => {
    setSelectedColumns([]);
    saveColumns(entityType, []);
  }, [entityType]);

  const moveColumn = useCallback((key: string, direction: "up" | "down") => {
    setSelectedColumns((prev) => {
      const index = prev.indexOf(key);
      if (index === -1) return prev;

      const newColumns = [...prev];
      if (direction === "up" && index > 0) {
        [newColumns[index - 1], newColumns[index]] = [newColumns[index], newColumns[index - 1]];
      } else if (direction === "down" && index < newColumns.length - 1) {
        [newColumns[index], newColumns[index + 1]] = [newColumns[index + 1], newColumns[index]];
      }

      saveColumns(entityType, newColumns);
      return newColumns;
    });
  }, [entityType]);

  const retry = useCallback(() => {
    setError(null);
    setProgress(null);
  }, []);

  const exportFn = useCallback(async (overrideFilters?: Partial<ExportFilters>): Promise<ExportResult> => {
    setLoading(true);
    setError(null);
    setProgress({ phase: "preparing" });

    // Merge override filters with current filters
    const effectiveFilters = overrideFilters 
      ? { ...filters, ...overrideFilters }
      : filters;

    try {
      // Build query params
      const params = new URLSearchParams();
      params.set("format", format);
      params.set("columns", selectedColumns.join(","));

      if (effectiveFilters.search) params.set("search", effectiveFilters.search);
      if (effectiveFilters.type) params.set("type", effectiveFilters.type);
      if (effectiveFilters.groupId) params.set("group_id", String(effectiveFilters.groupId));
      if (effectiveFilters.status !== null && effectiveFilters.status !== undefined) {
        params.set("is_active", String(effectiveFilters.status));
      }
      if (effectiveFilters.outletId) params.set("outlet_id", String(effectiveFilters.outletId));
      if (effectiveFilters.viewMode) params.set("view_mode", effectiveFilters.viewMode);
      if (effectiveFilters.scopeFilter) params.set("scope_filter", effectiveFilters.scopeFilter);
      if (effectiveFilters.dateFrom) params.set("date_from", effectiveFilters.dateFrom);
      if (effectiveFilters.dateTo) params.set("date_to", effectiveFilters.dateTo);

      setProgress({ phase: "streaming" });

      const response = await fetch(
        `${getApiBaseUrl()}/export/${entityType}?${params.toString()}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`);
      }

      // Get filename
      const contentDisposition = response.headers.get("content-disposition");
      let filename = `jurnapod-${entityType}-${new Date().toISOString().slice(0, 10)}.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match) {
          filename = match[1]?.replace(/['"]/g, "") ?? filename;
        }
      }

      // Stream and download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setProgress({ phase: "complete" });

      return {
        success: true,
        filename,
        fileSize: blob.size,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Export failed";
      setError(errorMessage);
      setProgress({ phase: "error", error: errorMessage });
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [entityType, format, selectedColumns, filters, accessToken]);

  return {
    columns,
    defaultColumns,
    availableGroups,
    selectedColumns,
    format,
    filters,
    toggleColumn,
    selectAll,
    selectDefault,
    selectNone,
    setFormat,
    setFilters,
    moveColumn,
    export: exportFn,
    loading,
    progress,
    error,
    retry,
  };
}
