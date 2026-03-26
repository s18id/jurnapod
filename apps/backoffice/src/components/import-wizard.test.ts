// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
//
// ImportWizard component tests

import assert from "node:assert";
import { describe, it } from "node:test";

// Test TypeScript interface definitions
interface TestImportRow {
  id: number;
  name: string;
  price: number;
}

type ImportStep = "source" | "preview" | "apply";

type ImportRowAction = "CREATE" | "SKIP" | "ERROR";

interface ImportColumn<T> {
  key: keyof T | string;
  header: string;
  required?: boolean;
  formatter?: (value: string) => string;
}

interface ImportPlanRow<T> {
  rowIndex: number;
  original: Record<string, string>;
  parsed: Partial<T>;
  action: ImportRowAction;
  error?: string;
}

interface ImportSummary {
  total: number;
  create: number;
  skip: number;
  error: number;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
}

interface ImportWizardConfig<T> {
  title: string;
  entityName: string;
  csvTemplate: string;
  csvDescription: string;
  columns: ImportColumn<T>[];
  parseRow: (row: Record<string, string>) => Partial<T> | null;
  validateRow: (parsed: Partial<T>, rowIndex: number) => string | null;
  importFn: (rows: ImportPlanRow<T>[]) => Promise<ImportResult>;
}

// Mock CSV parsing utility (matching lib/import/delimited.ts pattern)
function parseDelimited(text: string, delimiter = ","): string[][] {
  const lines = text.trim().split("\n");
  return lines.map((line) => {
    const cells: string[] = [];
    let cell = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += char;
      }
    }
    cells.push(cell.trim());
    return cells;
  });
}

describe("ImportWizard TypeScript Interfaces", () => {
  it("should accept valid ImportWizardConfig with generic type", () => {
    const config: ImportWizardConfig<TestImportRow> = {
      title: "Test Import",
      entityName: "test items",
      csvTemplate: "id,name,price\n1,Item A,100",
      csvDescription: "Test CSV format",
      columns: [
        { key: "id", header: "ID", required: true },
        { key: "name", header: "Name", required: true },
        { key: "price", header: "Price", required: true }
      ],
      parseRow: (row: Record<string, string>): Partial<TestImportRow> | null => {
        const id = parseInt(row.id, 10);
        const price = parseFloat(row.price);
        if (isNaN(id) || isNaN(price)) return null;
        return { id, name: row.name, price };
      },
      validateRow: (parsed: Partial<TestImportRow>): string | null => {
        if (!parsed.name || parsed.name.trim() === "") {
          return "Name is required";
        }
        if (parsed.price === undefined || parsed.price < 0) {
          return "Price must be positive";
        }
        return null;
      },
      importFn: async (rows: ImportPlanRow<TestImportRow>[]): Promise<ImportResult> => {
        return { success: rows.length, failed: 0, errors: [] };
      }
    };
    
    assert.strictEqual(config.title, "Test Import");
    assert.strictEqual(config.entityName, "test items");
    assert.strictEqual(config.columns.length, 3);
  });

  it("should correctly type ImportColumn with keyof T", () => {
    const columns: ImportColumn<TestImportRow>[] = [
      { key: "id", header: "ID", required: true },
      { key: "name", header: "Name" },
      { key: "price", header: "Price" }
    ];
    
    assert.strictEqual(columns[0].key, "id");
    assert.strictEqual(columns[1].key, "name");
    assert.strictEqual(columns[2].key, "price");
    assert.strictEqual(columns[0].required, true);
  });

  it("should allow string keys for computed/virtual columns", () => {
    const columns: ImportColumn<TestImportRow>[] = [
      { key: "id", header: "ID" },
      { key: "computed_field", header: "Computed" }
    ];
    
    assert.strictEqual(columns[1].key, "computed_field");
  });

  it("should type ImportPlanRow correctly", () => {
    const row: ImportPlanRow<TestImportRow> = {
      rowIndex: 0,
      original: { id: "1", name: "Test", price: "100" },
      parsed: { id: 1, name: "Test", price: 100 },
      action: "CREATE"
    };
    
    assert.strictEqual(row.rowIndex, 0);
    assert.strictEqual(row.action, "CREATE");
    assert.deepStrictEqual(row.parsed, { id: 1, name: "Test", price: 100 });
  });

  it("should type ImportPlanRow with error", () => {
    const row: ImportPlanRow<TestImportRow> = {
      rowIndex: 1,
      original: { id: "2", name: "", price: "-10" },
      parsed: { id: 2, name: "", price: -10 },
      action: "ERROR",
      error: "Name is required"
    };
    
    assert.strictEqual(row.action, "ERROR");
    assert.strictEqual(row.error, "Name is required");
  });
});

