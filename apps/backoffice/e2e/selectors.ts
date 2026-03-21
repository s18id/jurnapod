// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export const E2E_SELECTORS = {
  // DataTable component selectors
  dataTable: {
    container: "[data-testid='data-table']",
    header: "[data-testid='data-table-header']",
    row: "[data-testid='data-table-row']",
    cell: "[data-testid='data-table-cell']",
    sortButton: "[data-testid='data-table-sort-button']",
    pagination: "[data-testid='data-table-pagination']",
    pageSizeSelect: "[data-testid='data-table-page-size-select']",
    pageButton: "[data-testid='data-table-page-button']",
    selectionCheckbox: "[data-testid='data-table-selection-checkbox']",
    selectAllCheckbox: "[data-testid='data-table-select-all-checkbox']",
    batchActionBar: "[data-testid='data-table-batch-action-bar']",
    skeleton: "[data-testid='data-table-skeleton']",
    emptyState: "[data-testid='data-table-empty-state']",
    errorState: "[data-testid='data-table-error-state']",
    retryButton: "[data-testid='data-table-retry-button']",
    // Accessibility
    liveRegion: "[data-testid='data-table-live-region']",
    skipLink: "[data-testid='data-table-skip-link']"
  },
  // PageHeader component selectors
  pageHeader: {
    container: "[data-testid='page-header']",
    title: "[data-testid='page-header-title']",
    description: "[data-testid='page-header-description']",
    actionButton: "[data-testid='page-header-action-button']"
  },
  // FilterBar component selectors
  filterBar: {
    container: "[data-testid='filter-bar']",
    searchInput: "[data-testid='filter-bar-search-input']",
    filterButton: "[data-testid='filter-bar-filter-button']",
    clearButton: "[data-testid='filter-bar-clear-button']"
  }
};