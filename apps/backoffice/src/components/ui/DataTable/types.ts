// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ColumnDef } from "@tanstack/react-table";

// ============================================================================
// Column Definitions
// ============================================================================

/**
 * Column flags for DataTable configuration
 */
export interface ColumnFlags {
  /** Whether the column is sortable */
  sortable?: boolean;
  /** Whether the column is filterable */
  filterable?: boolean;
  /** Whether the column can be hidden */
  hideable?: boolean;
  /** Whether the column is a row action column (rightmost) */
  isRowAction?: boolean;
  /** Whether the column is a selection column (leftmost) */
  isSelection?: boolean;
}

/**
 * Extended column definition with our custom flags
 */
export type DataTableColumnDef<TData> = ColumnDef<TData, unknown> & ColumnFlags;

// ============================================================================
// Sort State
// ============================================================================

/**
 * Sort direction enum
 */
export type SortDirection = "asc" | "desc" | null;

/**
 * Sort state for a single column
 */
export interface SortState {
  /** Column ID */
  id: string;
  /** Sort direction */
  direction: SortDirection;
}

/**
 * Sort state change handler
 */
export type OnSortChange = (sort: SortState | null) => void;

/**
 * Get aria-sort attribute value from sort direction
 * @param direction - Sort direction
 * @returns aria-sort value for accessibility
 */
export function getAriaSortValue(direction: SortDirection): "ascending" | "descending" | "none" | undefined {
  if (direction === "asc") return "ascending";
  if (direction === "desc") return "descending";
  return "none";
}

// ============================================================================
// Pagination State
// ============================================================================

/**
 * Pagination state
 */
export interface PaginationState {
  /** Current page number (1-indexed) */
  page: number;
  /** Number of items per page */
  pageSize: number;
}

/**
 * Page size options
 */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

/**
 * Pagination state change handler
 */
export type OnPaginationChange = (pagination: PaginationState) => void;

/**
 * Calculate total pages from total count and page size
 */
export function calculateTotalPages(totalCount: number, pageSize: number): number {
  if (pageSize <= 0) return 0;
  return Math.ceil(totalCount / pageSize);
}

/**
 * Calculate pagination range text (e.g., "1-25 of 100")
 */
export function getPaginationRangeText(
  page: number,
  pageSize: number,
  totalCount: number
): string {
  if (totalCount === 0) return "0 items";
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  return `${start}–${end} of ${totalCount}`;
}

// ============================================================================
// Row Selection State
// ============================================================================

/**
 * Row selection state
 */
export interface RowSelectionState {
  /** Map of row ID to selection state */
  [rowId: string]: boolean;
}

/**
 * Batch action for selected rows
 */
export interface BatchAction {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Icon component or element */
  icon?: React.ReactNode;
  /** Color variant */
  color?: string;
  /** Whether action is destructive */
  destructive?: boolean;
}

/**
 * Selection change handler
 */
export type OnSelectionChange = (selection: RowSelectionState) => void;

/**
 * Get array of selected row IDs from selection state
 */
export function getSelectedRowIds<TData>(
  selection: RowSelectionState,
  data: TData[],
  getRowId: (row: TData) => string
): string[] {
  return data
    .filter((row) => selection[getRowId(row)])
    .map(getRowId);
}

/**
 * Check if all rows are selected
 */
export function isAllSelected<TData>(
  selection: RowSelectionState,
  data: TData[],
  getRowId: (row: TData) => string
): boolean {
  if (data.length === 0) return false;
  return data.every((row) => selection[getRowId(row)]);
}

/**
 * Check if some (but not all) rows are selected
 */
export function isSomeSelected<TData>(
  selection: RowSelectionState,
  data: TData[],
  getRowId: (row: TData) => string
): boolean {
  if (data.length === 0) return false;
  const selectedCount = data.filter((row) => selection[getRowId(row)]).length;
  return selectedCount > 0 && selectedCount < data.length;
}

// ============================================================================
// Loading & Error States
// ============================================================================

/**
 * Table loading state variant
 */
export type LoadingState = "idle" | "loading" | "refreshing" | "error";

/**
 * Error state with retry capability
 */
export interface TableError {
  /** Error message */
  message: string;
  /** Whether retry is available */
  retryable?: boolean;
  /** Optional callback for retry action */
  onRetry?: () => void;
}

/**
 * Skeleton loader dimensions for a column
 */
export interface SkeletonDimension {
  /** Width of skeleton placeholder */
  width?: number | string;
  /** Height of skeleton placeholder */
  height?: number;
}

/**
 * Accessibility IDs for table regions
 */
export interface TableAriaIds {
  /** ID for skip link target */
  skipLink?: string;
  /** ID for table caption/summary */
  tableSummary?: string;
  /** ID for live region announcements */
  liveRegion?: string;
  /** ID for pagination info */
  paginationInfo?: string;
}

