import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ apiRequest: vi.fn() }));

import { APP_ROUTES } from "@/app/routes";
import { filterNavigation } from "@/app/shell/use-nav-filtering";
import { apiRequest } from "@/lib/api-client";
import type { SessionUser } from "@/lib/session";
import {
  PurchasingApExceptionsPage,
  assignApException,
  buildApExceptionWorklistSearchParams,
  fetchApExceptionWorklist,
  parseApExceptionHighlightId,
  resolveApException,
  userCanReadApExceptions,
  userCanMutateApExceptions,
  type ApException,
  type ApExceptionWorklistResult,
} from "@/features/purchasing/ap-exceptions";
import { AP_EXCEPTIONS_DEFAULT_LIMIT, apExceptionQueryKeys } from "@/features/purchasing/ap-exceptions/api";
import { formatApExceptionApiError } from "@/features/purchasing/ap-exceptions/actions";

const mockedApiRequest = vi.mocked(apiRequest);

const baseException: ApException = {
  id: 6905,
  company_id: 42,
  exception_key: "AP-EXC-6905",
  type: "VARIANCE",
  source_type: "INVOICE",
  source_id: 9001,
  supplier_id: 101,
  variance_amount: "250.0000",
  currency_code: "IDR",
  detected_at: "2026-05-21T00:00:00.000Z",
  due_date: "2026-05-30",
  assigned_to_user_id: null,
  assigned_at: null,
  status: "OPEN",
  resolved_at: null,
  resolved_by_user_id: null,
  resolution_note: null,
  created_at: "2026-05-21T00:00:00.000Z",
  updated_at: "2026-05-21T00:00:00.000Z",
};

function makeUser(permissions: SessionUser["permissions"]): SessionUser {
  return {
    id: 7,
    company_id: 42,
    email: "ap-exceptions@example.com",
    roles: ["ACCOUNTANT"],
    global_roles: [],
    outlet_role_assignments: [],
    outlets: [],
    permissions,
  };
}

function renderWithProviders(element: ReactElement, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })): string {
  return renderToStaticMarkup(createElement(MantineProvider, {}, createElement(QueryClientProvider, { client: queryClient }, element)));
}

function seedWorklist(queryClient: QueryClient, result: ApExceptionWorklistResult) {
  queryClient.setQueryData(
    apExceptionQueryKeys.list({ type: "", status: "", supplier_id: "", search: "", cursor: null, limit: AP_EXCEPTIONS_DEFAULT_LIMIT }),
    result,
  );
}

