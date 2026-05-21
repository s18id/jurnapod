import { MantineProvider } from "@mantine/core";
import type { AccountResponse, JournalEntryResponse } from "@jurnapod/shared";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/connection", () => ({ useOnlineStatus: () => true }));

vi.mock("@/hooks/use-accounts", () => ({
  useAccounts: vi.fn(),
}));

vi.mock("@/hooks/use-journals", () => ({
  useJournalBatches: vi.fn(),
  createManualJournalEntry: vi.fn(),
  updateManualJournalEntry: vi.fn(),
  postManualJournalEntry: vi.fn(),
  voidManualJournalEntry: vi.fn(),
}));

import { APP_ROUTES } from "@/app/routes";
import {
  buildJournalVoidDiffChanges,
  buildJournalPostDiffChanges,
  calculateJournalTotals,
  entryDate,
  formatJournalApiError,
  formForEntrySelection,
  isVoidEligibleJournal,
  isJournalDraftDirty,
  journalVoidResultMessages,
  journalReviewBlockReason,
  JournalsPage,
} from "@/features/journals-page";
import { useAccounts } from "@/hooks/use-accounts";
import { useJournalBatches } from "@/hooks/use-journals";
import { ApiError } from "@/lib/api-client";
import { PERMISSION_BITS } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/session";

const mockedUseAccounts = vi.mocked(useAccounts);
const mockedUseJournalBatches = vi.mocked(useJournalBatches);

const accounts: AccountResponse[] = [
  {
    id: 10,
    company_id: 42,
    code: "1000",
    name: "Cash",
    account_type_id: null,
    type_name: "Asset",
    normal_balance: "D",
    report_group: "NRC",
    parent_account_id: null,
    is_group: false,
    is_payable: true,
    is_active: true,
    created_at: "2026-05-20T00:00:00.000Z",
    updated_at: "2026-05-20T00:00:00.000Z",
  },
  {
    id: 20,
    company_id: 42,
    code: "4000",
    name: "Revenue",
    account_type_id: null,
    type_name: "Income",
    normal_balance: "C",
    report_group: "PL",
    parent_account_id: null,
    is_group: false,
    is_payable: true,
    is_active: true,
    created_at: "2026-05-20T00:00:00.000Z",
    updated_at: "2026-05-20T00:00:00.000Z",
  },
];

const draftJournal: JournalEntryResponse = {
  id: 77,
  company_id: 42,
  outlet_id: 5,
  status: "DRAFT",
  reference: "MAN-77",
  description: "Accrual draft",
  entry_date: "2026-05-20",
  doc_type: "MANUAL",
  doc_id: 77,
  client_ref: null,
  posted_at: null,
  created_at: "2026-05-20T01:00:00.000Z",
  updated_at: "2026-05-20T01:00:00.000Z",
  total_debits: 100.30,
  total_credits: 100.30,
  lines: [
    { id: 1, journal_id: 77, journal_draft_id: 77, journal_batch_id: null, company_id: 42, outlet_id: 5, line_date: "2026-05-20", account_id: 10, debit: 100.30, credit: 0, description: "Debit", created_at: "2026-05-20T01:00:00.000Z", updated_at: "2026-05-20T01:00:00.000Z" },
    { id: 2, journal_id: 77, journal_draft_id: 77, journal_batch_id: null, company_id: 42, outlet_id: 5, line_date: "2026-05-20", account_id: 20, debit: 0, credit: 100.30, description: "Credit", created_at: "2026-05-20T01:00:00.000Z", updated_at: "2026-05-20T01:00:00.000Z" },
  ],
};

const postedJournal: JournalEntryResponse = {
  id: 88,
  company_id: 42,
  outlet_id: null,
  status: "POSTED",
  reference: "MAN-88",
  total_debits: 45,
  total_credits: 45,
  doc_type: "MANUAL",
  doc_id: 88,
  client_ref: null,
  posted_at: "2026-05-20T02:00:00.000Z",
  created_at: "2026-05-20T02:00:00.000Z",
  updated_at: "2026-05-20T02:00:00.000Z",
  lines: [
    { id: 3, journal_id: 88, journal_batch_id: 88, journal_draft_id: null, company_id: 42, outlet_id: null, line_date: "2026-05-19", account_id: 10, debit: 45, credit: 0, description: "Debit", created_at: "2026-05-20T02:00:00.000Z", updated_at: "2026-05-20T02:00:00.000Z" },
    { id: 4, journal_id: 88, journal_batch_id: 88, journal_draft_id: null, company_id: 42, outlet_id: null, line_date: "2026-05-19", account_id: 20, debit: 0, credit: 45, description: "Credit", created_at: "2026-05-20T02:00:00.000Z", updated_at: "2026-05-20T02:00:00.000Z" },
  ],
};

