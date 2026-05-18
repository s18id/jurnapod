import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { OperationsFilterBar } from "@/features/operations/operations-filter-bar";
import { OPERATION_LIST_STATUSES, OPERATION_LIST_TYPES } from "@/hooks/use-operations-list";

function renderFilterBar(): string {
  return renderToStaticMarkup(
    createElement(
      MantineProvider,
      {},
      createElement(OperationsFilterBar, {
        filters: { status: "failed", type: "import" },
        onChange: vi.fn(),
      }),
    ),
  );
}

describe("OperationsFilterBar", () => {
  it("uses only backend-supported statuses", () => {
    expect(OPERATION_LIST_STATUSES).toEqual(["running", "completed", "failed", "cancelled"]);
    expect(OPERATION_LIST_STATUSES).not.toContain("queued");
    expect(OPERATION_LIST_STATUSES).not.toContain("partially_failed");
  });

  it("uses only backend-supported operation types", () => {
    expect(OPERATION_LIST_TYPES).toEqual(["import", "export", "batch_update"]);
    expect(OPERATION_LIST_TYPES).not.toContain("sync");
    expect(OPERATION_LIST_TYPES).not.toContain("bulk-update");
  });

  it("renders status and type controls without date range or creator filters", () => {
    const html = renderFilterBar();

    expect(html).toContain("Status");
    expect(html).toContain("Type");
    expect(html).toContain("Clear filters");
    expect(html).not.toContain("Date range");
    expect(html).not.toContain("Creator");
  });
});
