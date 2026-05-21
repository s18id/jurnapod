// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Modal,
  Table,
  Loader,
  ScrollArea
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { IconCalendar, IconAlertCircle, IconCheck } from "@tabler/icons-react";

import { OfflinePage } from "../components/offline-page";
import { ReviewPanel } from "../components/ReviewPanel/ReviewPanel";
import { apiRequest, ApiError } from "../lib/api-client";
import { actionGates, resolveEffectivePermissions } from "../lib/auth/permissions";
import { useOnlineStatus } from "../lib/connection";
import type { SessionUser } from "../lib/session";

type FiscalYearsPageProps = {
  user: SessionUser;
};

// =============================================================================
// Types
// =============================================================================

export type FiscalYearRow = {
  id?: number;
  code: string;
  name: string;
  start_date: string;
  end_date: string;
  status: "OPEN" | "CLOSED";
  isNew?: boolean;
  temp_key?: string;
  // Close workflow info (populated from status endpoint)
  close_info?: {
    close_request_id?: string;
    close_request_status?: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED";
    initiated_by?: number;
    initiated_at?: number;
    approved_by?: number;
    approved_at?: number;
    net_income?: number;
    total_income?: number;
    total_expenses?: number;
    closing_entries_count?: number;
  };
};

type FiscalYearsResponse = {
  success: true;
  data: FiscalYearRow[];
};

type FiscalYearResponse = {
  success: true;
  data: FiscalYearRow;
};

// Close preview response from GET /accounts/fiscal-years/:id/close-preview
export type ClosePreviewResponse = {
  success: true;
  data: {
    fiscalYearId: number;
    fiscalYearCode: string;
    fiscalYearName: string;
    startDate: string;
    endDate: string;
    totalIncome: number;
    totalExpenses: number;
    netIncome: number;
    retainedEarningsAccountId: number;
    retainedEarningsAccountCode: string;
    closingEntries: Array<{
      accountId: number;
      accountCode: string;
      accountName: string;
      debit: number;
      credit: number;
      description: string;
    }>;
    entryDate: string;
    description: string;
    /** Whether the fiscal year can be closed (derived from preconditions) */
    can_close?: boolean;
    /** List of blocker messages if can_close is false */
    blockers?: string[];
  };
};

// Close initiate response from POST /accounts/fiscal-years/:id/close
export type CloseInitiateResponse = {
  success: true;
  warnings?: WarningPayload[];
  data: {
    success: boolean;
    fiscalYearId: number;
    closeRequestId: string;
    status: string;
    previousStatus?: string;
    newStatus?: string;
    reason?: string | null;
    message: string;
    canApprove: boolean;
    netIncome: number;
    totalIncome: number;
    totalExpenses: number;
    closingEntriesCount: number;
  };
};

// Close approve response from POST /accounts/fiscal-years/:id/close/approve
export type CloseApproveResponse = {
  success: true;
  warnings?: WarningPayload[];
  data: {
    success: boolean;
    fiscalYearId: number;
    closeRequestId: string;
    status: string;
    previousStatus: string;
    newStatus: string;
    reason?: string | null;
    postedBatchIds: number[];
    netIncome: number;
    totalIncome: number;
    totalExpenses: number;
    hasImbalance: boolean;
    snapshotWarning?: WarningPayload;
  };
};

type WarningPayload = {
  code: string;
  reason: string;
  message: string;
  blocking: false;
};

// Fiscal year status response from GET /accounts/fiscal-years/:id/status
type FiscalYearStatusResponse = {
  success: true;
  data: {
    fiscalYearId: number;
    fiscalYearCode: string;
    fiscalYearName: string;
    status: "OPEN" | "CLOSED";
    startDate: string;
    endDate: string;
    periods: Array<{
      periodId: number | null;
      periodCode: string | null;
      startDate: string;
      endDate: string;
      status: "OPEN" | "ADJUSTED" | "CLOSED";
      hasTransactions: boolean;
    }>;
    closeRequestId: string | null;
    closeRequestStatus: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | null;
    canClose: boolean;
    cannotCloseReason: string | null;
  };
};

// =============================================================================
// Constants
// =============================================================================

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "CLOSED", label: "Closed" },
  { value: "PENDING_CLOSE", label: "Pending Close" }
] as const;

const STATUS_FILTER_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "PENDING_CLOSE", label: "Pending Close" },
  { value: "CLOSED", label: "Closed" }
] as const;

type StatusFilterValue = (typeof STATUS_FILTER_OPTIONS)[number]["value"];

const CLOSE_REASON_MAX_LENGTH = 500;
const CLOSE_REASON_REQUIRED_MESSAGE = "Close reason is required and must include at least one non-space character.";
const CLOSE_REASON_MAX_LENGTH_MESSAGE = "Close reason must be 500 characters or fewer.";

// =============================================================================
// Helpers
// =============================================================================