const voidedJournal: JournalEntryResponse = {
  ...postedJournal,
  id: 89,
  status: "VOIDED",
  reference: "MAN-89",
  void_reason: "Duplicate accrual reversal",
  voided_at: "2026-05-20T03:00:00.000Z",
  voided_by_user_id: 7,
  reversal_journal_id: 90,
  lines: postedJournal.lines.map((line) => ({ ...line, journal_id: 89, journal_batch_id: 89 })),
};

const reversalJournal: JournalEntryResponse = {
  ...postedJournal,
  id: 90,
  status: "REVERSAL",
  reference: "REV-90",
  original_journal_id: 89,
  lines: postedJournal.lines.map((line) => ({ ...line, journal_id: 90, journal_batch_id: 90 })),
};

function makeUser(mask: number): SessionUser {
  return {
    id: 7,
    company_id: 42,
    company_timezone: "Asia/Jakarta",
    email: "journals@example.com",
    roles: ["ACCOUNTANT"],
    global_roles: [],
    outlet_role_assignments: [],
    outlets: [{ id: 5, code: "MAIN", name: "Main Outlet" }],
    permissions: [{ module: "accounting", resource: "journals", mask }],
  };
}

function renderWithProviders(element: ReactElement): string {
  return renderToStaticMarkup(createElement(MantineProvider, {}, element));
}