/**
 * Generate standard table aria IDs
 */
export function generateTableAriaIds(testId?: string): TableAriaIds {
  const base = testId ?? "datatable";
  return {
    skipLink: `${base}-skip-link`,
    tableSummary: `${base}-summary`,
    liveRegion: `${base}-live-region`,
    paginationInfo: `${base}-pagination-info`,
  };
}

// ============================================================================
// Table State Manager (AC2: Deterministic State Transitions)
// ============================================================================

/**
 * Sequence number for tracking request order
 */
let requestSequence = 0;

/**
 * Get the next sequence number for request ordering
 */
export function getNextSequence(): number {
  return ++requestSequence;
}

/**
 * Table state manager for handling race conditions and stale data
 */
export class TableStateManager {
  private currentSequence: number = 0;
  private pendingRequest: AbortController | null = null;

  /**
   * Start a new request with sequence tracking
   * Cancels any pending request to prevent stale data races
   */
  startRequest(): { sequence: number; signal: AbortSignal } {
    // Cancel any pending request
    if (this.pendingRequest) {
      this.pendingRequest.abort("New request started");
    }

    this.currentSequence = getNextSequence();
    this.pendingRequest = new AbortController();

    return {
      sequence: this.currentSequence,
      signal: this.pendingRequest.signal,
    };
  }

  /**
   * Check if a response is still valid (not superseded by newer request)
   */
  isResponseValid(responseSequence: number): boolean {
    return responseSequence === this.currentSequence;
  }

  /**
   * Cancel pending request
   */
  cancelPending(): void {
    if (this.pendingRequest) {
      this.pendingRequest.abort("Cancelled by user");
      this.pendingRequest = null;
    }
  }

  /**
   * Get current sequence number
   */
  getCurrentSequence(): number {
    return this.currentSequence;
  }

  /**
   * Reset state manager
   */
  reset(): void {
    this.cancelPending();
    this.currentSequence = 0;
  }
}

// ============================================================================
// Page Reset Rules (AC2 Task 3)
// ============================================================================

/**
 * Determine if pagination should reset when filter/sort changes
 */
export interface PageResetRule {
  /** Trigger that caused the change */
  trigger: "filter_change" | "sort_change" | "page_size_change";
  /** Whether to reset to page 1 */
  shouldReset: boolean;
}

/**
 * Get page reset rule based on trigger
 * Filters and sort changes always reset to page 1
 * Page size changes keep current page if possible
 */
export function getPageResetRule(trigger: "filter_change" | "sort_change" | "page_size_change"): PageResetRule {
  switch (trigger) {
    case "filter_change":
    case "sort_change":
      return { trigger, shouldReset: true };
    case "page_size_change":
      return { trigger, shouldReset: false };
  }
}

/**
 * Calculate safe page after page size change
 */
export function calculateSafePage(
  currentPage: number,
  currentPageSize: number,
  newPageSize: number,
  totalCount: number
): number {
  const newTotalPages = calculateTotalPages(totalCount, newPageSize);
  return Math.min(currentPage, Math.max(1, newTotalPages));
}

// ============================================================================
// Optimistic vs Server State (AC2 Task 4)
// ============================================================================

/**
 * State source indicator
 */
export type StateSource = "optimistic" | "server" | "initial";

/**
 * Wrapper for data with state source tracking
 */
export interface StateWrapper<T> {
  /** The actual data */
  data: T;
  /** Source of the state */
  source: StateSource;
  /** Timestamp when state was set */
  timestamp: number;
}

/**
 * Create a state wrapper with current timestamp
 */
export function wrapState<T>(data: T, source: StateSource = "server"): StateWrapper<T> {
  return {
    data,
    source,
    timestamp: Date.now(),
  };
}

// ============================================================================
// Column Lookup Helpers (for efficient cell rendering)
// ============================================================================

/**
 * Find a column by its id or accessorKey
 * Used for efficient cell rendering without O(rows × columns²) lookups
 */
export function findColumnById<TData>(
  columns: DataTableColumnDef<TData>[],
  columnId: string
): DataTableColumnDef<TData> | undefined {
  return columns.find((col) => {
    if (col.id === columnId) return true;
    // Check accessorKey via unsafe cast (TanStack Table type quirk)
    const colAny = col as unknown as { accessorKey?: string };
    return colAny.accessorKey === columnId;
  });
}

/**
 * Build a map of columnId -> column for O(1) lookups
 * Should be called once per render, not per row/cell
 */
export function buildColumnMap<TData>(
  columns: DataTableColumnDef<TData>[]
): Map<string, DataTableColumnDef<TData>> {
  const map = new Map<string, DataTableColumnDef<TData>>();
  for (const col of columns) {
    if (col.id) {
      map.set(col.id, col);
    }
    // Also map by accessorKey if present
    const colAny = col as unknown as { accessorKey?: string };
    if (colAny.accessorKey && colAny.accessorKey !== col.id) {
      map.set(colAny.accessorKey, col);
    }
  }
  return map;
}

