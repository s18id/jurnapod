// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Main component
export { DataTable, type DataTableProps } from "./DataTable";

// Types
export type {
  BatchAction,
  ColumnFlags,
  DataTableColumnDef,
  LoadingState,
  OnPaginationChange,
  OnSelectionChange,
  OnSortChange,
  PaginationState,
  RowSelectionState,
  SortDirection,
  SortState,
  TableAriaIds,
  TableError,
} from "./types";

// Utility functions
export {
  calculateSafePage,
  calculateTotalPages,
  generateTableAriaIds,
  getAriaSortValue,
  getNextSequence,
  getPageResetRule,
  getPaginationRangeText,
  getSelectedRowIds,
  isAllSelected,
  isSomeSelected,
  PAGE_SIZE_OPTIONS,
  TableStateManager,
} from "./types";