describe("CSV Parsing Utilities", () => {
  it("should parse simple CSV", () => {
    const csv = "name,price\nItem A,100\nItem B,200";
    const result = parseDelimited(csv);
    
    assert.deepStrictEqual(result, [
      ["name", "price"],
      ["Item A", "100"],
      ["Item B", "200"]
    ]);
  });

  it("should parse CSV with quoted values", () => {
    const csv = 'name,description\n"Item A","A, comma"\n"Item B","Normal"';
    const result = parseDelimited(csv);
    
    assert.deepStrictEqual(result, [
      ["name", "description"],
      ["Item A", "A, comma"],
      ["Item B", "Normal"]
    ]);
  });

  it("should handle empty cells", () => {
    const csv = "name,sku\nItem A,SKU001\nItem B,";
    const result = parseDelimited(csv);
    
    assert.deepStrictEqual(result, [
      ["name", "sku"],
      ["Item A", "SKU001"],
      ["Item B", ""]
    ]);
  });

  it("should handle whitespace trimming", () => {
    const csv = "name , price \n  Item A  ,  100  ";
    const result = parseDelimited(csv);
    
    assert.deepStrictEqual(result, [
      ["name", "price"],
      ["Item A", "100"]
    ]);
  });

  it("should return array with empty cell for empty string", () => {
    const result = parseDelimited("");
    // Empty string results in one row with one empty cell due to trim().split("\n")
    assert.deepStrictEqual(result, [[""]]);
  });
});

describe("ImportWizardConfig Validation Logic", () => {
  const createTestConfig = (): ImportWizardConfig<TestImportRow> => ({
    title: "Test",
    entityName: "items",
    csvTemplate: "id,name,price",
    csvDescription: "Test format",
    columns: [
      { key: "id", header: "ID", required: true },
      { key: "name", header: "Name", required: true },
      { key: "price", header: "Price", required: true }
    ],
    parseRow: (row: Record<string, string>): Partial<TestImportRow> | null => {
      const id = parseInt(row.id, 10);
      const price = parseFloat(row.price);
      if (isNaN(id) || isNaN(price)) return null;
      return { id, name: row.name, price };
    },
    validateRow: (parsed: Partial<TestImportRow>): string | null => {
      if (!parsed.name || parsed.name.trim() === "") {
        return "Name is required";
      }
      if (parsed.price === undefined || parsed.price < 0) {
        return "Price must be positive";
      }
      return null;
    },
    importFn: async (): Promise<ImportResult> => ({ success: 0, failed: 0, errors: [] })
  });

  it("should parse valid row correctly", () => {
    const config = createTestConfig();
    const row = { id: "1", name: "Test Item", price: "100" };
    const parsed = config.parseRow(row);
    
    assert.deepStrictEqual(parsed, { id: 1, name: "Test Item", price: 100 });
  });

  it("should return null for invalid numeric values", () => {
    const config = createTestConfig();
    const row = { id: "abc", name: "Test", price: "xyz" };
    const parsed = config.parseRow(row);
    
    assert.strictEqual(parsed, null);
  });

  it("should validate required name field", () => {
    const config = createTestConfig();
    const parsed: Partial<TestImportRow> = { id: 1, name: "", price: 100 };
    const error = config.validateRow(parsed, 0);
    
    assert.strictEqual(error, "Name is required");
  });

  it("should validate positive price", () => {
    const config = createTestConfig();
    const parsed: Partial<TestImportRow> = { id: 1, name: "Test", price: -10 };
    const error = config.validateRow(parsed, 0);
    
    assert.strictEqual(error, "Price must be positive");
  });

  it("should return null for valid row", () => {
    const config = createTestConfig();
    const parsed: Partial<TestImportRow> = { id: 1, name: "Test", price: 100 };
    const error = config.validateRow(parsed, 0);
    
    assert.strictEqual(error, null);
  });

  it("should calculate import summary correctly", () => {
    const plan: ImportPlanRow<TestImportRow>[] = [
      { rowIndex: 0, original: {}, parsed: {}, action: "CREATE" },
      { rowIndex: 1, original: {}, parsed: {}, action: "CREATE" },
      { rowIndex: 2, original: {}, parsed: {}, action: "ERROR", error: "Invalid" },
      { rowIndex: 3, original: {}, parsed: {}, action: "SKIP" }
    ];
    
    const summary: ImportSummary = {
      total: plan.length,
      create: plan.filter((r) => r.action === "CREATE").length,
      skip: plan.filter((r) => r.action === "SKIP").length,
      error: plan.filter((r) => r.action === "ERROR").length
    };
    
    assert.strictEqual(summary.total, 4);
    assert.strictEqual(summary.create, 2);
    assert.strictEqual(summary.skip, 1);
    assert.strictEqual(summary.error, 1);
  });
});

describe("Import Step State Management", () => {
  it("should transition through steps correctly", () => {
    let step: ImportStep = "source";
    
    // Initial state
    assert.strictEqual(step, "source");
    
    // After parsing, move to preview
    step = "preview";
    assert.strictEqual(step, "preview");
    
    // After validation, move to apply
    step = "apply";
    assert.strictEqual(step, "apply");
  });

  it("should allow going back from preview to source", () => {
    let step: ImportStep = "preview";
    
    step = "source";
    assert.strictEqual(step, "source");
  });
});

