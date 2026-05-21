// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Temporal } from "@js-temporal/polyfill";
import type { AccountResponse, JournalEntryResponse, ManualJournalEntryCreateRequest } from "@jurnapod/shared";
import { Alert, Button, Card, Group, Stack, Text } from "@mantine/core";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { PageCard } from "@/components/PageCard";
import { ReviewPanel, type ReviewPanelSection } from "@/components/ReviewPanel";
import { useAccounts } from "@/hooks/use-accounts";
import {
  createManualJournalEntry,
  postManualJournalEntry,
  updateManualJournalEntry,
  voidManualJournalEntry,
  useJournalBatches,
} from "@/hooks/use-journals";
import { useOnlineStatus } from "@/lib/connection";
import { diffValues, type DiffChange } from "@/lib/diff-engine";
import { ApiError } from "@/lib/api-client";
import { actionGates, resolveEffectivePermissions } from "@/lib/auth/permissions";
import { buildJournalLineReviewGroups } from "@/lib/financial-review-formatters";
import type { SessionUser } from "@/lib/session";

type JournalsPageProps = {
  user: SessionUser;
};

type JournalFormLine = {
  id: string;
  account_id: number | null;
  debit: number;
  credit: number;
  description: string;
};

type JournalFormState = {
  id: number | null;
  entry_date: string;
  reference: string;
  description: string;
  outlet_id: string;
  lines: JournalFormLine[];
};

type JournalListFilters = {
  start_date: string;
  end_date: string;
  status: JournalStatusFilter;
  reference: string;
};

export type JournalStatusFilter = "ALL" | JournalEntryResponse["status"];

export const JOURNAL_STATUS_FILTER_OPTIONS: readonly { value: JournalStatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "POSTED", label: "Posted" },
  { value: "VOIDED", label: "Voided" },
  { value: "REVERSAL", label: "Reversal" },
];

const inputStyle = {
  border: "1px solid #cabfae",
  borderRadius: "6px",
  padding: "6px 8px",
  width: "100%",
} as const;

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

const cellStyle = {
  borderBottom: "1px solid #ece7dc",
  padding: "8px",
} as const;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function addMoney(left: number, right: number): number {
  return Math.round((left + right) * 100) / 100;
}

export function calculateJournalTotals(lines: readonly Pick<JournalFormLine, "debit" | "credit">[]) {
  const totalDebits = lines.reduce((sum, line) => addMoney(sum, Number(line.debit) || 0), 0);
  const totalCredits = lines.reduce((sum, line) => addMoney(sum, Number(line.credit) || 0), 0);
  const difference = roundMoney(totalDebits - totalCredits);
  return {
    totalDebits,
    totalCredits,
    difference,
    isBalanced: totalDebits > 0 && Math.abs(difference) < 0.01,
  };
}

export function formatMoney(value: number | null | undefined): string {
  return roundMoney(Number(value) || 0).toFixed(2);
}

export function formatJournalApiError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Journal request failed. Please retry or contact an administrator.";
  }
  const messages: Record<string, string> = {
    INVALID_REQUEST: "INVALID_REQUEST: Review required journal fields and balanced line amounts.",
    NOT_FOUND: "NOT_FOUND: Journal was not found or is outside your company.",
    JOURNAL_ALREADY_POSTED: "JOURNAL_ALREADY_POSTED: Posted journals are immutable and cannot be edited again.",
    JOURNAL_ALREADY_VOIDED: "JOURNAL_ALREADY_VOIDED: This journal was already voided. Refresh the list before retrying.",
    JOURNAL_VOID_NOT_ALLOWED: "JOURNAL_VOID_NOT_ALLOWED: Only posted manual journals can be voided from this screen.",
    JOURNAL_CANNOT_VOID_DRAFT: "JOURNAL_CANNOT_VOID_DRAFT: Draft journals cannot be voided. Delete or edit the draft workflow instead.",
    FISCAL_YEAR_CLOSED: "FISCAL_YEAR_CLOSED: The selected fiscal year is closed.",
    JOURNAL_OUTSIDE_FISCAL_YEAR: "JOURNAL_OUTSIDE_FISCAL_YEAR: Journal date is outside an open fiscal year.",
    INVALID_ACCOUNT: "INVALID_ACCOUNT: One or more accounts are invalid for this company.",
    INVALID_OUTLET: "INVALID_OUTLET: Selected outlet is invalid for this company.",
    FORBIDDEN: "FORBIDDEN: You do not have permission for this journal action.",
    SERVICE_VERSION_MISMATCH: "SERVICE_VERSION_MISMATCH: The journal changed on the server. Refresh the list before retrying.",
  };
  return messages[error.code] ?? `${error.code}: ${error.message}`;
}