function createTempKey(): string {
  return `fy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildNewRow(): FiscalYearRow {
  return {
    temp_key: createTempKey(),
    code: "",
    name: "",
    start_date: "",
    end_date: "",
    status: "OPEN",
    isNew: true
  };
}

function getRowKey(row: FiscalYearRow): string {
  if (row.id !== undefined) {
    return String(row.id);
  }
  if (row.temp_key) {
    return row.temp_key;
  }
  throw new Error("FiscalYearRow missing id or temp_key for unsaved row");
}

function isDraftDirty(original: FiscalYearRow, draft: FiscalYearRow): boolean {
  return (
    original.code.trim() !== draft.code.trim() ||
    original.name.trim() !== draft.name.trim() ||
    original.start_date.trim() !== draft.start_date.trim() ||
    original.end_date.trim() !== draft.end_date.trim() ||
    original.status !== draft.status
  );
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function getEffectiveStatus(row: FiscalYearRow): "OPEN" | "PENDING_CLOSE" | "CLOSED" {
  if (row.status === "CLOSED") return "CLOSED";
  if (row.close_info?.close_request_status === "PENDING" ||
      row.close_info?.close_request_status === "IN_PROGRESS") {
    return "PENDING_CLOSE";
  }
  return "OPEN";
}

function getStatusBadgeColor(status: "OPEN" | "PENDING_CLOSE" | "CLOSED"): string {
  switch (status) {
    case "OPEN":
      return "blue";
    case "PENDING_CLOSE":
      return "yellow";
    case "CLOSED":
      return "gray";
    default:
      return "gray";
  }
}

function getStatusLabel(status: "OPEN" | "PENDING_CLOSE" | "CLOSED"): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "PENDING_CLOSE":
      return "Pending Close";
    case "CLOSED":
      return "Closed";
    default:
      return status;
  }
}

export type FiscalYearPermissionGates = Record<"READ" | "CREATE" | "UPDATE" | "MANAGE", boolean>;

export type FiscalCloseReasonValidation = {
  value: string | null;
  error: string | null;
  characterCount: number;
};

export type FiscalCloseEvidenceItem = {
  label: string;
  value: string;
};

export type FiscalCloseInitiationEvidence = {
  scope: FiscalCloseEvidenceItem[];
  reason: string;
  financialEffects: FiscalCloseEvidenceItem[];
  closingEntryCount: number;
  closingEntries: FiscalCloseEvidenceItem[];
  generatedEntryExpectation: string;
  warnings: string[];
};

export type FiscalCloseApprovalResultEvidence = {
  closeRequestId: string;
  statusTransition: string;
  postedBatchIds: string[];
  totals: FiscalCloseEvidenceItem[];
  reasonLabel: string;
  reason: string;
  warnings: string[];
};

/**
 * Resolve fiscal-year action gates from canonical resource-level permissions.
 * Backend authorization remains authoritative; this helper only controls UX affordances.
 */
export function resolveFiscalYearPermissionGates(user: SessionUser): FiscalYearPermissionGates {
  const gates = actionGates(
    resolveEffectivePermissions(user) ?? [],
    "accounting",
    "fiscal_years",
    ["READ", "CREATE", "UPDATE", "MANAGE"]
  );

  return {
    READ: gates.READ,
    CREATE: gates.CREATE,
    UPDATE: gates.UPDATE,
    MANAGE: gates.MANAGE
  };
}

export function validateFiscalCloseReason(reason: string): FiscalCloseReasonValidation {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return { value: null, error: CLOSE_REASON_REQUIRED_MESSAGE, characterCount: trimmed.length };
  }
  if (trimmed.length > CLOSE_REASON_MAX_LENGTH) {
    return { value: null, error: CLOSE_REASON_MAX_LENGTH_MESSAGE, characterCount: trimmed.length };
  }
  return { value: trimmed, error: null, characterCount: trimmed.length };
}

export function buildFiscalCloseInitiationEvidence(params: {
  fiscalYear: FiscalYearRow;
  preview: ClosePreviewResponse["data"];
  reason: string;
}): FiscalCloseInitiationEvidence {
  const validatedReason = validateFiscalCloseReason(params.reason);
  const reason = validatedReason.value ?? params.reason.trim();

  return {
    scope: [
      { label: "Fiscal year", value: `${params.preview.fiscalYearCode} — ${params.preview.fiscalYearName}` },
      { label: "Period", value: `${params.preview.startDate} → ${params.preview.endDate}` },
      { label: "Current status", value: getEffectiveStatus(params.fiscalYear) }
    ],
    reason,
    financialEffects: [
      { label: "Total revenue", value: formatCurrency(params.preview.totalIncome) },
      { label: "Total expenses", value: formatCurrency(params.preview.totalExpenses) },
      { label: "Net income", value: formatCurrency(params.preview.netIncome) },
      { label: "Retained earnings account", value: params.preview.retainedEarningsAccountCode }
    ],
    closingEntryCount: params.preview.closingEntries.length,
    closingEntries: params.preview.closingEntries.map((entry) => ({
      label: `${entry.accountCode} — ${entry.accountName}`,
      value: `${entry.description}; debit ${formatCurrency(entry.debit)}; credit ${formatCurrency(entry.credit)}`
    })),
    generatedEntryExpectation: "Initiation creates a close request only. Approval posts backend-assigned journal batch IDs; the UI displays returned IDs as text evidence.",
    warnings: params.preview.blockers ?? []
  };
}

export function resolveFiscalCloseRequestId(
  fiscalYear: FiscalYearRow | null,
  initiateResult: CloseInitiateResponse["data"] | null
): string | null {
  return initiateResult?.closeRequestId ?? fiscalYear?.close_info?.close_request_id ?? null;
}

export function buildFiscalCloseApprovalResultEvidence(params: {
  result: CloseApproveResponse["data"];
  submittedReason: string | null;
  warnings?: WarningPayload[];
}): FiscalCloseApprovalResultEvidence {
  const backendReason = typeof params.result.reason === "string" && params.result.reason.trim().length > 0
    ? params.result.reason.trim()
    : null;
  const submittedReason = params.submittedReason?.trim() || null;
  const warnings = [
    ...(params.warnings ?? []).map((warning) => `${warning.code}: ${warning.message}`),
    ...(params.result.snapshotWarning ? [`${params.result.snapshotWarning.code}: ${params.result.snapshotWarning.message}`] : [])
  ];

  return {
    closeRequestId: params.result.closeRequestId,
    statusTransition: `${params.result.previousStatus} → ${params.result.newStatus}`,
    postedBatchIds: params.result.postedBatchIds.map((id) => String(id)),
    totals: [
      { label: "Total revenue", value: formatCurrency(params.result.totalIncome) },
      { label: "Total expenses", value: formatCurrency(params.result.totalExpenses) },
      { label: "Net income", value: formatCurrency(params.result.netIncome) }
    ],
    reasonLabel: backendReason ? "Backend reason" : submittedReason ? "Submitted reason" : "Reason",
    reason: backendReason ?? submittedReason ?? "Not returned by backend",
    warnings
  };
}

export function formatFiscalCloseApiError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "INVALID_REQUEST":
        return "INVALID_REQUEST: Fiscal year close reason is required and must be 500 characters or fewer.";
      case "FISCAL_YEAR_ALREADY_CLOSED":
      case "FISCAL_YEAR_CLOSED":
        return `${error.code}: This fiscal year is already closed. Refresh fiscal years before retrying.`;
      case "CLOSE_CONFLICT":
        return "CLOSE_CONFLICT: A fiscal close request already exists or changed on the server. Refresh fiscal years before retrying.";
      case "CLOSE_PRECONDITION_FAILED":
        return "CLOSE_PRECONDITION_FAILED: Fiscal year close is blocked by backend preconditions.";
      case "RETAINED_EARNINGS_NOT_FOUND":
        return "RETAINED_EARNINGS_NOT_FOUND: Configure the retained earnings account before closing this fiscal year.";
      case "ENTRIES_NOT_BALANCED":
        return "ENTRIES_NOT_BALANCED: Backend rejected the closing entries because debits and credits do not balance.";
      default:
        return `${error.code}: ${error.message}`;
    }
  }

  return "Failed to complete fiscal close workflow";
}

// =============================================================================
// Main Component
// =============================================================================

export function FiscalYearsPage({ user }: FiscalYearsPageProps) {
  const isOnline = useOnlineStatus();
  const [fiscalYears, setFiscalYears] = useState<FiscalYearRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Status filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("ALL");

  // Editing state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<FiscalYearRow | null>(null);

  // Close workflow modals
  const [previewModalOpen, { open: openPreviewModal, close: closePreviewModal }] = useDisclosure(false);
  const [approveModalOpen, { open: openApproveModal, close: closeApproveModal }] = useDisclosure(false);

  // Close workflow state
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYearRow | null>(null);
  const [closePreview, setClosePreview] = useState<ClosePreviewResponse["data"] | null>(null);
  const [closeInitiateResult, setCloseInitiateResult] = useState<CloseInitiateResponse["data"] | null>(null);
  const [closeApproveResult, setCloseApproveResult] = useState<CloseApproveResponse["data"] | null>(null);
  const [closeApproveWarnings, setCloseApproveWarnings] = useState<WarningPayload[]>([]);
  const [closeReason, setCloseReason] = useState("");
  const [closeSubmittedReason, setCloseSubmittedReason] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingInitiate, setLoadingInitiate] = useState(false);
  const [loadingApprove, setLoadingApprove] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSuccessMsg, setCloseSuccessMsg] = useState<string | null>(null);

  const isSaving = savingKey !== null;
  const currentEditingRow = editingKey
    ? fiscalYears.find((r) => getRowKey(r) === editingKey) ?? null
    : null;
  const isCurrentDraftDirty =
    currentEditingRow !== null && editDraft !== null && isDraftDirty(currentEditingRow, editDraft);
  const shouldDiscardCurrentEdit =
    currentEditingRow?.isNew === true || isCurrentDraftDirty;

  const fiscalYearPermissions = useMemo(() => resolveFiscalYearPermissionGates(user), [user]);
  const canManage = fiscalYearPermissions.MANAGE;
  const closeReasonValidation = validateFiscalCloseReason(closeReason);
  const closeRequestId = resolveFiscalCloseRequestId(selectedFiscalYear, closeInitiateResult);
  const closeInitiationEvidence = selectedFiscalYear && closePreview
    ? buildFiscalCloseInitiationEvidence({ fiscalYear: selectedFiscalYear, preview: closePreview, reason: closeReason })
    : null;
  const closeApprovalEvidence = selectedFiscalYear
    ? {
        scope: [
          { label: "Fiscal year", value: `${selectedFiscalYear.code} — ${selectedFiscalYear.name}` },
          { label: "Period", value: `${selectedFiscalYear.start_date} → ${selectedFiscalYear.end_date}` },
          { label: "Current status", value: getEffectiveStatus(selectedFiscalYear) },
          { label: "Close request ID", value: closeRequestId ?? "Missing" }
        ],
        totals: closeInitiateResult
          ? [
              { label: "Total revenue", value: formatCurrency(closeInitiateResult.totalIncome) },
              { label: "Total expenses", value: formatCurrency(closeInitiateResult.totalExpenses) },
              { label: "Net income", value: formatCurrency(closeInitiateResult.netIncome) },
              { label: "Closing entries", value: String(closeInitiateResult.closingEntriesCount) }
            ]
          : [],
        reason: closeSubmittedReason ?? closeInitiateResult?.reason ?? null
      }
    : null;
  const closeApprovalResultEvidence = closeApproveResult
    ? buildFiscalCloseApprovalResultEvidence({
        result: closeApproveResult,
        submittedReason: closeSubmittedReason,
        warnings: closeApproveWarnings
      })
    : null;

  // Fetch close request status for all fiscal years
  async function fetchCloseRequestStatuses(fiscalYearsList: FiscalYearRow[]) {
    const yearsWithIds = fiscalYearsList.filter((fy) => fy.id !== undefined && fy.status === "OPEN");
    if (yearsWithIds.length === 0) return;

    const updatedYears = await Promise.all(
      fiscalYearsList.map(async (fy) => {
        if (fy.id === undefined || fy.status !== "OPEN") return fy;
        try {
          const statusResp = await apiRequest<FiscalYearStatusResponse>(
            `/accounts/fiscal-years/${fy.id}/status`,
            {}
          );
          if (statusResp.data.closeRequestId && statusResp.data.closeRequestStatus) {
            return {
              ...fy,
              close_info: {
                close_request_id: statusResp.data.closeRequestId,
                close_request_status: statusResp.data.closeRequestStatus,
                initiated_by: undefined,
                initiated_at: undefined,
                approved_by: undefined,
                approved_at: undefined
              }
            };
          }
          return fy;
        } catch {
          return fy;
        }
      })
    );

    setFiscalYears(updatedYears);
  }

  useEffect(() => {
    async function fetchFiscalYears() {
      setLoading(true);
      setError(null);
      try {
        const response = await apiRequest<FiscalYearsResponse>(
          `/accounts/fiscal-years?company_id=${user.company_id}&include_closed=1`,
          {}
        );
        setFiscalYears(response.data);

        // Fetch close request statuses for OPEN years
        await fetchCloseRequestStatuses(response.data);
      } catch (fetchError) {
        if (fetchError instanceof ApiError) {
          setError(fetchError.message);
        } else {
          setError("Failed to load fiscal years");
        }
      } finally {
        setLoading(false);
      }
    }

    fetchFiscalYears().catch(() => setError("Failed to load fiscal years"));
  }, [user.company_id]);

  const sortedYears = useMemo(() => {
    const statusOrder: Record<string, number> = {
      "OPEN": 0,
      "PENDING_CLOSE": 1,
      "CLOSED": 2
    };

    return [...fiscalYears].sort((a, b) => {
      const statusA = getEffectiveStatus(a);
      const statusB = getEffectiveStatus(b);
      const statusCompare = statusOrder[statusA] - statusOrder[statusB];
      if (statusCompare !== 0) return statusCompare;

      if (a.start_date && b.start_date) {
        return b.start_date.localeCompare(a.start_date);
      }
      if (a.id !== undefined && b.id !== undefined) {
        return b.id - a.id;
      }
      if (a.id !== undefined) return -1;
      if (b.id !== undefined) return 1;
      return (a.temp_key ?? "").localeCompare(b.temp_key ?? "");
    });
  }, [fiscalYears]);

  const filteredYears = useMemo(() => {
    if (statusFilter === "ALL") return sortedYears;
    return sortedYears.filter((fy) => getEffectiveStatus(fy) === statusFilter);
  }, [sortedYears, statusFilter]);

  function discardCurrentUnsavedRowIfAny(): void {
    if (!editingKey) return;

    const currentRow = fiscalYears.find((r) => getRowKey(r) === editingKey);
    if (currentRow && currentRow.isNew) {
      setFiscalYears((prev) => prev.filter((row) => getRowKey(row) !== editingKey));
    }
  }

  function confirmDiscardIfNeeded(): boolean {
    if (!editingKey || !editDraft) return true;
    if (!shouldDiscardCurrentEdit) return true;

    const isNewRow = currentEditingRow?.isNew === true;
    const message = isNewRow
      ? "You have an unsaved fiscal year. Discard it and continue?"
      : "You have unsaved changes. Discard and continue?";

    const confirmed = window.confirm(message);
    if (!confirmed) return false;

    discardCurrentUnsavedRowIfAny();
    return true;
  }

  function startEdit(row: FiscalYearRow) {
    if (isSaving) return;

    const key = getRowKey(row);

    if (editingKey === key) {
      return;
    }

    if (!confirmDiscardIfNeeded()) return;

    setEditingKey(key);
    setEditDraft({ ...row });
    setSaveError(null);
    setSaveSuccess(null);
  }

  function cancelEdit() {
    if (editingKey && editDraft?.isNew) {
      setFiscalYears((prev) => prev.filter((row) => getRowKey(row) !== editingKey));
    }
    setEditingKey(null);
    setEditDraft(null);
    setSaveError(null);
    setSaveSuccess(null);
  }

  function updateDraft(patch: Partial<FiscalYearRow>) {
    if (!editDraft) return;
    setEditDraft({ ...editDraft, ...patch });
  }

  async function handleSaveActiveRow(rowKey: string) {
    setSaveError(null);
    setSaveSuccess(null);
    const draft = editDraft;
    if (!draft) {
      return;
    }

    const rowIndex = fiscalYears.findIndex((r) => getRowKey(r) === rowKey);
    if (rowIndex === -1) {
      setSaveError("Record not found");
      return;
    }

    if (!draft.code.trim() || !draft.name.trim()) {
      setSaveError("Code and name are required.");
      return;
    }

    if (!draft.start_date.trim() || !draft.end_date.trim()) {
      setSaveError("Start date and end date are required.");
      return;
    }

    setSavingKey(rowKey);
    try {
      if (draft.isNew || !draft.id) {
        const response = await apiRequest<FiscalYearResponse>(
          "/accounts/fiscal-years",
          {
            method: "POST",
            body: JSON.stringify({
              company_id: user.company_id,
              code: draft.code.trim(),
              name: draft.name.trim(),
              start_date: draft.start_date.trim(),
              end_date: draft.end_date.trim(),
              status: draft.status
            })
          }
        );
        setFiscalYears((prev) =>
          prev.map((r, idx) => (idx === rowIndex ? { ...response.data, isNew: false } : r))
        );
        setEditingKey(null);
        setEditDraft(null);
        setSaveSuccess("Fiscal year created.");
      } else {
        const response = await apiRequest<FiscalYearResponse>(
          `/accounts/fiscal-years/${draft.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              code: draft.code.trim(),
              name: draft.name.trim(),
              start_date: draft.start_date.trim(),
              end_date: draft.end_date.trim(),
              status: draft.status
            })
          }
        );
        setFiscalYears((prev) =>
          prev.map((r, idx) => (idx === rowIndex ? response.data : r))
        );
        setEditingKey(null);
        setEditDraft(null);
        setSaveSuccess("Fiscal year updated.");
      }
    } catch (saveErr) {
      if (saveErr instanceof ApiError) {
        setSaveError(saveErr.message);
      } else {
        setSaveError("Failed to save fiscal year");
      }
    } finally {
      setSavingKey(null);
    }
  }

  function handleAdd() {
    if (isSaving) return;

    if (!confirmDiscardIfNeeded()) return;

    setSaveError(null);
    setSaveSuccess(null);
    const newRow = buildNewRow();
    const newKey = getRowKey(newRow);
    setFiscalYears((prev) => [newRow, ...prev]);
    setEditingKey(newKey);
    setEditDraft({ ...newRow });
  }

  // =============================================================================
  // Close Workflow Handlers
  // =============================================================================

  async function handleCloseYearClick(fiscalYear: FiscalYearRow) {
    if (!fiscalYear.id) return;

    setSelectedFiscalYear(fiscalYear);
    setClosePreview(null);
    setCloseInitiateResult(null);
    setCloseApproveResult(null);
    setCloseApproveWarnings([]);
    setCloseReason("");
    setCloseSubmittedReason(null);
    setCloseError(null);
    setCloseSuccessMsg(null);
    setLoadingPreview(true);
    openPreviewModal(); // Open modal immediately so error is visible to user

    try {
      const response = await apiRequest<ClosePreviewResponse>(
        `/accounts/fiscal-years/${fiscalYear.id}/close-preview`,
        {}
      );
      setClosePreview(response.data);
    } catch (err) {
      setCloseError(formatFiscalCloseApiError(err));
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleInitiateClose() {
    if (!selectedFiscalYear?.id) return;
    const validatedReason = validateFiscalCloseReason(closeReason);
    if (validatedReason.error || !validatedReason.value) {
      setCloseError(validatedReason.error ?? CLOSE_REASON_REQUIRED_MESSAGE);
      return;
    }

    setLoadingInitiate(true);
    setCloseError(null);
    setCloseSubmittedReason(validatedReason.value);

    try {
      const response = await apiRequest<CloseInitiateResponse>(
        `/accounts/fiscal-years/${selectedFiscalYear.id}/close`,
        {
          method: "POST",
          body: JSON.stringify({ reason: validatedReason.value })
        }
      );
      setCloseInitiateResult(response.data);
      setCloseSubmittedReason(response.data.reason ?? validatedReason.value);

      const initiatedFiscalYear: FiscalYearRow = {
        ...selectedFiscalYear,
        close_info: {
          ...selectedFiscalYear.close_info,
          close_request_id: response.data.closeRequestId,
          close_request_status: response.data.status as NonNullable<FiscalYearRow["close_info"]>["close_request_status"],
          net_income: response.data.netIncome,
          total_income: response.data.totalIncome,
          total_expenses: response.data.totalExpenses,
          closing_entries_count: response.data.closingEntriesCount
        }
      };
      setSelectedFiscalYear(initiatedFiscalYear);
      setFiscalYears((prev) => prev.map((fy) => fy.id === initiatedFiscalYear.id ? initiatedFiscalYear : fy));

      if (response.data.success) {
        setCloseSuccessMsg("Fiscal year has already been closed previously.");
      } else {
        setCloseSuccessMsg(`Close initiated. Close request ID ${response.data.closeRequestId} is ready for approval.`);
      }

      // Refresh the fiscal years list to update close_info
      const fyResponse = await apiRequest<FiscalYearsResponse>(
        `/accounts/fiscal-years?company_id=${user.company_id}&include_closed=1`,
        {}
      );
      setFiscalYears(fyResponse.data);
      await fetchCloseRequestStatuses(fyResponse.data);

    } catch (err) {
      setCloseError(formatFiscalCloseApiError(err));
    } finally {
      setLoadingInitiate(false);
    }
  }

  async function handleApproveCloseClick(fiscalYear: FiscalYearRow) {
    if (!fiscalYear.id || !fiscalYear.close_info?.close_request_id) return;

    setSelectedFiscalYear(fiscalYear);
    setCloseInitiateResult((current) => current?.fiscalYearId === fiscalYear.id ? current : null);
    setCloseApproveResult(null);
    setCloseApproveWarnings([]);
    setCloseSubmittedReason((current) => current);
    setCloseError(null);
    setCloseSuccessMsg(null);
    openApproveModal();
  }

  function handleProceedToApproveFromInitiate() {
    if (!selectedFiscalYear?.id || !closeInitiateResult?.closeRequestId) return;
    closePreviewModal();
    openApproveModal();
  }

  async function handleConfirmApproveClose() {
    if (!selectedFiscalYear?.id) return;
    const resolvedCloseRequestId = resolveFiscalCloseRequestId(selectedFiscalYear, closeInitiateResult);
    if (!resolvedCloseRequestId) {
      setCloseError("CLOSE_REQUEST_ID_MISSING: Refresh fiscal years before approving this close.");
      return;
    }

    setLoadingApprove(true);
    setCloseError(null);

    try {
      const response = await apiRequest<CloseApproveResponse>(
        `/accounts/fiscal-years/${selectedFiscalYear.id}/close/approve`,
        {
          method: "POST",
          body: JSON.stringify({
            close_request_id: resolvedCloseRequestId
          })
        }
      );

      setCloseApproveResult(response.data);
      setCloseApproveWarnings(response.warnings ?? []);
      setCloseSubmittedReason(response.data.reason ?? closeSubmittedReason);
      setCloseSuccessMsg(
        `Fiscal year has been closed successfully. Posted journal batch IDs: ${response.data.postedBatchIds.length > 0 ? response.data.postedBatchIds.join(", ") : "none returned"}.`
      );
      closeApproveModal();

      // Refresh the fiscal years list
      const fyResponse = await apiRequest<FiscalYearsResponse>(
        `/accounts/fiscal-years?company_id=${user.company_id}&include_closed=1`,
        {}
      );
      setFiscalYears(fyResponse.data);
      await fetchCloseRequestStatuses(fyResponse.data);

    } catch (err) {
      setCloseError(formatFiscalCloseApiError(err));
    } finally {
      setLoadingApprove(false);
    }
  }

  function handlePreviewModalClose() {
    closePreviewModal();
    setSelectedFiscalYear(null);
    setClosePreview(null);
    setCloseInitiateResult(null);
    setCloseReason("");
    setCloseError(null);
  }

  function handleApproveModalClose() {
    closeApproveModal();
    setSelectedFiscalYear(null);
    setCloseError(null);
  }

  // =============================================================================
  // Render
  // =============================================================================

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Fiscal Years"
        message="Fiscal year changes require a connection."
      />
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <div>
          <Title order={2}>Fiscal Years</Title>
          <Text c="dimmed" size="sm">
            Define fiscal year ranges used for posting and report defaults.
          </Text>
        </div>

        <Group justify="space-between" wrap="wrap">
          <Group gap="sm">
            <Button onClick={handleAdd} variant="light" disabled={isSaving}>
              Add Fiscal Year
            </Button>
            {canManage && (
              <Select
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilterValue)}
                data={STATUS_FILTER_OPTIONS}
                size="sm"
                w={150}
              />
            )}
          </Group>
          {loading ? (
            <Text size="sm" c="dimmed">
              Loading fiscal years...
            </Text>
          ) : null}
        </Group>

        {error ? (
          <Alert color="red" title="Unable to load">
            {error}
          </Alert>
        ) : null}

        {saveError ? (
          <Alert color="red" title="Save failed">
            {saveError}
          </Alert>
        ) : null}

        {saveSuccess ? (
          <Alert color="green" title="Saved">
            {saveSuccess}
          </Alert>
        ) : null}

        {closeSuccessMsg ? (
          <Alert color="green" title="Fiscal close workflow">
            {closeSuccessMsg}
          </Alert>
        ) : null}

        {closeApprovalResultEvidence ? (
          <Card withBorder>
            <Stack gap="xs">
              <Text fw={600}>Fiscal Close Result Evidence</Text>
              <Group gap="xl" wrap="wrap">
                <div>
                  <Text size="xs" c="dimmed">Close request ID</Text>
                  <Text size="sm">{closeApprovalResultEvidence.closeRequestId}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Status transition</Text>
                  <Text size="sm">{closeApprovalResultEvidence.statusTransition}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Posted journal batch IDs</Text>
                  <Text size="sm">
                    {closeApprovalResultEvidence.postedBatchIds.length > 0
                      ? closeApprovalResultEvidence.postedBatchIds.join(", ")
                      : "None returned"}
                  </Text>
                </div>
              </Group>
              <Group gap="xl" wrap="wrap">
                {closeApprovalResultEvidence.totals.map((item) => (
                  <div key={item.label}>
                    <Text size="xs" c="dimmed">{item.label}</Text>
                    <Text size="sm">{item.value}</Text>
                  </div>
                ))}
              </Group>
              <div>
                <Text size="xs" c="dimmed">{closeApprovalResultEvidence.reasonLabel}</Text>
                <Text size="sm">{closeApprovalResultEvidence.reason}</Text>
              </div>
              {closeApprovalResultEvidence.warnings.length > 0 ? (
                <Alert color="yellow" title="Close warnings">
                  <Stack gap={4}>
                    {closeApprovalResultEvidence.warnings.map((warning) => (
                      <Text key={warning} size="sm">{warning}</Text>
                    ))}
                  </Stack>
                </Alert>
              ) : null}
            </Stack>
          </Card>
        ) : null}

        {filteredYears.map((row) => {
          const key = getRowKey(row);
          const isEditing = editingKey === key;
          const saving = savingKey === key;
          const draft = isEditing ? editDraft : row;
          const effectiveStatus = getEffectiveStatus(row);

          if (!draft) return null;

          return (
            <Card key={key} withBorder>
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  {isEditing ? (
                    <Text fw={600}>{draft.isNew ? "New fiscal year" : "Edit fiscal year"}</Text>
                  ) : (
                    <Text fw={600}>{draft.name || "New fiscal year"}</Text>
                  )}
                  <Badge color={getStatusBadgeColor(effectiveStatus)} variant="light">
                    {getStatusLabel(effectiveStatus)}
                  </Badge>
                </Group>

                {isEditing ? (
                  <>
                    <Group grow align="flex-end" wrap="wrap">
                      <TextInput
                        label="Code"
                        placeholder="FY2026"
                        value={draft.code}
                        onChange={(event) => updateDraft({ code: event.currentTarget.value })}
                        required
                      />
                      <TextInput
                        label="Name"
                        placeholder="Fiscal Year 2026"
                        value={draft.name}
                        onChange={(event) => updateDraft({ name: event.currentTarget.value })}
                        required
                      />
                    </Group>
                    <Group grow align="flex-end" wrap="wrap">
                      <TextInput
                        label="Start date"
                        placeholder="YYYY-MM-DD"
                        type="date"
                        value={draft.start_date}
                        onChange={(event) =>
                          updateDraft({ start_date: event.currentTarget.value })
                        }
                        required
                      />
                      <TextInput
                        label="End date"
                        placeholder="YYYY-MM-DD"
                        type="date"
                        value={draft.end_date}
                        onChange={(event) => updateDraft({ end_date: event.currentTarget.value })}
                        required
                      />
                      <Select
                        label="Status"
                        data={STATUS_OPTIONS}
                        value={draft.status}
                        onChange={(value) =>
                          updateDraft({ status: (value as FiscalYearRow["status"]) ?? "OPEN" })
                        }
                      />
                    </Group>
                    <Group justify="flex-end">
                      <Button
                        variant="light"
                        onClick={cancelEdit}
                        disabled={isSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => handleSaveActiveRow(key)}
                        loading={saving}
                      >
                        {draft.isNew ? "Create" : "Save"}
                      </Button>
                    </Group>
                  </>
                ) : (
                  <>
                    <Group gap="xl" wrap="wrap">
                      <div>
                        <Text size="xs" c="dimmed">Code</Text>
                        <Text size="sm">{draft.code || "—"}</Text>
                      </div>
                      <div>
                        <Text size="xs" c="dimmed">Period</Text>
                        <Text size="sm">
                          {draft.start_date && draft.end_date
                            ? `${draft.start_date} → ${draft.end_date}`
                            : "—"}
                        </Text>
                      </div>
                    </Group>

                    {/* Close Info for PENDING_CLOSE status */}
                    {effectiveStatus === "PENDING_CLOSE" && draft.close_info && (
                      <Alert color="yellow" title="Close Pending" icon={<IconAlertCircle size={16} />}>
                        <Text size="sm">
                          Close initiated
                          {draft.close_info.initiated_at && (
                            <> on {formatTimestamp(draft.close_info.initiated_at)}</>
                          )}
                        </Text>
                        <Text size="sm" c="dimmed">
                          Awaiting approval to post closing entries.
                        </Text>
                      </Alert>
                    )}

                    {/* Close history for CLOSED status */}
                    {effectiveStatus === "CLOSED" && draft.close_info && (
                      <Alert color="gray" title="Closed" icon={<IconCheck size={16} />}>
                        <Text size="sm">
                          {draft.close_info.approved_at && (
                            <>Closed on {formatTimestamp(draft.close_info.approved_at)}</>
                          )}
                        </Text>
                        {draft.close_info.net_income !== undefined && (
                          <Text size="sm" c="dimmed">
                            Net Income: {formatCurrency(draft.close_info.net_income)}
                          </Text>
                        )}
                      </Alert>
                    )}

                    <Group justify="flex-end">
                      {effectiveStatus === "OPEN" && canManage && draft.id && (
                        <Button
                          variant="filled"
                          color="orange"
                          onClick={() => handleCloseYearClick(row)}
                          leftSection={<IconCalendar size={16} />}
                        >
                          Close Year
                        </Button>
                      )}
                      {effectiveStatus === "PENDING_CLOSE" && canManage && draft.id && (
                        <Button
                          variant="filled"
                          color="green"
                          onClick={() => handleApproveCloseClick(row)}
                          leftSection={<IconCheck size={16} />}
                        >
                          Approve Close
                        </Button>
                      )}
                      <Button
                        variant="light"
                        onClick={() => startEdit(row)}
                        disabled={isSaving || effectiveStatus !== "OPEN"}
                      >
                        Edit
                      </Button>
                    </Group>
                  </>
                )}
              </Stack>
            </Card>
          );
        })}
      </Stack>

      {/* =======================================================================
          Close Preview Modal
      ======================================================================= */}
      <Modal
        opened={previewModalOpen}
        onClose={handlePreviewModalClose}
        title={`Close Preview: ${selectedFiscalYear?.name ?? ""}`}
        size="xl"
        centered
      >
        <Stack gap="md">
          {closeError && (
            <Alert color="red" title="Error">
              {closeError}
            </Alert>
          )}

          {closeSuccessMsg && !closeInitiateResult && (
            <Alert color="green" title="Success">
              {closeSuccessMsg}
            </Alert>
          )}

          {loadingPreview && (
            <Group justify="center" py="xl">
              <Loader />
              <Text>Loading close preview...</Text>
            </Group>
          )}

          {closePreview && closeInitiationEvidence && !closeInitiateResult && (
            <ReviewPanel
              title="Review fiscal close initiation"
              description="Complete each evidence section, then use final confirmation to create the backend close request. Approval is a separate finalizing step."
              scopeBadges={closeInitiationEvidence.scope.map((item) => ({ label: item.label, value: item.value }))}
              summaryItems={closeInitiationEvidence.financialEffects.map((item) => ({ label: item.label, value: item.value }))}
              saveLabel="Initiate close request"
              submitting={loadingInitiate}
              saveDisabled={closePreview.can_close === false || Boolean(closeReasonValidation.error)}
              onDiscardDraft={handlePreviewModalClose}
              onSubmit={handleInitiateClose}
              sections={[
                {
                  id: "close-scope",
                  title: "Scope",
                  description: "Fiscal year and status that will be submitted to the close workflow.",
                  content: (
                    <Stack gap="xs">
                      {closeInitiationEvidence.scope.map((item) => (
                        <Group key={item.label} justify="space-between">
                          <Text fw={600}>{item.label}</Text>
                          <Text>{item.value}</Text>
                        </Group>
                      ))}
                    </Stack>
                  )
                },
                {
                  id: "close-reason",
                  title: "Reason",
                  description: "Operator accountability reason sent to the backend close request.",
                  errors: closeReasonValidation.error ? [closeReasonValidation.error] : [],
                  content: (
                    <Stack gap="xs">
                      <Textarea
                        label="Close reason"
                        value={closeReason}
                        onChange={(event) => setCloseReason(event.currentTarget.value)}
                        maxLength={CLOSE_REASON_MAX_LENGTH}
                        minRows={3}
                        autosize
                        required
                        error={closeReasonValidation.error}
                      />
                      <Text size="xs" c="dimmed">
                        {closeReasonValidation.characterCount}/{CLOSE_REASON_MAX_LENGTH} characters after trimming
                      </Text>
                    </Stack>
                  )
                },
                {
                  id: "close-effects",
                  title: "Financial effects",
                  description: "Backend close-preview totals and closing entry details.",
                  content: (
                    <Stack gap="md">
                      <Group gap="xl" wrap="wrap">
                        {closeInitiationEvidence.financialEffects.map((item) => (
                          <div key={item.label}>
                            <Text size="xs" c="dimmed">{item.label}</Text>
                            <Text size="sm">{item.value}</Text>
                          </div>
                        ))}
                      </Group>
                      <Text fw={600}>Closing entries ({closeInitiationEvidence.closingEntryCount})</Text>
                      <ScrollArea>
                        <Table striped highlightOnHover withTableBorder withColumnBorders>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Account</Table.Th>
                              <Table.Th>Evidence</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {closeInitiationEvidence.closingEntries.map((entry) => (
                              <Table.Tr key={entry.label}>
                                <Table.Td><Text size="sm">{entry.label}</Text></Table.Td>
                                <Table.Td><Text size="sm">{entry.value}</Text></Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </ScrollArea>
                    </Stack>
                  )
                },
                {
                  id: "close-generated-entry-expectation",
                  title: "Generated-entry expectation",
                  description: "What this step creates now and what approval creates later.",
                  errors: closeInitiationEvidence.warnings.length > 0 ? closeInitiationEvidence.warnings : [],
                  content: (
                    <Stack gap="xs">
                      <Text>{closeInitiationEvidence.generatedEntryExpectation}</Text>
                      <Text size="sm" c="dimmed">
                        Entry date: {closePreview.entryDate} | Description: {closePreview.description}
                      </Text>
                      {closeInitiationEvidence.warnings.length > 0 ? (
                        <Alert color="red" title="Cannot Close Fiscal Year" icon={<IconAlertCircle size={16} />}>
                          <Stack gap="xs">
                            {closeInitiationEvidence.warnings.map((warning) => (
                              <Text key={warning} size="sm">{warning}</Text>
                            ))}
                          </Stack>
                        </Alert>
                      ) : null}
                    </Stack>
                  )
                }
              ]}
            />
          )}

          {closeInitiateResult && (
            <Alert color={closeInitiateResult.success ? "green" : "blue"} title={closeInitiateResult.success ? "Already Closed" : "Close Initiated"}>
              <Text>{closeInitiateResult.message}</Text>
              <Stack gap="xs" mt="sm">
                <Text size="sm">
                  <strong>Close request ID:</strong> {closeInitiateResult.closeRequestId}
                </Text>
                <Text size="sm">
                  <strong>Status:</strong> {closeInitiateResult.status}
                </Text>
                {closeInitiateResult.reason ? (
                  <Text size="sm">
                    <strong>Reason:</strong> {closeInitiateResult.reason}
                  </Text>
                ) : closeSubmittedReason ? (
                  <Text size="sm">
                    <strong>Submitted reason:</strong> {closeSubmittedReason}
                  </Text>
                ) : null}
                <Text size="sm">
                  <strong>Total Revenue:</strong> {formatCurrency(closeInitiateResult.totalIncome)}
                </Text>
                <Text size="sm">
                  <strong>Total Expenses:</strong> {formatCurrency(closeInitiateResult.totalExpenses)}
                </Text>
                <Text size="sm">
                  <strong>Net Income:</strong> {formatCurrency(closeInitiateResult.netIncome)}
                </Text>
                <Text size="sm">
                  <strong>Closing Entries:</strong> {closeInitiateResult.closingEntriesCount}
                </Text>
              </Stack>
              <Group justify="flex-end" mt="md">
                <Button variant="default" onClick={handlePreviewModalClose}>
                  Close
                </Button>
                {!closeInitiateResult.success && canManage && (
                  <Button
                    color="green"
                    onClick={handleProceedToApproveFromInitiate}
                    leftSection={<IconCheck size={16} />}
                  >
                    Proceed to Approve
                  </Button>
                )}
              </Group>
            </Alert>
          )}
        </Stack>
      </Modal>

      {/* =======================================================================
          Approve Close Confirmation Modal
      ======================================================================= */}
      <Modal
        opened={approveModalOpen}
        onClose={handleApproveModalClose}
        title={`Approve Close: ${selectedFiscalYear?.name ?? ""}`}
        size="xl"
        centered
      >
        <Stack gap="md">
          {closeError && (
            <Alert color="red" title="Error">
              {closeError}
            </Alert>
          )}

          {closeApprovalEvidence ? (
            <ReviewPanel
              title="Review fiscal close approval"
              description="Approval finalizes the fiscal year and posts backend-assigned journal batch IDs. Complete all sections and final confirmation before approving."
              scopeBadges={closeApprovalEvidence.scope.map((item) => ({ label: item.label, value: item.value }))}
              summaryItems={closeApprovalEvidence.totals.map((item) => ({ label: item.label, value: item.value }))}
              saveLabel="Approve and close fiscal year"
              submitting={loadingApprove}
              saveDisabled={!closeRequestId}
              onDiscardDraft={handleApproveModalClose}
              onSubmit={handleConfirmApproveClose}
              sections={[
                {
                  id: "approve-scope",
                  title: "Approval scope",
                  description: "Close request that will be approved.",
                  errors: closeRequestId ? [] : ["Close request ID is required before approval."],
                  content: (
                    <Stack gap="xs">
                      {closeApprovalEvidence.scope.map((item) => (
                        <Group key={item.label} justify="space-between">
                          <Text fw={600}>{item.label}</Text>
                          <Text>{item.value}</Text>
                        </Group>
                      ))}
                    </Stack>
                  )
                },
                {
                  id: "approve-financial-effects",
                  title: "Finalize financial effects",
                  description: "Evidence known before approval. Backend remains source of truth for posted journal batch IDs.",
                  content: (
                    <Stack gap="xs">
                      <Alert color="red" title="Warning: Irreversible Action" icon={<IconAlertCircle size={16} />}>
                        <Text size="sm">Approving the fiscal year close will post closing entries to the General Ledger and finalize the fiscal year.</Text>
                      </Alert>
                      {closeApprovalEvidence.totals.length > 0 ? closeApprovalEvidence.totals.map((item) => (
                        <Group key={item.label} justify="space-between">
                          <Text fw={600}>{item.label}</Text>
                          <Text>{item.value}</Text>
                        </Group>
                      )) : (
                        <Text size="sm" c="dimmed">Totals are not present in the pending close list response. Approval response will display backend totals.</Text>
                      )}
                    </Stack>
                  )
                },
                {
                  id: "approve-accountability",
                  title: "Accountability and result expectation",
                  description: "Reason evidence and backend-generated result fields expected after approval.",
                  content: (
                    <Stack gap="xs">
                      <Text size="sm">
                        <strong>Reason evidence:</strong> {closeApprovalEvidence.reason ?? "Reason is not available in the current list response."}
                      </Text>
                      <Text size="sm">
                        Approval sends <strong>{`{ close_request_id: "${closeRequestId ?? ""}" }`}</strong> to the backend.
                      </Text>
                      <Text size="sm">
                        Approval result will display status transition, totals, warnings if returned, and posted journal batch IDs as text only.
                      </Text>
                    </Stack>
                  )
                }
              ]}
            />
          ) : null}
        </Stack>
      </Modal>
    </Container>
  );
}
