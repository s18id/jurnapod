// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ReactNode } from "react";
import {
  ActionIcon,
  Box,
  Checkbox,
  Group,
  Pagination,
  ScrollArea,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronUp,
  IconSelector,
  IconRefresh,
  IconAlertCircle,
  IconDatabaseOff,
} from "@tabler/icons-react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSort,
  type Row,
} from "@tanstack/react-table";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type {
  BatchAction,
  DataTableColumnDef,
  LoadingState,
  OnPaginationChange,
  OnSelectionChange,
  OnSortChange,
  PaginationState,
  RowSelectionState,
  SortDirection,
  SortState,
  TableError,
} from "./types";
import {
  calculateTotalPages,
  findColumnById,
  buildColumnMap,
  generateTableAriaIds,
  getAriaSortValue,
  getPaginationRangeText,
  getPageResetRule,
  isAllSelected,
  isSomeSelected,
  PAGE_SIZE_OPTIONS,
  TableStateManager,
} from "./types";

// ============================================================================
// Constants
// ============================================================================

/** Minimum width for table container */
const MIN_TABLE_WIDTH = 400;

// ============================================================================
// Props Interface
// ============================================================================

export interface DataTableProps<TData> {
  /** Column definitions */
  columns: DataTableColumnDef<TData>[];
  /** Table data */
  data: TData[];
  /** Unique row identifier function */
  getRowId: (row: TData) => string;
  /** Loading state */
  loading?: LoadingState;
  /** Error state */
  error?: TableError | null;
  /** Total count for pagination */
  totalCount?: number;
  /** Current pagination state */
  pagination?: PaginationState;
  /** Current sort state */
  sort?: SortState | null;
  /** Current selection state */
  selection?: RowSelectionState;
  /** Batch actions for selected rows */
  batchActions?: BatchAction[];
  /** Callback when sort changes */
  onSortChange?: OnSortChange;
  /** Callback when pagination changes */
  onPaginationChange?: OnPaginationChange;
  /** Callback when selection changes */
  onSelectionChange?: OnSelectionChange;
  /** Callback when retry is clicked */
  onRetry?: () => void;
  /** Skeleton loader dimensions by column id */
  skeletonDimensions?: Record<string, { width?: number | string; height?: number }>;
  /** Empty state message */
  emptyState?: ReactNode;
  /** Error state message */
  errorState?: ReactNode;
  /** Table caption for accessibility */
  caption?: string;
  /** Test ID for testing */
  "data-testid"?: string;
  /** Additional CSS class */
  className?: string;
  /** Minimum table width */
  minWidth?: number;
  /** Enable sticky header */
  stickyHeader?: boolean;
  /** Enable zebra striping */
  zebraStriping?: boolean;
}

// ============================================================================
// Sub-components
// ============================================================================

// --------------------------------------------------------------------------
// Skip Link (AC4 Task 4)
// --------------------------------------------------------------------------

interface SkipLinkProps {
  targetId: string;
}

function SkipLink({ targetId }: SkipLinkProps) {
  return (
    <Box
      component="a"
      href={`#${targetId}`}
      className="datatable-skip-link"
      style={{
        position: "absolute",
        left: "-9999px",
        zIndex: 1000,
        padding: "8px 16px",
        background: "var(--mantine-color-blue-6)",
        color: "white",
        textDecoration: "none",
        borderRadius: "4px",
      }}
      onFocus={(e) => {
        e.currentTarget.style.left = "8px";
        e.currentTarget.style.top = "8px";
      }}
      onBlur={(e) => {
        e.currentTarget.style.left = "-9999px";
      }}
    >
      Skip to table content
    </Box>
  );
}

// --------------------------------------------------------------------------
// Live Region for Accessibility Announcements (AC4)
// --------------------------------------------------------------------------

interface LiveRegionProps {
  announcement: string;
  "data-testid"?: string;
}

