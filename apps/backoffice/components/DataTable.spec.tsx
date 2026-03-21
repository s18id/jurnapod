// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { test, expect } from "@playwright/experimental-ct-react";
import { AxeBuilder } from "@axe-core/playwright";
import type { AxeResults } from "axe-core";
import { DataTable } from "../src/components/ui/DataTable";
import type { SortState, TableError, LoadingState } from "../src/components/ui/DataTable/types";

// Mock data type
interface MockItem {
  id: string;
  name: string;
  price: number;
  category: string;
}

// Mock data
const mockData: MockItem[] = [
  { id: "1", name: "Americano", price: 18000, category: "Coffee" },
  { id: "2", name: "Cappuccino", price: 22000, category: "Coffee" },
  { id: "3", name: "Latte", price: 24000, category: "Coffee" },
  { id: "4", name: "Espresso", price: 15000, category: "Coffee" },
  { id: "5", name: "Green Tea", price: 12000, category: "Tea" },
  { id: "6", name: "Black Tea", price: 10000, category: "Tea" },
  { id: "7", name: "Sandwich", price: 35000, category: "Food" },
  { id: "8", name: "Salad", price: 28000, category: "Food" },
  { id: "9", name: "Cake", price: 25000, category: "Dessert" },
  { id: "10", name: "Cookie", price: 8000, category: "Dessert" },
];

// Column definitions
const mockColumns = [
  {
    id: "name",
    header: "Item Name",
    accessorKey: "name",
    enableSorting: true,
  },
  {
    id: "category",
    header: "Category",
    accessorKey: "category",
    enableSorting: true,
  },
  {
    id: "price",
    header: "Price (IDR)",
    accessorKey: "price",
    enableSorting: true,
    cell: (info: any) => `Rp ${info.getValue().toLocaleString("id-ID")}`,
  },
];

test("DataTable renders with data", async ({ mount }) => {
  const component = await mount(
    <DataTable
      data-testid="test-data-table"
      columns={mockColumns}
      data={mockData}
      getRowId={(row) => row.id}
      totalCount={mockData.length}
      pagination={{ page: 1, pageSize: 10 }}
    />
  );

  // Should render table
  await expect(component.locator('[data-testid="test-data-table"]')).toBeVisible();
  
  // Should render correct number of rows (including header)
  const rows = component.locator("tr");
  await expect(rows).toHaveCount(mockData.length + 1); // +1 for header row

  // Should render column headers
  await expect(component.getByText("Item Name")).toBeVisible();
  await expect(component.getByText("Category")).toBeVisible();
  await expect(component.getByText("Price (IDR)")).toBeVisible();

  // Should render some data
  await expect(component.getByText("Americano")).toBeVisible();
  await expect(component.getByText("Coffee")).toBeVisible();
  await expect(component.getByText("Rp 18,000")).toBeVisible();
});

test("DataTable sorting works", async ({ mount }) => {
  const sortState: SortState = { id: "name", direction: "asc" };
  let sortChanged = false;
  
  const component = await mount(
    <DataTable
      data-testid="test-data-table"
      columns={mockColumns}
      data={mockData}
      getRowId={(row) => row.id}
      sort={sortState}
      onSortChange={() => { sortChanged = true; }}
    />
  );

  // Sort indicator should be visible
  const sortButton = component.locator('[data-testid="test-data-table-sort-button"]').first();
  await expect(sortButton).toBeVisible();
});

test("DataTable pagination works", async ({ mount }) => {
  const component = await mount(
    <DataTable
      data-testid="test-data-table"
      columns={mockColumns}
      data={mockData.slice(0, 5)} // Only 5 items
      getRowId={(row) => row.id}
      totalCount={mockData.length} // Total is 10
      pagination={{ page: 1, pageSize: 5 }}
      onPaginationChange={() => {}}
    />
  );

  // Pagination should be visible
  const pagination = component.locator('[data-testid="test-data-table-pagination"]');
  await expect(pagination).toBeVisible();

  // Should show page size select
  const pageSizeSelect = component.locator('[data-testid="test-data-table-page-size-select"]');
  await expect(pageSizeSelect).toBeVisible();

  // Should show range text
  const rangeText = component.locator('[data-testid="test-data-table-range-text"]');
  await expect(rangeText).toBeVisible();
  await expect(rangeText).toContainText("1–5 of 10");
});

test("DataTable selection works", async ({ mount }) => {
  const component = await mount(
    <DataTable
      data-testid="test-data-table"
      columns={mockColumns}
      data={mockData.slice(0, 3)}
      getRowId={(row) => row.id}
      selection={{ "1": true, "2": false, "3": false }}
      onSelectionChange={() => {}}
    />
  );

  // Selection checkboxes should be visible
  const selectAllCheckbox = component.locator('[data-testid="test-data-table-select-all-checkbox"]');
  await expect(selectAllCheckbox).toBeVisible();

  const rowCheckboxes = component.locator('[data-testid^="test-data-table-select-"]');
  await expect(rowCheckboxes).toHaveCount(3);
});

test("DataTable empty state", async ({ mount }) => {
  const component = await mount(
    <DataTable
      data-testid="test-data-table"
      columns={mockColumns}
      data={[]}
      getRowId={(row: MockItem) => row.id}
      emptyState={<div>No items found</div>}
    />
  );

  // Empty state should be visible
  const emptyState = component.locator('[data-testid="test-data-table-empty-state"]');
  await expect(emptyState).toBeVisible();
  await expect(emptyState).toContainText("No items found");
});

test("DataTable error state", async ({ mount }) => {
  const error: TableError = {
    message: "Failed to load data",
    onRetry: () => {},
  };
  
  const component = await mount(
    <DataTable
      data-testid="test-data-table"
      columns={mockColumns}
      data={[]}
      getRowId={(row: MockItem) => row.id}
      error={error}
    />
  );

  // Error state should be visible
  const errorState = component.locator('[data-testid="test-data-table-error-state"]');
  await expect(errorState).toBeVisible();
  await expect(errorState).toContainText("Failed to load data");

  // Retry button should be visible
  const retryButton = component.locator('[data-testid="test-data-table-retry-button"]');
  await expect(retryButton).toBeVisible();
});

test("DataTable loading state", async ({ mount }) => {
  const component = await mount(
    <DataTable
      data-testid="test-data-table"
      columns={mockColumns}
      data={[]}
      getRowId={(row: MockItem) => row.id}
      loading="loading"
    />
  );

  // Skeleton should be visible
  const skeleton = component.locator('[data-testid="test-data-table-skeleton"]');
  await expect(skeleton).toBeVisible();
});

test("DataTable accessibility", async ({ mount, page }) => {
  await mount(
    <DataTable
      data-testid="test-data-table"
      columns={mockColumns}
      data={mockData.slice(0, 3)}
      getRowId={(row) => row.id}
      pagination={{ page: 1, pageSize: 10 }}
    />
  );

  // Run axe-core accessibility scan
  const results: AxeResults = await new AxeBuilder({ page }).analyze();
  
  // Check for critical accessibility violations
  expect(results.violations.length).toBe(0);
  
  // Log violations if any
  if (results.violations.length > 0) {
    console.error("Accessibility violations found:", JSON.stringify(results.violations, null, 2));
  }
});