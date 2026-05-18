import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  buildOperationsHash,
  canShowOperationsEmptyExportLink,
  canShowOperationsEmptyImportLink,
  makeOperationsListParams,
  openOperationFromRow,
  OperationsCenter,
  pageToOffset,
  parseOperationsFiltersFromHash,
} from "@/features/operations/operations-center";
import {
  buildOperationsSearchParams,
  getOperationsListRefetchInterval,
  OPERATIONS_DEFAULT_LIMIT,
  operationsListQueryKeys,
  type OperationListItem,
  type OperationsListResult,
} from "@/hooks/use-operations-list";
import { AsyncJobDrawerProvider } from "@/hooks/use-async-job-drawer";
import { canReadOperations } from "@/lib/operations-permissions";
import type { SessionUser } from "@/lib/session";
import { formatOperationsBadgeLabel, getOperationsBadgeHref } from "@/app/layout";

function makeUser(permissions: SessionUser["permissions"]): SessionUser {
  return {
    id: 1,
    company_id: 10,
    email: "operator@example.com",
    roles: ["OWNER"],
    global_roles: [],
    outlet_role_assignments: [],
    outlets: [],
    permissions,
  };
}

const operation: OperationListItem = {
  operationId: "op-68-2",
  type: "import",
  total: 100,
  completed: 25,
  percentage: 25,
  status: "running",
  etaSeconds: 60,
  startedAt: "2026-05-19T00:00:00.000Z",
  updatedAt: "2026-05-19T00:01:00.000Z",
  completedAt: null,
};

function renderCenter(user: SessionUser, data?: OperationsListResult): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (data) {
    queryClient.setQueryData(
      operationsListQueryKeys.list({ limit: OPERATIONS_DEFAULT_LIMIT, offset: 0 }),
      data,
    );
  }

  return renderToStaticMarkup(
    createElement(
      MantineProvider,
      {},
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          AsyncJobDrawerProvider,
          {},
          createElement(OperationsCenter, { user }),
        ),
      ),
    ),
  );
}

describe("OperationsCenter", () => {
  const allowedUser = makeUser([
    { module: "platform", resource: "operations", mask: 1 },
    { module: "inventory", resource: "items", mask: 63 },
  ]);
  const deniedUser = makeUser([{ module: "inventory", resource: "items", mask: 63 }]);

  it("renders operation list fields from the backend contract", () => {
    const html = renderCenter(allowedUser, {
      operations: [operation],
      total: 1,
      limit: OPERATIONS_DEFAULT_LIMIT,
      offset: 0,
    });

    expect(html).toContain("Operations Center");
    expect(html).toContain("op-68-2");
    expect(html).toContain("import");
    expect(html).toContain("running");
    expect(html).toContain("25/100");
    expect(html).toContain("2026-05-19T00:00:00.000Z");
  });

  it("does not expose unsupported generic retry or cancel buttons", () => {
    const html = renderCenter(allowedUser, {
      operations: [{ ...operation, status: "failed" }],
      total: 1,
      limit: OPERATIONS_DEFAULT_LIMIT,
      offset: 0,
    });

    expect(html).not.toContain(">Retry<");
    expect(html).not.toContain(">Cancel<");
  });

  it("denies the operations surface without explicit platform.operations.READ", () => {
    expect(canReadOperations({ ...makeUser(undefined), roles: ["OWNER"] })).toBe(false);
    const html = renderCenter(deniedUser);
    expect(html).toContain("Access denied");
  });

  it("renders empty state and import/export links only for relevant permissions", () => {
    const html = renderCenter(allowedUser, {
      operations: [],
      total: 0,
      limit: OPERATIONS_DEFAULT_LIMIT,
      offset: 0,
    });

    expect(html).toContain("No operations yet");
    expect(html).toContain("#/items/import");
    expect(canShowOperationsEmptyImportLink(allowedUser)).toBe(true);
    expect(canShowOperationsEmptyExportLink(allowedUser)).toBe(true);
  });

  it("maps pagination to limit and offset instead of page API params", () => {
    const params = makeOperationsListParams({}, { page: 3, pageSize: 20 });
    const search = buildOperationsSearchParams(params).toString();

    expect(pageToOffset(3, 20)).toBe(40);
    expect(params).toEqual({ limit: 20, offset: 40, status: undefined, type: undefined });
    expect(search).toContain("limit=20");
    expect(search).toContain("offset=40");
    expect(search).not.toContain("page=");
  });

  it("parses and builds failed-status deep links for the shell jobs badge", () => {
    expect(parseOperationsFiltersFromHash("#/operations?status=failed")).toEqual({ status: "failed" });
    expect(buildOperationsHash({ status: "failed" })).toBe("#/operations?status=failed");
    expect(getOperationsBadgeHref(2)).toBe("#/operations?status=failed");
    expect(getOperationsBadgeHref(0)).toBe("#/operations");
    expect(formatOperationsBadgeLabel(2)).toBe("2 operations");
  });

  it("opens the AsyncJobDrawer for a selected operation row", () => {
    const open = vi.fn();
    openOperationFromRow({ open }, operation);

    expect(open).toHaveBeenCalledWith({ operationId: "op-68-2", operationType: "import" });
  });

  it("auto-refreshes only when running operations exist", () => {
    expect(getOperationsListRefetchInterval({ operations: [operation], total: 1, limit: 20, offset: 0 })).toBe(10_000);
    expect(getOperationsListRefetchInterval({ operations: [{ ...operation, status: "completed" }], total: 1, limit: 20, offset: 0 })).toBe(false);
    expect(getOperationsListRefetchInterval(
      { operations: [{ ...operation, status: "failed" }], total: 1, limit: 20, offset: 0 },
      { refetchInterval: 10_000 },
    )).toBe(10_000);
  });
});
