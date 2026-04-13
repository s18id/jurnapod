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
  TextInput,
  Title,
  Modal,
  Table,
  Loader,
  Checkbox,
  ScrollArea
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { IconCalendar, IconAlertCircle, IconCheck } from "@tabler/icons-react";

import { OfflinePage } from "../components/offline-page";
import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import type { SessionUser } from "../lib/session";

type FiscalYearsPageProps = {
  user: SessionUser;
};

// =============================================================================
// Types
// =============================================================================

type FiscalYearRow = {
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
type ClosePreviewResponse = {
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
type CloseInitiateResponse = {
  success: true;
  data: {
    success: boolean;
    fiscalYearId: number;
    closeRequestId: string;
    status: string;
    message: string;
    canApprove: boolean;
    netIncome: number;
    totalIncome: number;
    totalExpenses: number;
    closingEntriesCount: number;
  };
};

// Close approve response from POST /accounts/fiscal-years/:id/close/approve
type CloseApproveResponse = {
  success: true;
  data: {
    success: boolean;
    fiscalYearId: number;
    closeRequestId: string;
    status: string;
    previousStatus: string;
    newStatus: string;
    postedBatchIds: number[];
    netIncome: number;
    totalIncome: number;
    totalExpenses: number;
    hasImbalance: boolean;
  };
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

function formatCurrency(amount: number): string {
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

function getEffectiveStatus(row: FiscalYearRow): "OPEN" | "PENDING_CLOSE" | "CLOSED" {
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

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if user has MANAGE permission on accounting.fiscal_years.
 * Uses resource-level ACL - requires explicit permission entry in module_roles.
 *
 * Per AGENTS.md role matrix:
 * - OWNER: CRUDAM (63) → includes MANAGE
 * - COMPANY_ADMIN: CRUDAM (63) → includes MANAGE
 * - ADMIN: CRUDA (31) → does NOT include MANAGE
 * - ACCOUNTANT: READ (1) → does NOT include MANAGE
 * - CASHIER: 0 → does NOT include MANAGE
 *
 * Note: Frontend role-check is a convenience shortcut.
 * Server enforces the real ACL via requireAccess() on all endpoints.
 */
function hasManagePermission(user: SessionUser): boolean {
  const MANAGER_ROLES = ["OWNER", "COMPANY_ADMIN"];
  return (
    user.roles.some((role) => MANAGER_ROLES.includes(role)) ||
    user.global_roles.some((role) => MANAGER_ROLES.includes(role))
  );
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
  const [closeConfirmChecked, setCloseConfirmChecked] = useState(false);

  // Close workflow state
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYearRow | null>(null);
  const [closePreview, setClosePreview] = useState<ClosePreviewResponse["data"] | null>(null);
  const [closeInitiateResult, setCloseInitiateResult] = useState<CloseInitiateResponse["data"] | null>(null);
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

  const canManage = hasManagePermission(user);

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
      if (err instanceof ApiError) {
        setCloseError(err.message);
      } else {
        setCloseError("Failed to load close preview");
      }
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleInitiateClose() {
    if (!selectedFiscalYear?.id) return;

    setLoadingInitiate(true);
    setCloseError(null);

    try {
      const response = await apiRequest<CloseInitiateResponse>(
        `/accounts/fiscal-years/${selectedFiscalYear.id}/close`,
        {
          method: "POST",
          body: JSON.stringify({})
        },
        {}
      );
      setCloseInitiateResult(response.data);

      // Close preview modal immediately on success
      closePreviewModal();

      if (response.data.success) {
        setCloseSuccessMsg("Fiscal year has already been closed previously.");
      } else {
        setCloseSuccessMsg("Close initiated. Please proceed to approve to finalize the close.");
      }

      // Refresh the fiscal years list to update close_info
      const fyResponse = await apiRequest<FiscalYearsResponse>(
        `/accounts/fiscal-years?company_id=${user.company_id}&include_closed=1`,
        {}
      );
      setFiscalYears(fyResponse.data);
      await fetchCloseRequestStatuses(fyResponse.data);

    } catch (err) {
      if (err instanceof ApiError) {
        setCloseError(err.message);
      } else {
        setCloseError("Failed to initiate close");
      }
    } finally {
      setLoadingInitiate(false);
    }
  }

  async function handleApproveCloseClick(fiscalYear: FiscalYearRow) {
    if (!fiscalYear.id || !fiscalYear.close_info?.close_request_id) return;

    setSelectedFiscalYear(fiscalYear);
    setCloseConfirmChecked(false);
    setCloseError(null);
    setCloseSuccessMsg(null);
    openApproveModal();
  }

  async function handleConfirmApproveClose() {
    if (!selectedFiscalYear?.id || !selectedFiscalYear.close_info?.close_request_id) return;

    if (!closeConfirmChecked) {
      setCloseError("Please confirm that you understand this action will finalize the fiscal year.");
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
            close_request_id: selectedFiscalYear.close_info.close_request_id
          })
        }
      );

      setCloseSuccessMsg(
        `Fiscal year has been closed successfully. ${response.data.postedBatchIds.length} journal batch(es) posted.`
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
      if (err instanceof ApiError) {
        setCloseError(err.message);
      } else {
        setCloseError("Failed to approve close");
      }
    } finally {
      setLoadingApprove(false);
    }
  }

  function handlePreviewModalClose() {
    closePreviewModal();
    setSelectedFiscalYear(null);
    setClosePreview(null);
    setCloseInitiateResult(null);
    setCloseError(null);
  }

  function handleApproveModalClose() {
    closeApproveModal();
    setSelectedFiscalYear(null);
    setCloseConfirmChecked(false);
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

          {closePreview && !closeInitiateResult && (
            <>
              {/* Fiscal Year Summary */}
              <Card withBorder>
                <Stack gap="xs">
                  <Text fw={600}>Fiscal Year Summary</Text>
                  <Group gap="xl">
                    <div>
                      <Text size="xs" c="dimmed">Code</Text>
                      <Text size="sm">{closePreview.fiscalYearCode}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">Period</Text>
                      <Text size="sm">{closePreview.startDate} → {closePreview.endDate}</Text>
                    </div>
                  </Group>
                </Stack>
              </Card>

              {/* Financial Summary */}
              <Card withBorder>
                <Stack gap="xs">
                  <Text fw={600}>Financial Summary</Text>
                  <Group gap="xl">
                    <div>
                      <Text size="xs" c="dimmed">Total Revenue</Text>
                      <Text size="sm" c="green">{formatCurrency(closePreview.totalIncome)}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">Total Expenses</Text>
                      <Text size="sm" c="red">{formatCurrency(closePreview.totalExpenses)}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">Net Income</Text>
                      <Text size="sm" fw={600} c={closePreview.netIncome >= 0 ? "green" : "red"}>
                        {formatCurrency(closePreview.netIncome)}
                      </Text>
                    </div>
                  </Group>
                </Stack>
              </Card>

              {/* Blockers Alert - shown when can_close is false */}
              {closePreview.blockers && closePreview.blockers.length > 0 && (
                <Alert color="red" title="Cannot Close Fiscal Year" icon={<IconAlertCircle size={16} />}>
                  <Text size="sm" mb="xs">
                    The following issues prevent this fiscal year from being closed:
                  </Text>
                  <Stack gap="xs">
                    {closePreview.blockers.map((blocker, idx) => (
                      <Text key={idx} size="sm">
                        • {blocker}
                      </Text>
                    ))}
                  </Stack>
                </Alert>
              )}

              {/* Closing Entries Preview */}
              <Card withBorder>
                <Stack gap="xs">
                  <Text fw={600}>
                    Closing Entries to be Created ({closePreview.closingEntries.length} entries)
                  </Text>
                  <Text size="xs" c="dimmed">
                    Entry Date: {closePreview.entryDate} | Description: {closePreview.description}
                  </Text>

                  <ScrollArea>
                    <Table striped highlightOnHover withTableBorder withColumnBorders>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Account</Table.Th>
                          <Table.Th>Description</Table.Th>
                          <Table.Th style={{ textAlign: "right" }}>Debit</Table.Th>
                          <Table.Th style={{ textAlign: "right" }}>Credit</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {closePreview.closingEntries.map((entry, idx) => (
                          <Table.Tr key={idx}>
                            <Table.Td>
                              <Text size="sm">{entry.accountCode} - {entry.accountName}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm">{entry.description}</Text>
                            </Table.Td>
                            <Table.Td style={{ textAlign: "right" }}>
                              <Text size="sm" c="red">
                                {entry.debit > 0 ? formatCurrency(entry.debit) : "—"}
                              </Text>
                            </Table.Td>
                            <Table.Td style={{ textAlign: "right" }}>
                              <Text size="sm" c="green">
                                {entry.credit > 0 ? formatCurrency(entry.credit) : "—"}
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                        {/* Retained Earnings entry */}
                        <Table.Tr bg="gray.1">
                          <Table.Td>
                            <Text size="sm" fw={600}>
                              {closePreview.retainedEarningsAccountCode} - Retained Earnings
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" fw={600}>Close {closePreview.fiscalYearCode}</Text>
                          </Table.Td>
                          <Table.Td style={{ textAlign: "right" }}>
                            <Text size="sm" fw={600} c={closePreview.netIncome < 0 ? "red" : "gray"}>
                              {closePreview.netIncome < 0 ? formatCurrency(Math.abs(closePreview.netIncome)) : "—"}
                            </Text>
                          </Table.Td>
                          <Table.Td style={{ textAlign: "right" }}>
                            <Text size="sm" fw={600} c={closePreview.netIncome >= 0 ? "green" : "gray"}>
                              {closePreview.netIncome >= 0 ? formatCurrency(closePreview.netIncome) : "—"}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Stack>
              </Card>

              {/* Actions */}
              <Group justify="flex-end">
                <Button variant="default" onClick={handlePreviewModalClose}>
                  Cancel
                </Button>
                <Button
                  color="orange"
                  onClick={handleInitiateClose}
                  loading={loadingInitiate}
                  disabled={closePreview.can_close === false}
                  leftSection={<IconCalendar size={16} />}
                >
                  Initiate Close
                </Button>
              </Group>
            </>
          )}

          {closeInitiateResult && (
            <Alert color={closeInitiateResult.success ? "green" : "blue"} title={closeInitiateResult.success ? "Already Closed" : "Close Initiated"}>
              <Text>{closeInitiateResult.message}</Text>
              {!closeInitiateResult.success && (
                <Stack gap="xs" mt="sm">
                  <Text size="sm">
                    <strong>Net Income:</strong> {formatCurrency(closeInitiateResult.netIncome)}
                  </Text>
                  <Text size="sm">
                    <strong>Closing Entries:</strong> {closeInitiateResult.closingEntriesCount}
                  </Text>
                </Stack>
              )}
              <Group justify="flex-end" mt="md">
                <Button variant="default" onClick={handlePreviewModalClose}>
                  Close
                </Button>
                {!closeInitiateResult.success && canManage && (
                  <Button
                    color="green"
                    onClick={() => {
                      handlePreviewModalClose();
                      // Find the fiscal year and open approve modal
                      const fy = fiscalYears.find(f => f.id === selectedFiscalYear?.id);
                      if (fy) handleApproveCloseClick(fy);
                    }}
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
        size="md"
        centered
      >
        <Stack gap="md">
          <Alert color="red" title="Warning: Irreversible Action" icon={<IconAlertCircle size={16} />}>
            <Text size="sm">
              Approving the fiscal year close will:
            </Text>
            <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
              <li><Text size="sm">Post all closing entries to the General Ledger</Text></li>
              <li><Text size="sm">Transfer net income/loss to retained earnings</Text></li>
              <li><Text size="sm"><strong>This action cannot be undone</strong></Text></li>
            </ul>
          </Alert>

          {closeInitiateResult && (
            <Card withBorder>
              <Stack gap="xs">
                <Text fw={600}>Close Summary</Text>
                <Group gap="xl">
                  <div>
                    <Text size="xs" c="dimmed">Net Income</Text>
                    <Text size="sm" fw={600} c={closeInitiateResult.netIncome >= 0 ? "green" : "red"}>
                      {formatCurrency(closeInitiateResult.netIncome)}
                    </Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">Closing Entries</Text>
                    <Text size="sm">{closeInitiateResult.closingEntriesCount}</Text>
                  </div>
                </Group>
              </Stack>
            </Card>
          )}

          {closeError && (
            <Alert color="red" title="Error">
              {closeError}
            </Alert>
          )}

          <Checkbox
            label="I understand that this action will finalize the fiscal year and cannot be undone"
            checked={closeConfirmChecked}
            onChange={(event) => setCloseConfirmChecked(event.currentTarget.checked)}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={handleApproveModalClose} disabled={loadingApprove}>
              Cancel
            </Button>
            <Button
              color="green"
              onClick={handleConfirmApproveClose}
              loading={loadingApprove}
              disabled={!closeConfirmChecked}
              leftSection={<IconCheck size={16} />}
            >
              Approve & Close
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