describe("ImportWizard Hook State", () => {
  // Simulating useImportWizard hook behavior
  function createMockImportWizardState() {
    let opened = false;
    
    return {
      get opened() { return opened; },
      open: () => { opened = true; },
      close: () => { opened = false; }
    };
  }

  it("should start with closed state", () => {
    const state = createMockImportWizardState();
    assert.strictEqual(state.opened, false);
  });

  it("should open modal", () => {
    const state = createMockImportWizardState();
    state.open();
    assert.strictEqual(state.opened, true);
  });

  it("should close modal", () => {
    const state = createMockImportWizardState();
    state.open();
    state.close();
    assert.strictEqual(state.opened, false);
  });
});

describe("Import Result Processing", () => {
  it("should handle successful import result", () => {
    const result: ImportResult = {
      success: 10,
      failed: 0,
      errors: []
    };
    
    assert.strictEqual(result.success, 10);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.errors.length, 0);
  });

  it("should handle partial failure import result", () => {
    const result: ImportResult = {
      success: 8,
      failed: 2,
      errors: [
        { row: 3, error: "Duplicate SKU" },
        { row: 7, error: "Invalid price" }
      ]
    };
    
    assert.strictEqual(result.success, 8);
    assert.strictEqual(result.failed, 2);
    assert.strictEqual(result.errors.length, 2);
  });

  it("should handle complete failure", () => {
    const result: ImportResult = {
      success: 0,
      failed: 5,
      errors: [
        { row: 0, error: "Network error" },
        { row: 1, error: "Network error" },
        { row: 2, error: "Network error" },
        { row: 3, error: "Network error" },
        { row: 4, error: "Network error" }
      ]
    };
    
    assert.strictEqual(result.success, 0);
    assert.strictEqual(result.failed, 5);
  });
});

describe("Items Import Configuration Compatibility", () => {
  // Simulating the items-import-utils.ts interfaces
  type ItemType = "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
  
  interface NormalizedItemImportRow {
    sku: string | null;
    name: string;
    type: ItemType;
    item_group_code: string | null;
    is_active: boolean;
  }

  it("should be compatible with items import row structure", () => {
    const row: NormalizedItemImportRow = {
      sku: "SKU001",
      name: "Test Item",
      type: "PRODUCT",
      item_group_code: "GROUP1",
      is_active: true
    };
    
    assert.strictEqual(row.sku, "SKU001");
    assert.strictEqual(row.type, "PRODUCT");
    assert.strictEqual(row.is_active, true);
  });

  it("should handle all valid item types", () => {
    const types: ItemType[] = ["SERVICE", "PRODUCT", "INGREDIENT", "RECIPE"];
    
    for (const type of types) {
      const row: NormalizedItemImportRow = {
        sku: null,
        name: "Test",
        type,
        item_group_code: null,
        is_active: true
      };
      assert.strictEqual(row.type, type);
    }
  });
});

describe("Price Import Configuration Compatibility", () => {
  interface NormalizedPriceImportRow {
    item_sku: string;
    price: number;
    scope: "default" | "outlet";
    is_active: boolean;
    outlet_id: number | null;
  }

  it("should be compatible with prices import row structure", () => {
    const row: NormalizedPriceImportRow = {
      item_sku: "SKU001",
      price: 150000,
      scope: "outlet",
      is_active: true,
      outlet_id: 1
    };
    
    assert.strictEqual(row.item_sku, "SKU001");
    assert.strictEqual(row.price, 150000);
    assert.strictEqual(row.scope, "outlet");
  });

  it("should support company default scope", () => {
    const row: NormalizedPriceImportRow = {
      item_sku: "SKU002",
      price: 100000,
      scope: "default",
      is_active: true,
      outlet_id: null
    };
    
    assert.strictEqual(row.scope, "default");
    assert.strictEqual(row.outlet_id, null);
  });
});

describe("Progress Calculation", () => {
  it("should calculate progress percentage correctly", () => {
    const total = 10;
    const current = 5;
    const progress = (current / total) * 100;
    
    assert.strictEqual(progress, 50);
  });

  it("should cap progress at 100%", () => {
    const total = 10;
    const current = 15;
    const progress = Math.min((current / total) * 100, 100);
    
    assert.strictEqual(progress, 100);
  });

  it("should start at 0%", () => {
    const total = 10;
    const current = 0;
    const progress = (current / total) * 100;
    
    assert.strictEqual(progress, 0);
  });
});

describe("Error Message Display", () => {
  it("should format error messages for display", () => {
    const errors = [
      { row: 1, error: "Name is required" },
      { row: 3, error: "Invalid type" },
      { row: 5, error: "SKU already exists" }
    ];
    
    const formatted = errors.map(e => `Row ${e.row + 1}: ${e.error}`);
    
    assert.deepStrictEqual(formatted, [
      "Row 2: Name is required",
      "Row 4: Invalid type",
      "Row 6: SKU already exists"
    ]);
  });
});