/**
 * Check if a column is a selection column
 */
export function isSelectionColumn<TData>(
  column: DataTableColumnDef<TData> | undefined
): boolean {
  return column?.isSelection === true;
}

/**
 * Check if a column is a row action column
 */
export function isRowActionColumn<TData>(
  column: DataTableColumnDef<TData> | undefined
): boolean {
  return column?.isRowAction === true;
}

// ============================================================================
// State Wrapper Utilities (AC2 Task 4)
// ============================================================================

/**
 * Compare two state wrappers and determine which is newer
 */
export function isNewerState<T>(
  a: StateWrapper<T>,
  b: StateWrapper<T>
): boolean {
  return a.timestamp > b.timestamp;
}

/**
 * Merge optimistic and server states, keeping the most recent
 */
export function mergeState<T>(
  optimistic: StateWrapper<T> | null,
  server: StateWrapper<T>
): T {
  if (!optimistic) return server.data;
  return isNewerState(optimistic, server) ? optimistic.data : server.data;
}

// ============================================================================
// Performance Budget Helpers (AC3)
// ============================================================================

/**
 * Performance budget for standard CRUD/list APIs (p95 < 200ms)
 * These helpers track and validate performance budgets
 */
export interface PerformanceBudget {
  /** Target p95 latency in milliseconds */
  targetMs: number;
  /** Actual p95 latency in milliseconds */
  actualMs: number;
  /** Whether the budget was met */
  met: boolean;
}

/**
 * Check if a timing meets the performance budget
 */
export function checkPerformanceBudget(
  targetMs: number,
  actualMs: number
): PerformanceBudget {
  return {
    targetMs,
    actualMs,
    met: actualMs <= targetMs,
  };
}

/**
 * Default performance budget for table interactions (p95 < 200ms)
 */
export const DEFAULT_TABLE_PERF_BUDGET = 200; // ms

// ============================================================================
// Batch Selection Helpers
// ============================================================================

/**
 * Count selected rows from selection state
 */
export function countSelectedRows(selection: RowSelectionState): number {
  return Object.values(selection).filter(Boolean).length;
}

/**
 * Check if a specific row is selected
 */
export function isRowSelected(
  selection: RowSelectionState,
  rowId: string
): boolean {
  return !!selection[rowId];
}

/**
 * Toggle a row's selection state
 */
export function toggleRowSelection(
  selection: RowSelectionState,
  rowId: string
): RowSelectionState {
  const newSelection = { ...selection };
  if (newSelection[rowId]) {
    delete newSelection[rowId];
  } else {
    newSelection[rowId] = true;
  }
  return newSelection;
}

/**
 * Clear all selections
 */
export function clearAllSelections(): RowSelectionState {
  return {};
}

/**
 * Select all rows
 */
export function selectAllRows<TData>(
  data: TData[],
  getRowId: (row: TData) => string
): RowSelectionState {
  const selection: RowSelectionState = {};
  for (const row of data) {
    selection[getRowId(row)] = true;
  }
  return selection;
}

// ============================================================================
// Announcement Helpers (for screen reader live regions)
// ============================================================================

/**
 * Generate announcement for sort change
 */
export function announceSortChange(
  columnLabel: string,
  direction: SortDirection
): string {
  if (direction === null) {
    return `Sort cleared for ${columnLabel}`;
  }
  const directionText = direction === "asc" ? "ascending" : "descending";
  return `Table sorted by ${columnLabel} in ${directionText} order`;
}

/**
 * Generate announcement for page change
 */
export function announcePageChange(
  page: number,
  totalPages: number,
  totalCount: number
): string {
  return `Page ${page} of ${totalPages}, showing ${totalCount} total results`;
}

/**
 * Generate announcement for selection change
 */
export function announceSelectionChange(selectedCount: number): string {
  if (selectedCount === 0) {
    return "Selection cleared";
  }
  return `${selectedCount} row${selectedCount !== 1 ? "s" : ""} selected`;
}

/**
 * Generate announcement for batch action
 */
export function announceBatchAction(
  actionLabel: string,
  selectedCount: number
): string {
  return `Executing ${actionLabel} on ${selectedCount} selected rows`;
}

/**
 * Generate announcement for error state
 */
export function announceError(retryable: boolean): string {
  if (retryable) {
    return "Error loading data. Retry available.";
  }
  return "Error loading data.";
}

/**
 * Generate announcement for retry
 */
export function announceRetry(): string {
  return "Retrying data load";
}

// ============================================================================
// Export All Types
// ============================================================================

export type {
  // Re-export ColumnDef for convenience
  ColumnDef,
};