export function buildJournalPostDiffChanges(entry: JournalEntryResponse): DiffChange[] {
  return diffValues(
    {
      status: entry.status,
      posted_at: entry.posted_at ?? null,
      total_debits: entry.total_debits ?? calculateJournalTotals(entry.lines).totalDebits,
      total_credits: entry.total_credits ?? calculateJournalTotals(entry.lines).totalCredits,
    },
    {
      status: "POSTED",
      posted_at: "Assigned by backend on confirmation",
      total_debits: entry.total_debits ?? calculateJournalTotals(entry.lines).totalDebits,
      total_credits: entry.total_credits ?? calculateJournalTotals(entry.lines).totalCredits,
    },
    {
      labels: {
        status: "Journal status",
        posted_at: "Post timestamp",
        total_debits: "Total debits",
        total_credits: "Total credits",
      },
      moneyFields: ["total_debits", "total_credits"],
    },
  );
}

export function buildJournalVoidDiffChanges(entry: JournalEntryResponse, reason: string): DiffChange[] {
  return diffValues(
    {
      status: entry.status,
      void_reason: entry.void_reason ?? null,
      reversal_journal_id: entry.reversal_journal_id ?? null,
    },
    {
      status: "VOIDED",
      void_reason: reason.trim(),
      reversal_journal_id: "Assigned by backend on confirmation",
    },
    {
      labels: {
        status: "Journal status",
        void_reason: "Void reason",
        reversal_journal_id: "Reversal journal ID",
      },
    },
  );
}

export function isVoidEligibleJournal(entry: JournalEntryResponse): boolean {
  return entry.status === "POSTED" && entry.doc_type === "MANUAL";
}

function currentJournalDate(companyTimezone?: string | null): string {
  // Journal UI date fallback is explicit: company timezone when available, UTC when profile lacks timezone.
  const timezone = companyTimezone?.trim() || "UTC";
  return Temporal.Now.plainDateISO(timezone).toString();
}

function emptyForm(companyTimezone?: string | null): JournalFormState {
  return {
    id: null,
    entry_date: currentJournalDate(companyTimezone),
    reference: "",
    description: "",
    outlet_id: "",
    lines: [
      { id: "line-1", account_id: null, debit: 0, credit: 0, description: "" },
      { id: "line-2", account_id: null, debit: 0, credit: 0, description: "" },
    ],
  };
}

function formFromEntry(entry: JournalEntryResponse): JournalFormState {
  return {
    id: entry.id,
    entry_date: entry.status === "DRAFT" ? entry.entry_date : entry.lines[0]?.line_date ?? "",
    reference: entry.reference ?? "",
    description: entry.status === "DRAFT" ? entry.description : entry.reference ?? "Posted journal",
    outlet_id: entry.outlet_id ? String(entry.outlet_id) : "",
    lines: entry.lines.map((line) => ({
      id: `line-${line.id}`,
      account_id: line.account_id,
      debit: Number(line.debit) || 0,
      credit: Number(line.credit) || 0,
      description: line.description ?? "",
    })),
  };
}

export function entryDate(entry: JournalEntryResponse): string {
  if (entry.status === "DRAFT") return entry.entry_date;
  return entry.lines[0]?.line_date ?? "—";
}

export function formForEntrySelection(entry: JournalEntryResponse, companyTimezone?: string | null): JournalFormState {
  return entry.status === "DRAFT" ? formFromEntry(entry) : emptyForm(companyTimezone);
}

function normalizeFormForDirtyCheck(form: JournalFormState) {
  return {
    id: form.id,
    entry_date: form.entry_date,
    reference: form.reference,
    description: form.description,
    outlet_id: form.outlet_id,
    lines: form.lines.map((line) => ({
      account_id: line.account_id,
      debit: roundMoney(line.debit),
      credit: roundMoney(line.credit),
      description: line.description,
    })),
  };
}

export function isJournalDraftDirty(entry: JournalEntryResponse | null, form: JournalFormState): boolean {
  if (!entry || entry.status !== "DRAFT" || form.id !== entry.id) return false;
  return JSON.stringify(normalizeFormForDirtyCheck(form)) !== JSON.stringify(normalizeFormForDirtyCheck(formFromEntry(entry)));
}

export function journalReviewBlockReason(entry: JournalEntryResponse | null, form: JournalFormState): string | null {
  if (!isJournalDraftDirty(entry, form)) return null;
  return "Save the draft before review/post. The visible form contains unsaved changes that are not part of the saved backend draft evidence.";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace("T", " ").replace(/\.\d+Z?$/, " UTC").replace(/Z$/, " UTC");
}

export function journalCorrectionSummary(entry: JournalEntryResponse): string {
  const parts: string[] = [];
  if (entry.status === "VOIDED") {
    if (entry.void_reason) parts.push(`Void reason: ${entry.void_reason}`);
    if (entry.voided_at) parts.push(`Voided at: ${formatDateTime(entry.voided_at)}`);
    if (entry.voided_by_user_id) parts.push(`Voided by user ID: ${entry.voided_by_user_id}`);
    if (entry.reversal_journal_id) parts.push(`Reversal journal ID: ${entry.reversal_journal_id}`);
  }
  if (entry.status === "REVERSAL" && entry.original_journal_id) {
    parts.push(`Original journal ID: ${entry.original_journal_id}`);
  }
  return parts.length > 0 ? parts.join("; ") : "—";
}

