import { MantineProvider } from "@mantine/core";
import type { AccountTreeNode } from "@jurnapod/shared";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  apiRequest: vi.fn(),
}));

vi.mock("@/lib/connection", () => ({ useOnlineStatus: () => true }));

vi.mock("@/hooks/use-accounts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-accounts")>();
  return {
    ...actual,
    useAccountTree: vi.fn(),
    useAccountTypes: vi.fn(),
  };
});

import { APP_ROUTES } from "@/app/routes";
import {
  AccountsPage,
  buildAccountDiffChanges,
  formatAccountApiError,
  validateAccountForm,
} from "@/features/accounts-page";
import { createAccount, updateAccount, useAccountTree, useAccountTypes } from "@/hooks/use-accounts";
import { apiRequest, ApiError } from "@/lib/api-client";
import { PERMISSION_BITS } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/session";

const mockedApiRequest = vi.mocked(apiRequest);
const mockedUseAccountTree = vi.mocked(useAccountTree);
const mockedUseAccountTypes = vi.mocked(useAccountTypes);

const account: AccountTreeNode = {
  id: 10,
  company_id: 42,
  code: "1000",
  name: "Cash",
  account_type_id: null,
  type_name: "Asset",
  normal_balance: "D",
  report_group: "NRC",
  parent_account_id: null,
  is_group: true,
  is_payable: false,
  is_active: true,
  created_at: "2026-05-20T00:00:00.000Z",
  updated_at: "2026-05-20T00:00:00.000Z",
  children: [{
    id: 11,
    company_id: 42,
    code: "1010",
    name: "Cash Drawer",
    account_type_id: null,
    type_name: "Asset",
    normal_balance: "D",
    report_group: "NRC",
    parent_account_id: 10,
    is_group: false,
    is_payable: true,
    is_active: true,
    created_at: "2026-05-20T00:00:00.000Z",
    updated_at: "2026-05-20T00:00:00.000Z",
    children: [],
  }],
};

function makeUser(permissions: SessionUser["permissions"]): SessionUser {
  return {
    id: 7,
    company_id: 42,
    email: "accounts@example.com",
    roles: ["ACCOUNTANT"],
    global_roles: [],
    outlet_role_assignments: [],
    outlets: [],
    permissions,
  };
}

function renderWithProviders(element: ReactElement): string {
  return renderToStaticMarkup(createElement(MantineProvider, {}, element));
}

describe("Chart of accounts backoffice screen", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedUseAccountTree.mockReturnValue({ data: [account], loading: false, error: null, refetch: vi.fn() });
    mockedUseAccountTypes.mockReturnValue({ data: [], loading: false, error: null, refetch: vi.fn() });
  });

  it("declares route metadata for accounting.accounts READ", () => {
    const route = APP_ROUTES.find((item) => item.path === "/chart-of-accounts");
    expect(route?.permission).toEqual({ module: "accounting", resource: "accounts", permissionMask: PERMISSION_BITS.READ });
  });

  it("uses verified account endpoints and PUT for edits", async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ success: true, data: account })
      .mockResolvedValueOnce({ success: true, data: account });

    await createAccount({ company_id: 42, code: "1020", name: "Bank", is_group: false, is_active: true });
    await updateAccount(10, { name: "Cash Main" });

    expect(mockedApiRequest.mock.calls[0]?.[0]).toBe("/accounts");
    expect(mockedApiRequest.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(mockedApiRequest.mock.calls[1]?.[0]).toBe("/accounts/10");
    expect(mockedApiRequest.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(mockedApiRequest.mock.calls[1]?.[1]?.method).not.toBe("PATCH");
  });

  it("validates forms, maps account API errors, and builds review diffs", () => {
    expect(validateAccountForm({ code: "", name: "", parent_account_id: null, is_group: false, account_type_id: null, type_name: null, normal_balance: null, report_group: null, is_payable: false, is_active: true })).toMatchObject({ code: "Account code is required", name: "Account name is required" });
    expect(formatAccountApiError(new ApiError(409, "duplicate", "DUPLICATE_CODE"))).toBe("Account code already exists.");
    expect(buildAccountDiffChanges(account, { code: "1000", name: "Cash Main", parent_account_id: null, is_group: true, account_type_id: null, type_name: "Asset", normal_balance: "D", report_group: "NRC", is_payable: false, is_active: true })).toEqual(expect.arrayContaining([expect.objectContaining({ path: "name", kind: "changed" })]));
  });

  it("renders tree/flat controls, ReviewPanel-backed scope messaging, and no fabricated history links", () => {
    const html = renderWithProviders(createElement(AccountsPage, { user: makeUser([{ module: "accounting", resource: "accounts", mask: PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE }]) }));

    expect(html).toContain("Chart of Accounts");
    expect(html).toContain("Create Account");
    expect(html).toContain("Tree");
    expect(html).toContain("Flat");
    expect(html).toContain("Cash");
    expect(html).toContain("Journal-line history remains unavailable");
    expect(html).not.toContain("href=\"#/audit");
    expect(html).not.toContain("/journals");
  });

  it("gates create/update for read-only users and blocks CASHIER/no-read users before account fetch", () => {
    const readOnlyHtml = renderWithProviders(createElement(AccountsPage, { user: makeUser([{ module: "accounting", resource: "accounts", mask: PERMISSION_BITS.READ }]) }));
    expect(readOnlyHtml).toContain("Read-only access");
    expect(readOnlyHtml).not.toContain("Create Account");

    mockedUseAccountTree.mockClear();
    mockedUseAccountTypes.mockClear();
    const deniedHtml = renderWithProviders(createElement(AccountsPage, { user: makeUser([]) }));
    expect(deniedHtml).toContain("Access denied");
    expect(mockedUseAccountTree.mock.calls[0]?.[2]).toEqual({ enabled: false });
    expect(mockedUseAccountTypes.mock.calls[0]?.[2]).toEqual({ enabled: false });
  });
});
