// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
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
  Title
} from "@mantine/core";
import type { SessionUser } from "../lib/session";
import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import { OfflinePage } from "../components/offline-page";

type FiscalYearsPageProps = {
  user: SessionUser;
  accessToken: string;
};

type FiscalYearRow = {
  id?: number;
  code: string;
  name: string;
  start_date: string;
  end_date: string;
  status: "OPEN" | "CLOSED";
  isNew?: boolean;
  temp_key?: string;
};

type FiscalYearsResponse = {
  success: true;
  data: FiscalYearRow[];
};

type FiscalYearResponse = {
  success: true;
  data: FiscalYearRow;
};

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "CLOSED", label: "Closed" }
] as const;

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

export function FiscalYearsPage({ user, accessToken }: FiscalYearsPageProps) {
  const isOnline = useOnlineStatus();
  const [fiscalYears, setFiscalYears] = useState<FiscalYearRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<FiscalYearRow | null>(null);

  const isSaving = savingKey !== null;
  const currentEditingRow = editingKey
    ? fiscalYears.find((r) => getRowKey(r) === editingKey) ?? null
    : null;
  const isCurrentDraftDirty =
    currentEditingRow !== null && editDraft !== null && isDraftDirty(currentEditingRow, editDraft);
  const shouldDiscardCurrentEdit =
    currentEditingRow?.isNew === true || isCurrentDraftDirty;

  const sortedYears = useMemo(
    () =>
      [...fiscalYears].sort((a, b) => {
        if (a.start_date && b.start_date) {
          const dateCompare = b.start_date.localeCompare(a.start_date);
          if (dateCompare !== 0) return dateCompare;
        }
        if (a.id !== undefined && b.id !== undefined) {
          return b.id - a.id;
        }
        if (a.id !== undefined) return -1;
        if (b.id !== undefined) return 1;
        return (a.temp_key ?? "").localeCompare(b.temp_key ?? "");
      }),
    [fiscalYears]
  );

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

  useEffect(() => {
    async function fetchFiscalYears() {
      setLoading(true);
      setError(null);
      try {
        const response = await apiRequest<FiscalYearsResponse>(
          `/accounts/fiscal-years?company_id=${user.company_id}&include_closed=1`,
          {},
          accessToken
        );
        setFiscalYears(response.data);
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
  }, [accessToken, user.company_id]);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Fiscal Years"
        message="Fiscal year changes require a connection."
      />
    );
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
          },
          accessToken
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
          },
          accessToken
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
          <Button onClick={handleAdd} variant="light" disabled={isSaving}>
            Add Fiscal Year
          </Button>
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

        {sortedYears.map((row) => {
          const key = getRowKey(row);
          const isEditing = editingKey === key;
          const saving = savingKey === key;
          const draft = isEditing ? editDraft : row;

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
                  <Badge color={draft.status === "OPEN" ? "green" : "gray"} variant="light">
                    {draft.status}
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
                    <Group justify="flex-end">
                      <Button
                        variant="light"
                        onClick={() => startEdit(row)}
                        disabled={isSaving}
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
    </Container>
  );
}