export function journalVoidResultMessages(entry: JournalEntryResponse): { success: string | null; error: string | null } {
  if (entry.status === "VOIDED" && !entry.reversal_journal_id) {
    return {
      success: null,
      error: "VOID_EVIDENCE_INCOMPLETE: Backend void response did not include reversal_journal_id. Refresh the list and contact support before relying on this correction evidence.",
    };
  }
  if (entry.reversal_journal_id) {
    return {
      success: `Journal voided. Reversal journal ID ${entry.reversal_journal_id} was assigned by backend.`,
      error: null,
    };
  }
  return {
    success: "Journal void completed with backend response. Refresh the list to verify correction evidence.",
    error: null,
  };
}

export function journalTraceSummary(entry: JournalEntryResponse): string {
  const journalBatchId = entry.lines.find((line) => line.journal_batch_id != null)?.journal_batch_id ?? null;
  const traceParts = [`Journal ID ${entry.id}`];
  if (journalBatchId != null) traceParts.push(`journal_batch_id ${journalBatchId}`);
  if (entry.reversal_journal_id != null) traceParts.push(`reversal_journal_id ${entry.reversal_journal_id}`);
  if (entry.original_journal_id != null) traceParts.push(`original_journal_id ${entry.original_journal_id}`);
  return traceParts.join("; ");
}

function accountLabel(accounts: AccountResponse[], accountId: number): string {
  const account = accounts.find((item) => item.id === accountId);
  return account ? `${account.code} - ${account.name}` : `Account #${accountId}`;
}

function validateForm(form: JournalFormState) {
  const totals = calculateJournalTotals(form.lines);
  const errors: string[] = [];
  if (!form.entry_date) errors.push("Entry date is required.");
  if (!form.description.trim()) errors.push("Description is required.");
  if (form.lines.length < 2) errors.push("At least two journal lines are required.");
  if (!totals.isBalanced) errors.push("Total debits must equal total credits before save or post.");
  if (form.lines.some((line) => !line.account_id)) errors.push("Every line must select an account.");
  if (form.lines.some((line) => line.debit > 0 && line.credit > 0)) errors.push("A line cannot contain both debit and credit.");
  if (form.lines.some((line) => line.debit <= 0 && line.credit <= 0)) errors.push("Every line must contain a debit or credit amount.");
  return errors;
}

function buildPayload(companyId: number, form: JournalFormState): ManualJournalEntryCreateRequest {
  return {
    company_id: companyId,
    outlet_id: form.outlet_id ? Number(form.outlet_id) : undefined,
    entry_date: form.entry_date,
    reference: form.reference.trim() || undefined,
    description: form.description.trim(),
    lines: form.lines.map((line) => ({
      account_id: line.account_id ?? 0,
      debit: roundMoney(line.debit),
      credit: roundMoney(line.credit),
      description: line.description.trim() || form.description.trim(),
    })),
  };
}

function DetailField(props: { label: string; value: string | number }) {
  return (
    <div>
      <strong>{props.label}:</strong> {props.value}
    </div>
  );
}

