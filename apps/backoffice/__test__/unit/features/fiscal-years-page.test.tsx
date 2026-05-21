import { describe, expect, it } from "vitest";

import {
  buildFiscalCloseApprovalResultEvidence,
  buildFiscalCloseInitiationEvidence,
  formatFiscalCloseApiError,
  resolveFiscalCloseRequestId,
  resolveFiscalYearPermissionGates,
  validateFiscalCloseReason,
  type CloseApproveResponse,
  type CloseInitiateResponse,
  type ClosePreviewResponse,
  type FiscalYearRow,
} from "@/features/fiscal-years-page";
import { ApiError } from "@/lib/api-client";
import { PERMISSION_BITS } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/session";

function makeUser(mask: number): SessionUser {
  return {
    id: 7,
    company_id: 42,
    company_timezone: "Asia/Jakarta",
    email: "fiscal-close@example.com",
    roles: ["ACCOUNTANT"],
    global_roles: [],
    outlet_role_assignments: [],
    outlets: [{ id: 5, code: "MAIN", name: "Main Outlet" }],
    permissions: [{ module: "accounting", resource: "fiscal_years", mask }],
  };
}

const fiscalYear: FiscalYearRow = {
  id: 69,
  code: "FY2026",
  name: "Fiscal Year 2026",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  status: "OPEN",
};

const closePreview: ClosePreviewResponse["data"] = {
  fiscalYearId: 69,
  fiscalYearCode: "FY2026",
  fiscalYearName: "Fiscal Year 2026",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  totalIncome: 1_500_000,
  totalExpenses: 900_000,
  netIncome: 600_000,
  retainedEarningsAccountId: 3000,
  retainedEarningsAccountCode: "3200",
  closingEntries: [
    {
      accountId: 4000,
      accountCode: "4000",
      accountName: "Revenue",
      debit: 1_500_000,
      credit: 0,
      description: "Close revenue",
    },
    {
      accountId: 5000,
      accountCode: "5000",
      accountName: "Expenses",
      debit: 0,
      credit: 900_000,
      description: "Close expenses",
    },
  ],
  entryDate: "2026-12-31",
  description: "Close FY2026",
  can_close: true,
};

describe("Fiscal close backoffice helpers", () => {
  it("gates fiscal close controls with accounting.fiscal_years MANAGE via canonical action gates", () => {
    const updateOnly = resolveFiscalYearPermissionGates(makeUser(PERMISSION_BITS.READ | PERMISSION_BITS.UPDATE));
    expect(updateOnly.READ).toBe(true);
    expect(updateOnly.UPDATE).toBe(true);
    expect(updateOnly.MANAGE).toBe(false);

    const manager = resolveFiscalYearPermissionGates(makeUser(PERMISSION_BITS.READ | PERMISSION_BITS.UPDATE | PERMISSION_BITS.MANAGE));
    expect(manager.MANAGE).toBe(true);
  });

  it("validates a trimmed non-empty close reason with a 500 character maximum", () => {
    expect(validateFiscalCloseReason("   ")).toEqual({
      value: null,
      error: "Close reason is required and must include at least one non-space character.",
      characterCount: 0,
    });
    expect(validateFiscalCloseReason(` ${"a".repeat(501)} `)).toEqual({
      value: null,
      error: "Close reason must be 500 characters or fewer.",
      characterCount: 501,
    });
    expect(validateFiscalCloseReason(" Board-approved annual close ")).toEqual({
      value: "Board-approved annual close",
      error: null,
      characterCount: 27,
    });
  });

  it("builds initiation evidence without fabricated journal links", () => {
    const evidence = buildFiscalCloseInitiationEvidence({
      fiscalYear,
      preview: closePreview,
      reason: " Annual close approved by controller ",
    });

    expect(evidence.scope).toContainEqual({ label: "Fiscal year", value: "FY2026 — Fiscal Year 2026" });
    expect(evidence.reason).toBe("Annual close approved by controller");
    expect(evidence.financialEffects.find((item) => item.label === "Net income")?.value).toContain("600.000");
    expect(evidence.closingEntryCount).toBe(2);
    expect(evidence.generatedEntryExpectation).toContain("backend-assigned journal batch IDs");
    expect(evidence.generatedEntryExpectation).toContain("text evidence");
    expect(evidence.generatedEntryExpectation).not.toContain("href");
  });

  it("preserves closeRequestId from initiation result ahead of list refresh", () => {
    const initiateResult: CloseInitiateResponse["data"] = {
      success: false,
      fiscalYearId: 69,
      closeRequestId: "close-req-69",
      status: "PENDING",
      message: "Fiscal year close initiated. Proceed to approve to post closing entries.",
      canApprove: true,
      netIncome: 600_000,
      totalIncome: 1_500_000,
      totalExpenses: 900_000,
      closingEntriesCount: 2,
    };

    expect(resolveFiscalCloseRequestId(fiscalYear, initiateResult)).toBe("close-req-69");
    expect(resolveFiscalCloseRequestId({ ...fiscalYear, close_info: { close_request_id: "from-list" } }, null)).toBe("from-list");
  });

  it("formats approval result evidence with text posted batch IDs and warnings", () => {
    const result: CloseApproveResponse["data"] = {
      success: true,
      fiscalYearId: 69,
      closeRequestId: "close-req-69",
      status: "SUCCEEDED",
      previousStatus: "OPEN",
      newStatus: "CLOSED",
      reason: "Backend persisted reason",
      postedBatchIds: [101, 102],
      netIncome: 600_000,
      totalIncome: 1_500_000,
      totalExpenses: 900_000,
      hasImbalance: false,
    };

    const evidence = buildFiscalCloseApprovalResultEvidence({
      result,
      submittedReason: "Submitted fallback",
      warnings: [{ code: "SNAPSHOT_WARNING", reason: "side_effect", message: "Snapshot failed", blocking: false }],
    });

    expect(evidence.statusTransition).toBe("OPEN → CLOSED");
    expect(evidence.postedBatchIds).toEqual(["101", "102"]);
    expect(evidence.reasonLabel).toBe("Backend reason");
    expect(evidence.reason).toBe("Backend persisted reason");
    expect(evidence.warnings).toEqual(["SNAPSHOT_WARNING: Snapshot failed"]);
  });

  it("surfaces deterministic close API error messages", () => {
    expect(formatFiscalCloseApiError(new ApiError(400, "INVALID_REQUEST", "bad request"))).toBe("INVALID_REQUEST: Fiscal year close reason is required and must be 500 characters or fewer.");
    expect(formatFiscalCloseApiError(new ApiError(409, "FISCAL_YEAR_ALREADY_CLOSED", "closed"))).toBe("FISCAL_YEAR_ALREADY_CLOSED: This fiscal year is already closed. Refresh fiscal years before retrying.");
    expect(formatFiscalCloseApiError(new ApiError(409, "CLOSE_CONFLICT", "conflict"))).toBe("CLOSE_CONFLICT: A fiscal close request already exists or changed on the server. Refresh fiscal years before retrying.");
    expect(formatFiscalCloseApiError(new ApiError(400, "RETAINED_EARNINGS_NOT_FOUND", "missing"))).toBe("RETAINED_EARNINGS_NOT_FOUND: Configure the retained earnings account before closing this fiscal year.");
  });
});