function LiveRegion({ announcement, "data-testid": testId }: LiveRegionProps) {
  const regionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (regionRef.current && announcement) {
      regionRef.current.textContent = "";
      // Force reflow
      void regionRef.current.offsetHeight;
      regionRef.current.textContent = announcement;
    }
  }, [announcement]);

  return (
    <Box
      component="div"
      ref={regionRef}
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid={testId}
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
    />
  );
}

// --------------------------------------------------------------------------
// Sort Header Cell (AC1 Task 2, AC4 Task 2)
// --------------------------------------------------------------------------

interface SortHeaderCellProps {
  columnId: string;
  label: string;
  sortable?: boolean;
  sortDirection: SortDirection;
  onSortChange: OnSortChange;
  testId?: string;
}

function SortHeaderCell({
  columnId,
  label,
  sortable,
  sortDirection,
  onSortChange,
  testId,
}: SortHeaderCellProps) {
  const handleSortClick = useCallback(() => {
    if (!sortable) return;

    let newDirection: SortDirection = "asc";
    if (sortDirection === "asc") {
      newDirection = "desc";
    } else if (sortDirection === "desc") {
      newDirection = null;
    }

    onSortChange(newDirection ? { id: columnId, direction: newDirection } : null);
  }, [columnId, sortable, sortDirection, onSortChange]);

  const ariaSort = getAriaSortValue(sortDirection);

  const sortIcon = useMemo(() => {
    if (!sortable) return null;
    if (sortDirection === "asc") return <IconChevronUp size={14} />;
    if (sortDirection === "desc") return <IconChevronDown size={14} />;
    return <IconSelector size={14} style={{ opacity: 0.5 }} />;
  }, [sortDirection, sortable]);

  return (
    <Box
      component="th"
      scope="col"
      className={sortable ? "datatable-sortable-header" : undefined}
      aria-sort={ariaSort}
      data-column-id={columnId}
      data-testid={testId ? `${testId}-header-${columnId}` : undefined}
    >
      <Group gap={4} wrap="nowrap">
        <Text size="sm" fw={500}>
          {label}
        </Text>
        {sortable && (
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={handleSortClick}
            aria-label={`Sort by ${label}, currently ${ariaSort || "unsorted"}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSortClick();
              }
            }}
            data-testid={testId ? `${testId}-sort-button` : undefined}
          >
            {sortIcon}
          </ActionIcon>
        )}
      </Group>
    </Box>
  );
}

// --------------------------------------------------------------------------
// Skeleton Loader (AC3 Task 1-3)
// --------------------------------------------------------------------------

interface SkeletonRowProps {
  columns: ColumnDef<unknown, unknown>[];
  skeletonDimensions?: Record<string, { width?: number | string; height?: number }>;
  testId?: string;
}

function SkeletonRow({ columns, skeletonDimensions, testId }: SkeletonRowProps) {
  return (
    <Table.Tr data-testid={testId ? `${testId}-skeleton-row` : undefined}>
      {columns.map((column, index) => {
        const columnId = typeof column.id === "string" ? column.id : String(index);
        const dim = skeletonDimensions?.[columnId];
        const width = dim?.width ?? (columnId === "selection" ? 40 : 100);
        const height = dim?.height ?? 16;

        return (
          <Table.Td key={columnId}>
            <Skeleton
              height={height}
              width={typeof width === "number" ? `${width}px` : width}
              radius="sm"
            />
          </Table.Td>
        );
      })}
    </Table.Tr>
  );
}

interface SkeletonLoaderProps {
  columns: ColumnDef<unknown, unknown>[];
  rowCount?: number;
  skeletonDimensions?: Record<string, { width?: number | string; height?: number }>;
  testId?: string;
}

function SkeletonLoader({
  columns,
  rowCount = 5,
  skeletonDimensions,
  testId,
}: SkeletonLoaderProps) {
  return (
    <Table.Tbody data-testid={testId ? `${testId}-skeleton` : undefined}>
      {Array.from({ length: rowCount }).map((_, index) => (
        <SkeletonRow
          key={index}
          columns={columns}
          skeletonDimensions={skeletonDimensions}
          testId={testId}
        />
      ))}
    </Table.Tbody>
  );
}

// --------------------------------------------------------------------------
// Empty State (AC1 Task 5)
// --------------------------------------------------------------------------

interface EmptyStateProps {
  message?: ReactNode;
  testId?: string;
}

function EmptyState({ message, testId }: EmptyStateProps) {
  return (
    <Table.Tr data-testid={testId ? `${testId}-empty-state` : undefined}>
      <Table.Td colSpan={100}>
        <Stack align="center" gap="md" py="xl">
          <IconDatabaseOff size={48} stroke={1.5} color="var(--mantine-color-gray-5)" />
          <Text c="dimmed" size="sm" ta="center">
            {message ?? "No data available"}
          </Text>
        </Stack>
      </Table.Td>
    </Table.Tr>
  );
}

// --------------------------------------------------------------------------
// Error State (AC1 Task 5-6)
// --------------------------------------------------------------------------

interface ErrorStateProps {
  error: TableError;
  onRetry?: () => void;
  testId?: string;
}

function ErrorState({ error, onRetry, testId }: ErrorStateProps) {
  return (
    <Table.Tr data-testid={testId ? `${testId}-error-state` : undefined}>
      <Table.Td colSpan={100}>
        <Stack align="center" gap="md" py="xl">
          <IconAlertCircle size={48} stroke={1.5} color="var(--mantine-color-red-5)" />
          <Text c="dimmed" size="sm" ta="center">
            {error.message}
          </Text>
          {error.retryable !== false && onRetry && (
            <ActionIcon
              variant="light"
              color="red"
              size="lg"
              onClick={onRetry}
              aria-label="Retry loading data"
              data-testid={testId ? `${testId}-retry-button` : undefined}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          )}
        </Stack>
      </Table.Td>
    </Table.Tr>
  );
}

// --------------------------------------------------------------------------
// Selection Header Cell (AC1 Task 4)
// --------------------------------------------------------------------------

interface SelectionHeaderProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  testId?: string;
}

function SelectionHeader({
  checked,
  indeterminate,
  onChange,
  disabled,
  testId,
}: SelectionHeaderProps) {
  return (
    <Box component="th" scope="col" style={{ width: 40 }}>
      <Checkbox
        checked={checked}
        indeterminate={indeterminate}
        onChange={(e) => onChange(e.currentTarget.checked)}
        disabled={disabled}
        aria-label="Select all rows"
        data-testid={testId ? `${testId}-select-all` : undefined}
      />
    </Box>
  );
}

// --------------------------------------------------------------------------
// Selection Cell (AC1 Task 4)
// --------------------------------------------------------------------------

interface SelectionCellProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  rowId: string;
  testId?: string;
}

function SelectionCell({
  checked,
  onChange,
  disabled,
  rowId,
  testId,
}: SelectionCellProps) {
  return (
    <Table.Td>
      <Checkbox
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        disabled={disabled}
        aria-label={`Select row ${rowId}`}
        data-testid={testId ? `${testId}-select-${rowId}` : undefined}
      />
    </Table.Td>
  );
}

// --------------------------------------------------------------------------
// Pagination Controls (AC1 Task 3)
// --------------------------------------------------------------------------

interface PaginationControlsProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPaginationChange: OnPaginationChange;
  testId?: string;
}

function PaginationControls({
  page,
  pageSize,
  totalCount,
  onPaginationChange,
  testId,
}: PaginationControlsProps) {
  const totalPages = calculateTotalPages(totalCount, pageSize);
  const rangeText = getPaginationRangeText(page, pageSize, totalCount);

  const handlePageChange = useCallback(
    (newPage: number) => {
      onPaginationChange({ page: newPage, pageSize });
    },
    [pageSize, onPaginationChange]
  );

  const handlePageSizeChange = useCallback(
    (newPageSize: string | null) => {
      if (!newPageSize) return;
      const size = parseInt(newPageSize, 10);
      onPaginationChange({ page: 1, pageSize: size });
    },
    [onPaginationChange]
  );

  if (totalPages <= 1 && totalCount === 0) {
    return null;
  }

  return (
    <Group gap="md" justify="space-between" wrap="wrap">
      <Group gap="sm">
        <Text size="sm" c="dimmed" data-testid={testId ? `${testId}-range-text` : undefined}>
          {rangeText}
        </Text>
        <Select
          value={String(pageSize)}
          data={PAGE_SIZE_OPTIONS.map((size) => ({
            value: String(size),
            label: `${size} per page`,
          }))}
          onChange={handlePageSizeChange}
          size="xs"
          w={100}
          aria-label="Items per page"
          data-testid={testId ? `${testId}-page-size-select` : undefined}
        />
      </Group>
      {totalPages > 1 && (
        <Pagination
          value={page}
          onChange={handlePageChange}
          total={totalPages}
          size="sm"
          data-testid={testId ? `${testId}-pagination` : undefined}
        />
      )}
    </Group>
  );
}

// --------------------------------------------------------------------------
// Batch Action Bar (AC1 Task 4)
// --------------------------------------------------------------------------

interface BatchActionBarProps {
  selectedCount: number;
  actions: BatchAction[];
  onAction: (action: BatchAction) => void;
  onClearSelection: () => void;
  testId?: string;
  forwardedRef?: React.Ref<HTMLDivElement>;
}

function BatchActionBar({
  selectedCount,
  actions,
  onAction,
  onClearSelection,
  testId,
  forwardedRef,
}: BatchActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <Box
      component="div"
      tabIndex={-1}
      className="datatable-batch-bar"
      py="sm"
      px="md"
      style={{
        backgroundColor: "var(--mantine-color-blue-0)",
        borderBottom: "1px solid var(--mantine-color-blue-2)",
        outline: "none",
      }}
      data-testid={testId ? `${testId}-batch-bar` : undefined}
      ref={forwardedRef}
    >
      <Group gap="md" justify="space-between">
        <Text size="sm" fw={500}>
          {selectedCount} row{selectedCount !== 1 ? "s" : ""} selected
        </Text>
        <Group gap="sm">
          {actions.map((action) => (
            <ActionIcon
              key={action.id}
              variant="light"
              color={action.color ?? "blue"}
              size="md"
              onClick={() => onAction(action)}
              aria-label={action.label}
              title={action.label}
            >
              {action.icon}
            </ActionIcon>
          ))}
          <ActionIcon
            variant="subtle"
            size="md"
            onClick={onClearSelection}
            aria-label="Clear selection"
            data-testid={testId ? `${testId}-clear-selection` : undefined}
          >
            ✕
          </ActionIcon>
        </Group>
      </Group>
    </Box>
  );
}

// --------------------------------------------------------------------------
// Loading Overlay (AC3 Task 2)
// --------------------------------------------------------------------------

interface LoadingOverlayProps {
  visible: boolean;
  testId?: string;
}

function LoadingOverlay({ visible, testId }: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <Box
      className="datatable-loading-overlay"
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "rgba(255, 255, 255, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
      }}
      data-testid={testId ? `${testId}-loading-overlay` : undefined}
      aria-hidden="true"
    >
      <Text size="sm" c="dimmed">
        Loading...
      </Text>
    </Box>
  );
}

// ============================================================================
// Main DataTable Component
// ============================================================================

/**
 * DataTable Component
 *
 * A comprehensive, accessible data table component with consistent
 * interaction patterns across all backoffice pages.
 *
 * Features:
 * - AC1: Consistent Table Controls (sort, pagination, selection, empty/error states, retry)
 * - AC2: Deterministic State Transitions (request cancellation, sequence numbers)
 * - AC3: Loading States (skeleton loader, loading overlay, no layout shift)
 * - AC4: WCAG 2.1 AA Accessibility (aria-sort, keyboard nav, skip links)
 *
 * @example
 * ```tsx
 * const columns: DataTableColumnDef<User>[] = [
 *   {
 *     id: 'name',
 *     header: 'Name',
 *     accessorKey: 'name',
 *     sortable: true,
 *   },
 *   {
 *     id: 'status',
 *     header: 'Status',
 *     cell: (info) => <StatusBadge status={info.row.original.status} />,
 *   },
 * ];
 *
 * <DataTable
 *   columns={columns}
 *   data={users}
 *   getRowId={(user) => user.id}
 *   pagination={{ page: 1, pageSize: 25 }}
 *   sort={{ id: 'name', direction: 'asc' }}
 *   onSortChange={(sort) => handleSort(sort)}
 *   onPaginationChange={(p) => handlePage(p)}
 * />
 * ```
 */
export function DataTable<TData>({
  columns,
  data,
  getRowId,
  loading = "idle",
  error = null,
  totalCount = data.length,
  pagination = { page: 1, pageSize: 25 },
  sort = null,
  selection = {},
  batchActions = [],
  onSortChange,
  onPaginationChange,
  onSelectionChange,
  onRetry,
  skeletonDimensions,
  emptyState,
  caption,
  "data-testid": testId,
  className,
  minWidth = MIN_TABLE_WIDTH,
  stickyHeader = false,
  zebraStriping = false,
}: DataTableProps<TData>) {
  // Generate accessibility IDs
  const baseId = useId();
  const ariaIds = generateTableAriaIds(testId);

  // State manager for request cancellation (AC2 Task 1)
  const stateManager = useMemo(() => new TableStateManager(), []);

  // Ref for batch action bar (for focus management)
  const batchBarRef = useRef<HTMLDivElement>(null);
  // Ref for table container (for focus on retry)
  const tableRef = useRef<HTMLDivElement>(null);

  // Track previous selection count for focus management
  const prevSelectionCount = useRef(0);

  // Local announcement for screen readers
  const [announcement, setAnnouncement] = useState("");

  // Determine if loading overlay should show
  const showLoadingOverlay = loading === "refreshing";

  // Calculate if all/some/none rows are selected
  const allSelected = useMemo(
    () => isAllSelected(selection, data, getRowId),
    [selection, data, getRowId]
  );
  const someSelected = useMemo(
    () => isSomeSelected(selection, data, getRowId),
    [selection, data, getRowId]
  );

  // Build column map once for O(1) lookups instead of O(columns) per cell/header
  // This optimizes from O(rows × columns²) to O(rows × columns)
  const columnMap = useMemo(() => buildColumnMap(columns), [columns]);

  // Focus management for accessibility (AC4)
  // Focus batch bar when selection appears, focus table on retry
  const currentSelectionCount = Object.keys(selection).length;
  useEffect(() => {
    // When selection goes from 0 to > 0, focus the batch bar
    if (prevSelectionCount.current === 0 && currentSelectionCount > 0 && batchBarRef.current) {
      batchBarRef.current.focus();
    }
    prevSelectionCount.current = currentSelectionCount;
  }, [currentSelectionCount]);

  // Handle sort change with page reset rule (AC2 Task 3)
  const handleSortChange = useCallback(
    (newSort: SortState | null) => {
      // Filters and sort changes always reset to page 1
      const rule = getPageResetRule(newSort ? "sort_change" : "filter_change");
      if (rule.shouldReset && pagination.page !== 1 && onPaginationChange) {
        onPaginationChange({ ...pagination, page: 1 });
      }
      onSortChange?.(newSort);
    },
    [pagination, onPaginationChange, onSortChange]
  );

  // Handle selection change
  const handleSelectionChange = useCallback(
    (newSelection: RowSelectionState) => {
      onSelectionChange?.(newSelection);
    },
    [onSelectionChange]
  );

  // Handle select all
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      const newSelection: RowSelectionState = {};
      if (checked) {
        data.forEach((row) => {
          newSelection[getRowId(row)] = true;
        });
      }
      handleSelectionChange(newSelection);
    },
    [data, getRowId, handleSelectionChange]
  );

  // Handle row selection toggle
  const handleRowSelect = useCallback(
    (rowId: string, checked: boolean) => {
      handleSelectionChange({
        ...selection,
        [rowId]: checked,
      });
    },
    [selection, handleSelectionChange]
  );

  // Handle batch action
  const handleBatchAction = useCallback(
    (action: BatchAction) => {
      // Emit announcement
      setAnnouncement(`Executing ${action.label} on ${Object.keys(selection).length} selected rows`);
      // In real usage, parent would handle the action
    },
    [selection]
  );

  // Handle clear selection
  const handleClearSelection = useCallback(() => {
    handleSelectionChange({});
    setAnnouncement("Selection cleared");
  }, [handleSelectionChange]);

  // Handle retry
  const handleRetry = useCallback(() => {
    stateManager.cancelPending();
    onRetry?.();
    setAnnouncement("Retrying data load");
    // Focus table after retry for accessibility
    if (tableRef.current) {
      tableRef.current.focus();
    }
  }, [stateManager, onRetry]);

  // Get column header label
  const getHeaderLabel = useCallback(
    (column: DataTableColumnDef<TData>): string => {
      if (typeof column.header === "string") {
        return column.header;
      }
      if (typeof column.header === "function") {
        return "Column";
      }
      return String(column.id ?? "");
    },
    []
  );

  // Transform SortState to ColumnSort for TanStack table
  const columnSorting: ColumnSort[] = sort
    ? [{ id: sort.id, desc: sort.direction === "desc" }]
    : [];

  // Setup TanStack table
  const table = useReactTable({
    data,
    columns: columns as ColumnDef<TData, unknown>[],
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: !!onSortChange,
    manualPagination: !!onPaginationChange,
    state: {
      sorting: columnSorting,
    },
  });

  // Render table header
  const renderHeader = useCallback(
    (): ReactNode => {
      const selectionColumn = columns.find((col) => col.isSelection);
      const showSelection = !!selectionColumn;

      return (
        <Table.Thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <Table.Tr key={headerGroup.id}>
              {/* Selection header */}
              {showSelection && (
                <SelectionHeader
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onChange={handleSelectAll}
                  disabled={loading !== "idle"}
                  testId={testId}
                />
              )}

              {/* Column headers */}
              {headerGroup.headers.map((header) => {
                // Use column map for O(1) lookup instead of O(columns) find
                const column = findColumnById(columns, header.column.id);
                const isSelection = column?.isSelection;

                if (isSelection) return null; // Already rendered above

                const label = getHeaderLabel(column as DataTableColumnDef<TData>);
                const sortable = column?.sortable ?? false;
                const sortDir = sort?.id === header.column.id ? sort.direction : null;

                return (
                  <SortHeaderCell
                    key={header.id}
                    columnId={header.column.id}
                    label={label}
                    sortable={sortable}
                    sortDirection={sortDir}
                    onSortChange={handleSortChange}
                    testId={testId}
                  />
                );
              })}
            </Table.Tr>
          ))}
        </Table.Thead>
      );
    },
    [
      columns,
      columnMap,
      table,
      allSelected,
      someSelected,
      handleSelectAll,
      handleSortChange,
      sort,
      getHeaderLabel,
      loading,
      testId,
    ]
  );

  // Render table body
  const renderBody = useCallback((): ReactNode => {
    // Error state
    if (error) {
      return (
        <ErrorState
          error={error}
          onRetry={handleRetry}
          testId={testId}
        />
      );
    }

    // Loading skeleton (must come before empty state check — data is empty during initial load)
    if (loading === "loading") {
      return (
        <SkeletonLoader
          columns={columns as ColumnDef<unknown, unknown>[]}
          rowCount={pagination.pageSize}
          skeletonDimensions={skeletonDimensions}
          testId={testId}
        />
      );
    }

    // Empty state
    if (data.length === 0) {
      return <EmptyState message={emptyState} testId={testId} />;
    }

    // Normal data rows
    const selectionColumn = columns.find((col) => col.isSelection);
    const showSelection = !!selectionColumn;

    return (
      <Table.Tbody>
        {table.getRowModel().rows.map((row, rowIndex) => {
          const rowId = getRowId(row.original);
          const isSelected = !!selection[rowId];
          const zebraClass = zebraStriping && rowIndex % 2 === 1 ? "datatable-zebra-row" : undefined;

          return (
            <Table.Tr
              key={row.id}
              data-selected={isSelected}
              className={zebraClass}
              data-testid={testId ? `${testId}-row-${rowId}` : undefined}
            >
              {/* Selection cell */}
              {showSelection && (
                <SelectionCell
                  checked={isSelected}
                  onChange={(checked) => handleRowSelect(rowId, checked)}
                  disabled={loading !== "idle"}
                  rowId={rowId}
                  testId={testId}
                />
              )}

              {/* Data cells */}
              {row.getVisibleCells().map((cell) => {
                // Use column map for O(1) lookup instead of O(columns) find
                const column = findColumnById(columns, cell.column.id);
                const isSelection = column?.isSelection;

                if (isSelection) return null; // Already rendered above

                return (
                  <Table.Td
                    key={cell.id}
                    data-column-id={cell.column.id}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </Table.Td>
                );
              })}
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    );
  }, [
    error,
    data,
    loading,
    columns,
    columnMap,
    pagination.pageSize,
    skeletonDimensions,
    table,
    selection,
    getRowId,
    zebraStriping,
    handleRetry,
    handleRowSelect,
    testId,
    emptyState,
  ]);

  return (
    <Box
      className={`datatable-container ${className ?? ""}`}
      style={{ position: "relative", minWidth }}
      data-testid={testId}
      data-loading={loading !== "idle"}
      data-error={!!error}
    >
      {/* Skip Link (AC4 Task 4) */}
      <SkipLink targetId={ariaIds.skipLink!} />

      {/* Live Region for Accessibility Announcements */}
      <LiveRegion
        announcement={announcement}
        data-testid={testId ? `${testId}-live-region` : undefined}
      />

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={Object.keys(selection).length}
        actions={batchActions}
        onAction={handleBatchAction}
        onClearSelection={handleClearSelection}
        testId={testId}
        forwardedRef={batchBarRef}
      />

      {/* Loading Overlay (AC3 Task 2) */}
      <LoadingOverlay visible={showLoadingOverlay} testId={testId} />

      {/* Table */}
      <ScrollArea
        type="auto"
        scrollbarSize={8}
        offsetScrollbars
        id={ariaIds.skipLink}
        tabIndex={0}
        style={{ outline: "none" }}
        ref={tableRef}
      >
        <Table
          stickyHeader={stickyHeader}
          highlightOnHover={!zebraStriping}
          withTableBorder
          withColumnBorders
        >
          {renderHeader()}
          {renderBody()}
        </Table>
      </ScrollArea>

      {/* Pagination Controls */}
      <Box py="sm" px="md">
        <PaginationControls
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalCount={totalCount}
          onPaginationChange={onPaginationChange!}
          testId={testId}
        />
      </Box>

      {/* Global Styles */}
      <style>{`
        .datatable-skip-link:focus {
          position: fixed !important;
          left: 8px !important;
          top: 8px !important;
        }
        .datatable-sortable-header {
          cursor: pointer;
          user-select: none;
        }
        .datatable-sortable-header:hover {
          background-color: var(--mantine-color-gray-0);
        }
        .datatable-zebra-row {
          background-color: var(--mantine-color-gray-0);
        }
        .datatable-batch-bar {
          transition: opacity 0.2s ease;
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      `}</style>
    </Box>
  );
}

// Re-export types
export type {
  BatchAction,
  DataTableColumnDef,
  LoadingState,
  OnPaginationChange,
  OnSelectionChange,
  OnSortChange,
  PaginationState,
  RowSelectionState,
  SortDirection,
  SortState,
  TableError,
} from "./types";

export default DataTable;