function JournalLinesTable(props: { entry: JournalEntryResponse; accounts: AccountResponse[] }) {
  const totals = calculateJournalTotals(props.entry.lines);
  return (
    <table style={tableStyle} aria-label="Journal detail lines">
      <thead>
        <tr style={{ backgroundColor: "#f5f1ea" }}>
          <th style={{ ...cellStyle, textAlign: "left" }}>Account</th>
          <th style={{ ...cellStyle, textAlign: "left" }}>Description</th>
          <th style={{ ...cellStyle, textAlign: "right" }}>Debit</th>
          <th style={{ ...cellStyle, textAlign: "right" }}>Credit</th>
        </tr>
      </thead>
      <tbody>
        {props.entry.lines.map((line) => (
          <tr key={line.id}>
            <td style={cellStyle}>{accountLabel(props.accounts, line.account_id)}</td>
            <td style={cellStyle}>{line.description || "—"}</td>
            <td style={{ ...cellStyle, textAlign: "right" }}>{line.debit > 0 ? formatMoney(line.debit) : ""}</td>
            <td style={{ ...cellStyle, textAlign: "right" }}>{line.credit > 0 ? formatMoney(line.credit) : ""}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr style={{ backgroundColor: "#f5f1ea", fontWeight: "bold" }}>
          <td style={cellStyle}>Total</td>
          <td style={cellStyle}></td>
          <td style={{ ...cellStyle, textAlign: "right" }}>{formatMoney(totals.totalDebits)}</td>
          <td style={{ ...cellStyle, textAlign: "right" }}>{formatMoney(totals.totalCredits)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function JournalLineReviewEvidence(props: { entry: JournalEntryResponse; accounts: AccountResponse[] }) {
  const groupedEvidence = buildJournalLineReviewGroups({
    beforeLines: props.entry.lines,
    resolveAccountLabel: (accountId) => accountLabel(props.accounts, accountId),
  });

  if (!groupedEvidence.isComplex) {
    return <JournalLinesTable entry={props.entry} accounts={props.accounts} />;
  }

  return (
    <Stack gap="xs" aria-label="Complex journal line review groups">
      <Alert color="blue">
        Complex journal evidence: {groupedEvidence.totalUnchangedLineCount} unchanged backend-returned lines collapsed; {groupedEvidence.totalChangedLineCount} changed lines shown. Line grouping is display-only and does not recompute accounting effects.
      </Alert>
      {groupedEvidence.groups.map((group) => (
        <Card key={group.accountKey} withBorder radius="sm" p="sm">
          <Stack gap={4}>
            <Text fw={600}>{group.accountLabel}</Text>
            {group.changedLines.map((line) => (
              <Text key={line.id} size="sm">Line {line.id}: {line.description}; debit {formatMoney(line.debit)}; credit {formatMoney(line.credit)}</Text>
            ))}
            {group.unchangedLineCount > 0 ? <Text size="sm" c="dimmed">{group.unchangedLineCount} unchanged lines</Text> : null}
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

export function JournalsPage({ user }: JournalsPageProps) {
  const isOnline = useOnlineStatus();
  const permissions = useMemo(() => {
    const effective = resolveEffectivePermissions(user) ?? [];
    return actionGates(effective, "accounting", "journals", ["READ", "CREATE", "UPDATE", "DELETE"]);
  }, [user]);
  const accountFilters = useMemo(() => ({ is_active: true }), []);
  const { data: accounts, loading: accountsLoading, error: accountsError } = useAccounts(user.company_id, accountFilters);
  const [filters, setFilters] = useState<JournalListFilters>({
    start_date: "",
    end_date: "",
    status: "ALL",
    reference: "",
  });
  const apiFilters = useMemo(() => ({
    start_date: filters.start_date || undefined,
    end_date: filters.end_date || undefined,
    limit: 100,
    offset: 0,
  }), [filters.start_date, filters.end_date]);
  const { data: journals, loading, error, refetch } = useJournalBatches(user.company_id, apiFilters, { enabled: permissions.READ });
  const [form, setForm] = useState<JournalFormState>(() => emptyForm(user.company_timezone));
  const [lineSequence, setLineSequence] = useState(3);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntryResponse | null>(null);
  const [reviewEntry, setReviewEntry] = useState<JournalEntryResponse | null>(null);
  const [voidReviewEntry, setVoidReviewEntry] = useState<JournalEntryResponse | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidReasonError, setVoidReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const totals = useMemo(() => calculateJournalTotals(form.lines), [form.lines]);
  const formErrors = useMemo(() => validateForm(form), [form]);
  const filteredJournals = useMemo(() => {
    const reference = filters.reference.trim().toLowerCase();
    return journals.filter((entry) => {
      if (filters.status !== "ALL" && entry.status !== filters.status) return false;
      if (!reference) return true;
      return (entry.reference ?? "").toLowerCase().includes(reference) || String(entry.id).includes(reference);
    });
  }, [journals, filters.reference, filters.status]);

  if (!permissions.READ) {
    return <Alert color="red" title="Access denied">accounting.journals.READ is required to view journals.</Alert>;
  }

  const isEditing = form.id !== null;
  const canSave = isEditing ? permissions.UPDATE : permissions.CREATE;
  const editableSelectedEntry = selectedEntry?.status === "DRAFT" ? selectedEntry : null;
  const reviewBlockReason = journalReviewBlockReason(editableSelectedEntry, form);
  const trimmedVoidReason = voidReason.trim();

  function updateLine(id: string, patch: Partial<JournalFormLine>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) => line.id === id ? { ...line, ...patch } : line),
    }));
  }

  function resetForm() {
    setForm(emptyForm(user.company_timezone));
    setSelectedEntry(null);
    setReviewEntry(null);
    setVoidReviewEntry(null);
    setVoidReason("");
    setVoidReasonError(null);
    setSubmitError(null);
    setSuccessMessage(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);
    if (!canSave) {
      setSubmitError(isEditing ? "accounting.journals.UPDATE is required to edit drafts." : "accounting.journals.CREATE is required to create drafts.");
      return;
    }
    if (formErrors.length > 0) {
      setSubmitError(formErrors[0] ?? "Journal form is invalid.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = buildPayload(user.company_id, form);
      const saved = isEditing && form.id
        ? await updateManualJournalEntry(form.id, payload)
        : await createManualJournalEntry(payload);
      setSelectedEntry(saved);
      setForm(formFromEntry(saved));
      setSuccessMessage(saved.status === "DRAFT" ? "Draft journal saved. Server validation accepted the journal." : "Journal saved.");
      await refetch();
    } catch (requestError) {
      setSubmitError(formatJournalApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePost() {
    if (!reviewEntry) return;
    setSubmitError(null);
    if (reviewBlockReason) {
      setSubmitError(reviewBlockReason);
      return;
    }
    setPostSubmitting(true);
    try {
      const posted = await postManualJournalEntry(reviewEntry.id);
      setSelectedEntry(posted);
      setReviewEntry(null);
      setVoidReviewEntry(null);
      setForm(emptyForm(user.company_timezone));
      setSuccessMessage(`Journal posted. Posted journals are now immutable in the UI. Trace: ${journalTraceSummary(posted)}.`);
      await refetch();
    } catch (requestError) {
      setSubmitError(formatJournalApiError(requestError));
    } finally {
      setPostSubmitting(false);
    }
  }

  function startVoidReview(entry: JournalEntryResponse) {
    setSubmitError(null);
    setSuccessMessage(null);
    setVoidReasonError(null);
    if (!permissions.DELETE) {
      setSubmitError("accounting.journals.DELETE is required to void posted manual journals.");
      return;
    }
    if (!isVoidEligibleJournal(entry)) {
      setSubmitError("Only posted manual journals can be voided from this screen.");
      return;
    }
    setSelectedEntry(entry);
    setReviewEntry(null);
    setVoidReviewEntry(entry);
    setVoidReason("");
    setForm(emptyForm(user.company_timezone));
  }

  async function handleVoid() {
    if (!voidReviewEntry) return;
    setSubmitError(null);
    setVoidReasonError(null);
    if (!trimmedVoidReason) {
      const message = "Void reason is required before submitting void review.";
      setVoidReasonError(message);
      setSubmitError(message);
      return;
    }
    setVoidSubmitting(true);
    try {
      const voided = await voidManualJournalEntry(voidReviewEntry.id, trimmedVoidReason);
      setSelectedEntry(voided);
      setVoidReviewEntry(null);
      setVoidReason("");
      setVoidReasonError(null);
      setForm(emptyForm(user.company_timezone));
      const messages = journalVoidResultMessages(voided);
      setSuccessMessage(messages.success);
      setSubmitError(messages.error);
      await refetch();
    } catch (requestError) {
      setSubmitError(formatJournalApiError(requestError));
    } finally {
      setVoidSubmitting(false);
    }
  }

  const reviewSections: ReviewPanelSection[] = reviewEntry ? [
    {
      id: "draft-evidence",
      title: "Draft evidence",
      description: "Backend draft fields that will be posted.",
      content: (
        <Stack gap="sm">
          <Group gap="lg" wrap="wrap">
            <DetailField label="Status before" value={reviewEntry.status} />
            <DetailField label="Reference" value={reviewEntry.reference ?? "—"} />
            <DetailField label="Entry date" value={entryDate(reviewEntry)} />
            <DetailField label="Total debits" value={formatMoney(reviewEntry.total_debits)} />
            <DetailField label="Total credits" value={formatMoney(reviewEntry.total_credits)} />
          </Group>
          <JournalLineReviewEvidence entry={reviewEntry} accounts={accounts} />
        </Stack>
      ),
    },
    {
      id: "posting-evidence",
      title: "After posting evidence",
      description: "Expected immutable state after the backend accepts POST /journals/:id/post.",
      content: (
        <Stack gap="xs">
          <Text>Status after: POSTED</Text>
          <Text>Post timestamp after: assigned by backend and displayed from posted_at after response.</Text>
          <Text>Journal lines after: unchanged debit and credit evidence from the draft.</Text>
        </Stack>
      ),
      errors: reviewEntry.status !== "DRAFT" ? ["Only draft journals can be posted."] : undefined,
    },
  ] : [];

  const voidReviewSections: ReviewPanelSection[] = voidReviewEntry ? [
    {
      id: "void-before-evidence",
      title: "Before void evidence",
      description: "Backend fields for the posted manual journal that will be voided.",
      content: (
        <Stack gap="sm">
          <Group gap="lg" wrap="wrap">
            <DetailField label="Affected journal ID" value={voidReviewEntry.id} />
            <DetailField label="Status before" value={voidReviewEntry.status} />
            <DetailField label="Doc type" value={voidReviewEntry.doc_type} />
            <DetailField label="Reference" value={voidReviewEntry.reference ?? "—"} />
            <DetailField label="Entry date" value={entryDate(voidReviewEntry)} />
            <DetailField label="Total debits" value={formatMoney(voidReviewEntry.total_debits)} />
            <DetailField label="Total credits" value={formatMoney(voidReviewEntry.total_credits)} />
          </Group>
          <JournalLineReviewEvidence entry={voidReviewEntry} accounts={accounts} />
        </Stack>
      ),
      errors: !isVoidEligibleJournal(voidReviewEntry) ? ["Only posted manual journals can be voided."] : undefined,
    },
    {
      id: "void-after-evidence",
      title: "After void evidence",
      description: "Expected backend-owned correction state after POST /journals/:id/void.",
      content: (
        <Stack gap="xs">
          <Text>Status after: VOIDED</Text>
          <Text>Affected journal ID: {voidReviewEntry.id}</Text>
          <Text>Expected reversal behavior: backend creates/assigns reversal_journal_id and returns the original journal as VOIDED.</Text>
          <Text>Original/reversal link semantics: VOIDED originals display reversal_journal_id; REVERSAL journals display original_journal_id as backend-provided text IDs only.</Text>
          <label>
            Void reason *
            <textarea
              aria-label="Void reason"
              style={{ ...inputStyle, minHeight: 84 }}
              value={voidReason}
              onChange={(event) => {
                setVoidReason(event.currentTarget.value);
                if (event.currentTarget.value.trim()) setVoidReasonError(null);
              }}
              placeholder="Explain the auditable correction reason"
            />
          </label>
          {voidReasonError ? <Alert color="red">{voidReasonError}</Alert> : null}
          <Text>Trimmed reason that will be submitted: {trimmedVoidReason || "—"}</Text>
        </Stack>
      ),
      errors: !trimmedVoidReason ? ["Void reason is required before submitting void review."] : undefined,
    },
  ] : [];

  return (
    <Stack gap="md">
      <PageCard title="Journal Entries" description="Create balanced draft journals, review posting/void evidence, and inspect immutable journals. Posted, voided, and reversal rows open as read-only detail with backend status and correction metadata visible.">
        <Stack gap="sm">
          {!isOnline ? <Alert color="yellow">Journal create, edit, and post actions require online backend validation.</Alert> : null}
          {error ? <Alert color="red">{error}</Alert> : null}
          {accountsError ? <Alert color="red">{accountsError}</Alert> : null}
          {successMessage ? <Alert color="green">{successMessage}</Alert> : null}
          {submitError ? <Alert color="red">{submitError}</Alert> : null}
          <Group align="flex-end" wrap="wrap">
            <label>From<input type="date" style={inputStyle} value={filters.start_date} onChange={(event) => setFilters((current) => ({ ...current, start_date: event.currentTarget.value }))} /></label>
            <label>To<input type="date" style={inputStyle} value={filters.end_date} onChange={(event) => setFilters((current) => ({ ...current, end_date: event.currentTarget.value }))} /></label>
            <label>Status<select style={inputStyle} value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.currentTarget.value as JournalListFilters["status"] }))}>{JOURNAL_STATUS_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label>Reference<input style={inputStyle} value={filters.reference} onChange={(event) => setFilters((current) => ({ ...current, reference: event.currentTarget.value }))} placeholder="Reference or ID" /></label>
            <Button onClick={() => void refetch()} loading={loading}>Refresh</Button>
          </Group>
          <table style={tableStyle} aria-label="Journal list">
            <thead>
              <tr style={{ backgroundColor: "#f5f1ea" }}>
                <th style={{ ...cellStyle, textAlign: "left" }}>Status</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Date</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Reference</th>
                <th style={{ ...cellStyle, textAlign: "right" }}>Total Debits</th>
                <th style={{ ...cellStyle, textAlign: "right" }}>Total Credits</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Outlet</th>
                <th style={{ ...cellStyle, textAlign: "right" }}>Lines</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Correction</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredJournals.length === 0 ? (
                <tr><td style={cellStyle} colSpan={9}>{loading ? "Loading journals..." : "No journal entries found."}</td></tr>
              ) : filteredJournals.map((entry) => (
                <tr key={`${entry.status}-${entry.id}`}>
                  <td style={cellStyle}>{entry.status}</td>
                  <td style={cellStyle}>{entryDate(entry)}</td>
                  <td style={cellStyle}>{entry.reference ?? `Journal #${entry.id}`}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>{formatMoney(entry.total_debits)}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>{formatMoney(entry.total_credits)}</td>
                  <td style={cellStyle}>{entry.outlet_id ?? "Company"}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>{entry.lines.length}</td>
                  <td style={cellStyle}>{journalCorrectionSummary(entry)}</td>
                  <td style={cellStyle}>
                    <Group gap="xs">
                      <Button size="xs" variant="light" onClick={() => {
                        setSelectedEntry(entry);
                        setReviewEntry(null);
                        setVoidReviewEntry(null);
                        setVoidReason("");
                        setVoidReasonError(null);
                        setForm(formForEntrySelection(entry, user.company_timezone));
                      }}>{entry.status === "DRAFT" ? "Edit draft" : "View detail"}</Button>
                      {isVoidEligibleJournal(entry) && permissions.DELETE ? <Button size="xs" color="red" variant="light" onClick={() => startVoidReview(entry)}>Review void</Button> : null}
                      {isVoidEligibleJournal(entry) && !permissions.DELETE ? <Text size="xs" c="dimmed">Void requires accounting.journals.DELETE.</Text> : null}
                    </Group>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Stack>
      </PageCard>

      <PageCard title={isEditing ? "Edit Draft Journal" : "Create Draft Journal"} description="Client-side balance checks block save/post while the server remains authoritative.">
        <form onSubmit={(event) => void handleSubmit(event)}>
          <Stack gap="sm">
            {!canSave ? <Alert color="yellow">{isEditing ? "Read-only access: accounting.journals.UPDATE is required to edit drafts." : "Read-only access: accounting.journals.CREATE is required to create drafts."}</Alert> : null}
            <Group grow align="flex-end">
              <label>Entry date *<input type="date" style={inputStyle} value={form.entry_date} onChange={(event) => setForm((current) => ({ ...current, entry_date: event.currentTarget.value }))} /></label>
              <label>Reference<input style={inputStyle} value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.currentTarget.value }))} placeholder="Manual reference" /></label>
              <label>Outlet<select style={inputStyle} value={form.outlet_id} onChange={(event) => setForm((current) => ({ ...current, outlet_id: event.currentTarget.value }))}><option value="">Company-level</option>{user.outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select></label>
            </Group>
            <label>Description *<input style={inputStyle} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.currentTarget.value }))} placeholder="Journal description" /></label>
            <table style={tableStyle} aria-label="Journal draft line editor">
              <thead>
                <tr style={{ backgroundColor: "#f5f1ea" }}>
                  <th style={{ ...cellStyle, textAlign: "left" }}>Account</th>
                  <th style={{ ...cellStyle, textAlign: "right" }}>Debit</th>
                  <th style={{ ...cellStyle, textAlign: "right" }}>Credit</th>
                  <th style={{ ...cellStyle, textAlign: "left" }}>Description</th>
                  <th style={{ ...cellStyle, textAlign: "left" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line) => (
                  <tr key={line.id}>
                    <td style={cellStyle}><select style={inputStyle} value={line.account_id ?? ""} onChange={(event) => updateLine(line.id, { account_id: event.currentTarget.value ? Number(event.currentTarget.value) : null })}><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}</select></td>
                    <td style={cellStyle}><input aria-label={`${line.id} debit`} type="number" min="0" step="0.01" style={{ ...inputStyle, textAlign: "right" }} value={line.debit || ""} onChange={(event) => updateLine(line.id, { debit: Number(event.currentTarget.value) || 0, credit: 0 })} /></td>
                    <td style={cellStyle}><input aria-label={`${line.id} credit`} type="number" min="0" step="0.01" style={{ ...inputStyle, textAlign: "right" }} value={line.credit || ""} onChange={(event) => updateLine(line.id, { credit: Number(event.currentTarget.value) || 0, debit: 0 })} /></td>
                    <td style={cellStyle}><input style={inputStyle} value={line.description} onChange={(event) => updateLine(line.id, { description: event.currentTarget.value })} /></td>
                    <td style={cellStyle}><Button size="xs" color="red" variant="light" disabled={form.lines.length <= 2} onClick={() => setForm((current) => ({ ...current, lines: current.lines.filter((item) => item.id !== line.id) }))}>Remove</Button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: "#f5f1ea", fontWeight: "bold" }}>
                  <td style={cellStyle}>Totals</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>{formatMoney(totals.totalDebits)}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>{formatMoney(totals.totalCredits)}</td>
                  <td style={cellStyle}>{totals.isBalanced ? "Balanced" : `Unbalanced difference ${formatMoney(totals.difference)}`}</td>
                  <td style={cellStyle}></td>
                </tr>
              </tfoot>
            </table>
            {formErrors.length > 0 ? <Alert color="yellow">{formErrors[0]}</Alert> : null}
            {reviewBlockReason ? <Alert color="yellow">{reviewBlockReason}</Alert> : null}
            <Group justify="space-between">
              <Button variant="light" onClick={() => {
                setForm((current) => ({ ...current, lines: [...current.lines, { id: `line-${lineSequence}`, account_id: null, debit: 0, credit: 0, description: "" }] }));
                setLineSequence((current) => current + 1);
              }}>Add line</Button>
              <Group>
                <Button variant="light" onClick={resetForm}>New draft</Button>
                <Button type="submit" loading={submitting} disabled={!isOnline || accountsLoading || !canSave || formErrors.length > 0}>{isEditing ? "Update draft" : "Create draft"}</Button>
                <Button color="green" disabled={!editableSelectedEntry || !permissions.UPDATE || formErrors.length > 0 || Boolean(reviewBlockReason)} onClick={() => {
                  if (!editableSelectedEntry || reviewBlockReason) return;
                  setReviewEntry(editableSelectedEntry);
                  setVoidReviewEntry(null);
                  setVoidReason("");
                  setVoidReasonError(null);
                }}>Review and post draft</Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </PageCard>

      {selectedEntry ? (
        <PageCard title="Journal Detail" description={selectedEntry.status === "DRAFT" ? "Draft journal detail can be edited until posted." : "Finalized journal detail is read-only. Void and reversal records are auditable correction flow evidence, not mutation controls."}>
          <Stack gap="sm">
            {selectedEntry.status !== "DRAFT" ? <Alert color="blue">Finalized journal is immutable in the UI. Status {selectedEntry.status}; posted at {formatDateTime(selectedEntry.posted_at)}.</Alert> : null}
            {isVoidEligibleJournal(selectedEntry) && !permissions.DELETE ? <Alert color="yellow">Read-only access: accounting.journals.DELETE is required to void posted manual journals.</Alert> : null}
            <Group gap="lg" wrap="wrap">
              <DetailField label="Status" value={selectedEntry.status} />
              <DetailField label="Doc type" value={selectedEntry.doc_type} />
              <DetailField label="Reference" value={selectedEntry.reference ?? "—"} />
              <DetailField label="Entry date" value={entryDate(selectedEntry)} />
              <DetailField label="Posted at" value={formatDateTime(selectedEntry.posted_at)} />
              <DetailField label="Outlet" value={selectedEntry.outlet_id ?? "Company"} />
              {selectedEntry.status === "VOIDED" ? <DetailField label="Void reason" value={selectedEntry.void_reason ?? "—"} /> : null}
              {selectedEntry.status === "VOIDED" ? <DetailField label="Voided at" value={formatDateTime(selectedEntry.voided_at)} /> : null}
              {selectedEntry.status === "VOIDED" && selectedEntry.voided_by_user_id ? <DetailField label="Voided by user ID" value={selectedEntry.voided_by_user_id} /> : null}
              {selectedEntry.status === "VOIDED" ? <DetailField label="Reversal journal ID" value={selectedEntry.reversal_journal_id ?? "—"} /> : null}
              {selectedEntry.status === "REVERSAL" ? <DetailField label="Original journal ID" value={selectedEntry.original_journal_id ?? "—"} /> : null}
            </Group>
            {isVoidEligibleJournal(selectedEntry) && permissions.DELETE ? <Button color="red" variant="light" onClick={() => startVoidReview(selectedEntry)}>Review void correction</Button> : null}
            <JournalLinesTable entry={selectedEntry} accounts={accounts} />
          </Stack>
        </PageCard>
      ) : null}

      {reviewEntry ? (
        <PageCard title="Post Review">
          <ReviewPanel
            title="Post journal draft"
            description="Review material before/after evidence before calling the backend post endpoint. Backend fields only are displayed; no audit or journal links are fabricated."
            sections={reviewSections}
            summaryItems={[
              { label: "Draft ID", value: reviewEntry.id },
              { label: "Reference", value: reviewEntry.reference ?? "—" },
              { label: "Total debits", value: formatMoney(reviewEntry.total_debits) },
              { label: "Total credits", value: formatMoney(reviewEntry.total_credits) },
            ]}
            scopeBadges={[{ label: "Resource", value: "accounting.journals" }, { label: "Action", value: "UPDATE/post" }]}
            diffChanges={buildJournalPostDiffChanges(reviewEntry)}
            saveLabel="Confirm and post journal"
            saveDisabled={!permissions.UPDATE || postSubmitting || Boolean(reviewBlockReason)}
            submitting={postSubmitting}
            onDiscardDraft={() => setReviewEntry(null)}
            onSubmit={() => void handlePost()}
          />
        </PageCard>
      ) : null}

      {voidReviewEntry ? (
        <PageCard title="Void Review">
          <ReviewPanel
            title="Void posted manual journal"
            description="Review before/after void evidence before calling the backend void endpoint. Backend fields only are displayed; no audit or journal links are fabricated. Void creates an auditable correction flow, not mutation controls."
            sections={voidReviewSections}
            summaryItems={[
              { label: "Affected journal ID", value: voidReviewEntry.id },
              { label: "Reference", value: voidReviewEntry.reference ?? "—" },
              { label: "Total debits", value: formatMoney(voidReviewEntry.total_debits) },
              { label: "Total credits", value: formatMoney(voidReviewEntry.total_credits) },
              { label: "Void reason", value: trimmedVoidReason || "—" },
            ]}
            scopeBadges={[{ label: "Resource", value: "accounting.journals" }, { label: "Action", value: "DELETE/void" }]}
            diffChanges={buildJournalVoidDiffChanges(voidReviewEntry, trimmedVoidReason)}
            saveLabel="Confirm and void journal"
            saveDisabled={!permissions.DELETE || voidSubmitting || !trimmedVoidReason}
            submitting={voidSubmitting}
            onDiscardDraft={() => {
              setVoidReviewEntry(null);
              setVoidReason("");
              setVoidReasonError(null);
            }}
            onSubmit={() => void handleVoid()}
          />
        </PageCard>
      ) : null}
    </Stack>
  );
}
