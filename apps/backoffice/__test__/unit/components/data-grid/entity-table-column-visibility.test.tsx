import { MantineProvider } from "@mantine/core";
import type { DataTableColumnDef } from "@/components/ui/DataTable";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  EntityTable,
  toggleEntityTableColumnVisibility,
  writeEntityTableColumnVisibility,
} from "@/components/data-grid";
import type { EntityTableColumnVisibilityConfig } from "@/components/data-grid";

interface Row {
  id: string;
  sku: string;
  name: string;
  group: string;
  updated_at: string;
}

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

const columns: DataTableColumnDef<Row>[] = [
  { id: "sku", accessorKey: "sku", header: "SKU", sortable: true, cell: (info) => info.getValue<string>() },
  { id: "name", accessorKey: "name", header: "Name", sortable: true, cell: (info) => info.getValue<string>() },
  { id: "group", accessorKey: "group", header: "Group", cell: (info) => info.getValue<string>() },
  { id: "updated_at", accessorKey: "updated_at", header: "Updated At", cell: (info) => info.getValue<string>() },
];

const data: Row[] = [
  { id: "1", sku: "SKU-001", name: "Latte", group: "Beverage", updated_at: "2026-05-18T00:00:00Z" },
];

const config: EntityTableColumnVisibilityConfig = {
  storageKey: "jurnapod.catalog.items.columns.v1",
  version: 1,
  defaultVisibleColumnIds: ["sku", "name", "updated_at"],
  essentialColumnIds: ["sku", "name"],
  columnLabels: {
    sku: "SKU",
    name: "Name",
    group: "Group",
    updated_at: "Updated At",
  },
  hideChooserOnMobile: true,
};

function installStorage(storage: MemoryStorage): void {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

function restoreStorage(): void {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
}

function renderTable(isMobileViewport = false): string {
  return renderToStaticMarkup(
    createElement(
      MantineProvider,
      {},
      createElement(EntityTable<Row>, {
        entityName: "Items",
        columns,
        data,
        getRowId: (row) => row.id,
        columnVisibility: { ...config },
        isMobileViewport,
        pagination: { page: 1, pageSize: 10 },
        totalCount: data.length,
        "data-testid": "catalog-entity-table",
      })
    )
  );
}

afterEach(() => {
  restoreStorage();
});

describe("EntityTable column visibility component behavior", () => {
  it("renders default visible columns and hides non-default columns", () => {
    installStorage(new MemoryStorage());

    const html = renderTable();

    expect(html).toContain("SKU");
    expect(html).toContain("Name");
    expect(html).toContain("Updated At");
    expect(html).not.toContain("Beverage");
  });

  it("renders a hidden column when the column chooser selection makes it visible", () => {
    const storage = new MemoryStorage();
    installStorage(storage);
    const visibleColumnIds = toggleEntityTableColumnVisibility(config.defaultVisibleColumnIds ?? [], "group", true);
    writeEntityTableColumnVisibility(storage, config.storageKey, config.version, visibleColumnIds);

    const html = renderTable();

    expect(html).toContain("Group");
    expect(html).toContain("Beverage");
  });

  it("persists chooser visibility via versioned storage config", () => {
    const storage = new MemoryStorage();
    installStorage(storage);
    const visibleColumnIds = toggleEntityTableColumnVisibility(config.defaultVisibleColumnIds ?? [], "group", true);

    writeEntityTableColumnVisibility(storage, config.storageKey, config.version, visibleColumnIds);

    expect(storage.getItem(config.storageKey)).toBe(JSON.stringify({ version: 1, visibleColumnIds }));
    expect(renderTable()).toContain("Beverage");
  });

  it("hides chooser and renders only essential columns in mobile mode", () => {
    installStorage(new MemoryStorage());

    const html = renderTable(true);

    expect(html).not.toContain("entity-table-column-chooser");
    expect(html).toContain("SKU");
    expect(html).toContain("Name");
    expect(html).not.toContain("Updated At");
    expect(html).not.toContain("Beverage");
  });
});