describe("Purchasing AP exceptions backoffice", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
  });

  it("builds only supported worklist filters and maps the current envelope", async () => {
    const params = buildApExceptionWorklistSearchParams({
      type: "VARIANCE",
      status: "ASSIGNED",
      supplier_id: " 101 ",
      search: " AP-EXC ",
      cursor: "next-cursor",
      limit: 20,
    });

    expect([...params.keys()].sort()).toEqual(["cursor", "limit", "search", "status", "supplier_id", "type"]);
    expect(params.get("supplier_id")).toBe("101");
    expect(params.get("search")).toBe("AP-EXC");
    expect(params.has("date_from")).toBe(false);
    expect(params.has("assigned_user_id")).toBe(false);

    const result: ApExceptionWorklistResult = { exceptions: [baseException], total: 1, next_cursor: null, has_more: false };
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: result });
    await expect(fetchApExceptionWorklist({ type: "VARIANCE", status: "ASSIGNED", supplier_id: "101", search: "AP-EXC", cursor: null, limit: 20 })).resolves.toEqual(result);
    expect(mockedApiRequest.mock.calls[0]?.[0]).toContain("/accounting/ap-exceptions/worklist?");
    expect(mockedApiRequest.mock.calls[0]?.[0]).not.toContain("/api/");
  });

  it("calls current PUT assign and resolve/dismiss endpoints without unsupported fields", async () => {
    const assigned = { ...baseException, status: "ASSIGNED" as const, assigned_to_user_id: 7, assigned_at: "2026-05-21T01:00:00.000Z" };
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: assigned });

    await expect(assignApException({ exceptionId: baseException.id, assignedToUserId: 7 })).resolves.toEqual(assigned);
    expect(mockedApiRequest).toHaveBeenCalledWith("/accounting/ap-exceptions/6905/assign", {
      method: "PUT",
      body: JSON.stringify({ assigned_to_user_id: 7 }),
    });

    const resolved = { ...assigned, status: "RESOLVED" as const, resolved_at: "2026-05-21T02:00:00.000Z", resolved_by_user_id: 7, resolution_note: "Matched to supplier statement." };
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: resolved });
    await expect(resolveApException({ exceptionId: baseException.id, status: "RESOLVED", resolutionNote: " Matched to supplier statement. " })).resolves.toEqual(resolved);
    expect(mockedApiRequest.mock.calls[1]?.[0]).toBe("/accounting/ap-exceptions/6905/resolve");
    expect(mockedApiRequest.mock.calls[1]?.[1]).toMatchObject({ method: "PUT" });
    expect(String(mockedApiRequest.mock.calls[1]?.[1]?.body ?? "")).toBe(JSON.stringify({ status: "RESOLVED", resolution_note: "Matched to supplier statement." }));
    expect(String(mockedApiRequest.mock.calls[1]?.[1]?.body ?? "")).not.toContain("client_tx_id");
  });

  it("renders empty state, loaded row fields, and row-based detail copy", () => {
    const readUser = makeUser([{ module: "accounting", resource: "journals", mask: 20 }]);
    const emptyClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedWorklist(emptyClient, { exceptions: [], total: 0, next_cursor: null, has_more: false });
    expect(renderWithProviders(createElement(PurchasingApExceptionsPage, { user: readUser }), emptyClient)).toContain("All AP accounts reconciled");

    const listClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedWorklist(listClient, { exceptions: [baseException], total: 1, next_cursor: null, has_more: false });
    const html = renderWithProviders(createElement(PurchasingApExceptionsPage, { user: readUser }), listClient);
    expect(html).toContain("AP-EXC-6905");
    expect(html).toContain("INVOICE #9001");
    expect(html).toContain("250.0000");
    expect(html).not.toContain("Escalate");
    expect(html).not.toContain("Comments");
  });

  it("handles stale highlight IDs and parses highlight links", () => {
    expect(parseApExceptionHighlightId("#/purchasing/ap-exceptions?highlight=6905")).toBe(6905);
    expect(parseApExceptionHighlightId("#/purchasing/ap-exceptions?highlight=abc")).toBeNull();

    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
    Object.defineProperty(globalThis, "location", { value: { hash: "#/purchasing/ap-exceptions?highlight=9999" }, configurable: true });
    try {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      seedWorklist(client, { exceptions: [baseException], total: 1, next_cursor: null, has_more: false });
      const html = renderWithProviders(createElement(PurchasingApExceptionsPage, { user: makeUser([{ module: "accounting", resource: "journals", mask: 20 }]) }), client);
      expect(html).toContain("Highlighted AP exception #9999 is not in the loaded worklist");
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "location", descriptor);
    }
  });

  it("mirrors actual backend permissions for route visibility and action gates", () => {
    const route = APP_ROUTES.find((item) => item.path === "/purchasing/ap-exceptions");
    expect(route?.permissionAny).toEqual([
      { module: "accounting", resource: "journals", permissionMask: 16 },
      { module: "purchasing", resource: "suppliers", permissionMask: 16 },
    ]);

    const accountingAnalyzeUser = makeUser([{ module: "accounting", resource: "journals", mask: 16 }]);
    const supplierAnalyzeUser = makeUser([{ module: "purchasing", resource: "suppliers", mask: 16 }]);
    const deniedUser = makeUser([{ module: "purchasing", resource: "suppliers", mask: 1 }]);
    expect(userCanReadApExceptions(accountingAnalyzeUser)).toBe(true);
    expect(userCanReadApExceptions(supplierAnalyzeUser)).toBe(true);
    expect(userCanReadApExceptions(deniedUser)).toBe(false);
    expect(userCanMutateApExceptions(accountingAnalyzeUser)).toBe(false);
    expect(userCanMutateApExceptions(makeUser([{ module: "accounting", resource: "journals", mask: 4 }]))).toBe(true);

    const visibleViaSupplier = filterNavigation(APP_ROUTES, supplierAnalyzeUser.roles, [], { purchasing: true }, supplierAnalyzeUser.permissions).visibleRoutes;
    expect(visibleViaSupplier.some((item) => item.path === "/purchasing/ap-exceptions")).toBe(true);
    const hiddenForDenied = filterNavigation(APP_ROUTES, deniedUser.roles, [], { purchasing: true }, deniedUser.permissions).visibleRoutes;
    expect(hiddenForDenied.some((item) => item.path === "/purchasing/ap-exceptions")).toBe(false);
  });

  it("renders ApiError status guidance for permission and conflict states", () => {
    expect(formatApExceptionApiError({ status: 403, code: "FORBIDDEN", message: "No access" })).toContain("Permission denied");
    expect(formatApExceptionApiError({ status: 409, code: "INVALID_TRANSITION", message: "Already resolved" })).toContain("Refresh the worklist");
    expect(formatApExceptionApiError({ status: 404, code: "NOT_FOUND", message: "Missing" })).toContain("not found");
  });
});