describe("Journal create/post backoffice screen", () => {
  beforeEach(() => {
    mockedUseAccounts.mockReturnValue({ data: accounts, loading: false, error: null, refetch: vi.fn() });
    mockedUseJournalBatches.mockReturnValue({ data: [draftJournal, postedJournal, voidedJournal, reversalJournal], loading: false, error: null, refetch: vi.fn() });
  });

  it("declares route metadata for accounting.journals READ", () => {
    const route = APP_ROUTES.find((item) => item.path === "/journals");
    expect(route?.permission).toEqual({ module: "accounting", resource: "journals", permissionMask: PERMISSION_BITS.READ });
  });

  it("uses canonical money rounding for real-time balance gates", () => {
    expect(calculateJournalTotals([{ debit: 0.1, credit: 0 }, { debit: 0.2, credit: 0 }, { debit: 0, credit: 0.3 }])).toEqual({
      totalDebits: 0.3,
      totalCredits: 0.3,
      difference: 0,
      isBalanced: true,
    });
    expect(calculateJournalTotals([{ debit: 100, credit: 0 }, { debit: 0, credit: 99 }]).isBalanced).toBe(false);
  });

  it("renders verified list fields, filters, void statuses, correction metadata, and immutable wording", () => {
    const html = renderWithProviders(createElement(JournalsPage, { user: makeUser(PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE) }));

    expect(html).toContain("Journal Entries");
    expect(html).toContain("Status");
    expect(html).toContain("Reference");
    expect(html).toContain("Total Debits");
    expect(html).toContain("Total Credits");
    expect(html).toContain("MAN-77");
    expect(html).toContain("MAN-88");
    expect(html).toContain("DRAFT");
    expect(html).toContain("POSTED");
    expect(html).toContain("VOIDED");
    expect(html).toContain("REVERSAL");
    expect(html).toContain("Voided");
    expect(html).toContain("Reversal");
    expect(html).toContain("Void reason: Duplicate accrual reversal");
    expect(html).toContain("Reversal journal ID: 90");
    expect(html).toContain("Original journal ID: 89");
    expect(html).toContain("2026-05-19");
    expect(html).not.toContain("2026-05-20 02:00:00 UTC");
    expect(html).toContain("Create Draft Journal");
    expect(html).toContain("Totals");
    expect(html).toContain("Review and post draft");
    expect(html).toContain("read-only detail");
    expect(html).not.toContain("href=&quot;#/audit");
  });

  it("gates void action with accounting.journals DELETE while keeping backend authoritative", () => {
    const noDeleteHtml = renderWithProviders(createElement(JournalsPage, { user: makeUser(PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE) }));
    expect(noDeleteHtml).toContain("Void requires accounting.journals.DELETE.");
    expect(noDeleteHtml).not.toContain("Review void");

    const deleteHtml = renderWithProviders(createElement(JournalsPage, { user: makeUser(PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE) }));
    expect(deleteHtml).toContain("Review void");
    expect(deleteHtml).not.toContain("Void requires accounting.journals.DELETE.");
    expect(isVoidEligibleJournal(postedJournal)).toBe(true);
    expect(isVoidEligibleJournal(draftJournal)).toBe(false);
    expect(isVoidEligibleJournal(voidedJournal)).toBe(false);
    expect(isVoidEligibleJournal(reversalJournal)).toBe(false);
  });

  it("flags incomplete backend void evidence when reversal_journal_id is missing", () => {
    expect(journalVoidResultMessages(voidedJournal)).toEqual({
      success: "Journal voided. Reversal journal ID 90 was assigned by backend.",
      error: null,
    });

    const incompleteVoidedJournal = { ...voidedJournal, reversal_journal_id: null };
    expect(journalVoidResultMessages(incompleteVoidedJournal)).toEqual({
      success: null,
      error: "VOID_EVIDENCE_INCOMPLETE: Backend void response did not include reversal_journal_id. Refresh the list and contact support before relying on this correction evidence.",
    });
  });

  it("gates create/update actions for read-only journal users", () => {
    const html = renderWithProviders(createElement(JournalsPage, { user: makeUser(PERMISSION_BITS.READ) }));

    expect(html).toContain("Read-only access: accounting.journals.CREATE is required to create drafts.");
  });

  it("surfaces deterministic API errors and post ReviewPanel before/after diff evidence", () => {
    expect(formatJournalApiError(new ApiError(409, "JOURNAL_ALREADY_POSTED", "already posted"))).toBe("JOURNAL_ALREADY_POSTED: Posted journals are immutable and cannot be edited again.");
    expect(formatJournalApiError(new ApiError(409, "JOURNAL_ALREADY_VOIDED", "already voided"))).toBe("JOURNAL_ALREADY_VOIDED: This journal was already voided. Refresh the list before retrying.");
    expect(formatJournalApiError(new ApiError(422, "JOURNAL_VOID_NOT_ALLOWED", "not allowed"))).toBe("JOURNAL_VOID_NOT_ALLOWED: Only posted manual journals can be voided from this screen.");
    expect(formatJournalApiError(new ApiError(422, "JOURNAL_CANNOT_VOID_DRAFT", "draft"))).toBe("JOURNAL_CANNOT_VOID_DRAFT: Draft journals cannot be voided. Delete or edit the draft workflow instead.");
    expect(formatJournalApiError(new ApiError(409, "SERVICE_VERSION_MISMATCH", "mismatch"))).toBe("SERVICE_VERSION_MISMATCH: The journal changed on the server. Refresh the list before retrying.");
    expect(formatJournalApiError(new ApiError(422, "FISCAL_YEAR_CLOSED", "closed"))).toBe("FISCAL_YEAR_CLOSED: The selected fiscal year is closed.");

    const diff = buildJournalPostDiffChanges(draftJournal);
    expect(diff).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "status", oldFormatted: "DRAFT", newFormatted: "POSTED" }),
      expect.objectContaining({ path: "posted_at", newFormatted: "Assigned by backend on confirmation" }),
    ]));

    const voidDiff = buildJournalVoidDiffChanges(postedJournal, " Duplicate entry ");
    expect(voidDiff).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "status", oldFormatted: "POSTED", newFormatted: "VOIDED" }),
      expect.objectContaining({ path: "void_reason", oldFormatted: "—", newFormatted: "Duplicate entry" }),
      expect.objectContaining({ path: "reversal_journal_id", oldFormatted: "—", newFormatted: "Assigned by backend on confirmation" }),
    ]));
  });

  it("resets the draft edit form when selecting a posted journal", () => {
    const draftForm = formForEntrySelection(draftJournal, "Asia/Jakarta");
    expect(draftForm.id).toBe(draftJournal.id);

    const postedSelectionForm = formForEntrySelection(postedJournal, "Asia/Jakarta");
    expect(postedSelectionForm.id).toBeNull();
    expect(postedSelectionForm.description).toBe("");
    expect(postedSelectionForm.reference).toBe("");
    expect(postedSelectionForm.lines).toHaveLength(2);
  });

  it("blocks review/post when the selected draft form has unsaved edits", () => {
    const savedForm = formForEntrySelection(draftJournal, "Asia/Jakarta");
    expect(isJournalDraftDirty(draftJournal, savedForm)).toBe(false);
    expect(journalReviewBlockReason(draftJournal, savedForm)).toBeNull();

    const dirtyForm = { ...savedForm, description: "Unsaved local edit" };
    expect(isJournalDraftDirty(draftJournal, dirtyForm)).toBe(true);
    expect(journalReviewBlockReason(draftJournal, dirtyForm)).toBe("Save the draft before review/post. The visible form contains unsaved changes that are not part of the saved backend draft evidence.");
  });

  it("uses accounting date for posted journal rows instead of posted_at", () => {
    expect(entryDate(postedJournal)).toBe("2026-05-19");
    expect(entryDate(postedJournal)).not.toBe(postedJournal.posted_at);
  });
});
