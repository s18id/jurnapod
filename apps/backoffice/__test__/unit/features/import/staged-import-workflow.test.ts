import { describe, expect, it } from "vitest";

import { PERMISSION_BITS } from "../../../../src/lib/auth/permissions";
import type { SessionUser } from "../../../../src/lib/session";
import { getImportProgressDisplay } from "../../../../src/components/import-progress";
import { canAccessStagedImport, getImportDeniedMessage } from "../../../../src/features/import/import-permission-gates";
import { getImportSessionStorageKeys, normalizeRecoveredImportStep } from "../../../../src/hooks/use-import";
import { generateApplyErrorCsv, generateValidationErrorCsv } from "../../../../src/features/import/error-csv-generator";
import { hasRequiredMappings } from "../../../../src/features/import/map-step";
import { validateImportFile } from "../../../../src/features/import/upload-step";

function sessionUserWithMask(mask: number): SessionUser {
  return {
    id: 1,
    company_id: 1,
    email: "user@example.test",
    roles: [],
    global_roles: [],
    outlet_role_assignments: [],
    outlets: [],
    permissions: [{ module: "inventory", resource: "items", mask }],
  };
}

describe("staged import workflow helpers", () => {
  it("uses entity-scoped sessionStorage keys for uploadId, fileHash, and step", () => {
    expect(getImportSessionStorageKeys("items")).toMatchObject({
      uploadId: "jurnapod.import.items.uploadId",
      fileHash: "jurnapod.import.items.fileHash",
      step: "jurnapod.import.items.step",
    });
    expect(getImportSessionStorageKeys("prices").uploadId).toBe("jurnapod.import.prices.uploadId");
  });

  it("normalizes recovered validation/apply/results steps to mapping without result state", () => {
    const base = {
      hasUploadId: true,
      hasMappingState: true,
      hasValidationResult: false,
      hasApplyResult: false,
    };

    expect(normalizeRecoveredImportStep({ ...base, storedStep: "validation" })).toBe("mapping");
    expect(normalizeRecoveredImportStep({ ...base, storedStep: "apply" })).toBe("mapping");
    expect(normalizeRecoveredImportStep({ ...base, storedStep: "results" })).toBe("mapping");
    expect(normalizeRecoveredImportStep({ ...base, storedStep: "mapping" })).toBe("mapping");
    expect(normalizeRecoveredImportStep({ ...base, storedStep: "upload", hasMappingState: false })).toBe("upload");
  });

  it("gates direct staged import pages by required action", () => {
    const createOnlyUser = sessionUserWithMask(PERMISSION_BITS.CREATE);
    const updateOnlyUser = sessionUserWithMask(PERMISSION_BITS.UPDATE);
    const readOnlyUser = sessionUserWithMask(PERMISSION_BITS.READ);

    expect(canAccessStagedImport(createOnlyUser, "items")).toBe(true);
    expect(canAccessStagedImport(updateOnlyUser, "items")).toBe(false);
    expect(canAccessStagedImport(updateOnlyUser, "prices")).toBe(true);
    expect(canAccessStagedImport(readOnlyUser, "prices")).toBe(false);
    expect(getImportDeniedMessage("items")).toContain("inventory.items.CREATE");
    expect(getImportDeniedMessage("prices")).toContain("inventory.items.UPDATE");
  });

  it("rejects non-CSV/XLSX file names", () => {
    expect(validateImportFile({ name: "items.csv" } as File)).toBeNull();
    expect(validateImportFile({ name: "prices.XLSX" } as File)).toBeNull();
    expect(validateImportFile({ name: "items.pdf" } as File)).toBe("File must be a CSV or XLSX file.");
  });

  it("blocks validation until all required mappings exist", () => {
    const fields = [
      { value: "sku", required: true },
      { value: "name", required: true },
      { value: "barcode", required: false },
    ];

    expect(hasRequiredMappings([{ targetField: "sku" }], fields)).toBe(false);
    expect(hasRequiredMappings([{ targetField: "sku" }, { targetField: "name" }], fields)).toBe(true);
  });

  it("generates validation error CSV with escaped values", () => {
    const csv = generateValidationErrorCsv({
      errors: [
        { row: 2, column: "name", value: "A, B", message: "Missing \"name\"" },
      ],
    });

    expect(csv).toBe('row,column,value,error\n2,name,"A, B","Missing ""name"""');
  });

  it("generates apply error CSV with original field values", () => {
    const csv = generateApplyErrorCsv({
      errors: [
        { row: 4, error: "Duplicate SKU", values: { sku: "SKU-1", name: "Cup" } },
      ],
    });

    expect(csv).toBe('row,error,field_values\n4,Duplicate SKU,"{""sku"":""SKU-1"",""name"":""Cup""}"');
  });

  it("displays byte progress as request percentage without row counts", () => {
    expect(getImportProgressDisplay({ current: 0, total: 100, currentRow: 0, percentage: 44, mode: "bytes" })).toEqual({
      label: "Request progress",
      detail: "44% complete",
    });
    expect(getImportProgressDisplay({ current: 8, total: 10, currentRow: 8, percentage: 80, mode: "rows" })).toEqual({
      label: "Rows processed",
      detail: "8 of 10 rows",
    });
  });
});
