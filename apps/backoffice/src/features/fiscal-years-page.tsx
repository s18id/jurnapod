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

function buildNewRow(): FiscalYearRow {
  return {
    code: "",
    name: "",
    start_date: "",
    end_date: "",
    status: "OPEN",
    isNew: true
  };
}

export function FiscalYearsPage({ user, accessToken }: FiscalYearsPageProps) {
  const isOnline = useOnlineStatus();
  const [fiscalYears, setFiscalYears] = useState<FiscalYearRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const sortedYears = useMemo(
    () =>
      [...fiscalYears].sort((a, b) =>
        `${b.start_date}-${b.id ?? 0}`.localeCompare(`${a.start_date}-${a.id ?? 0}`)
      ),
    [fiscalYears]
  );

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

  function updateRow(index: number, patch: Partial<FiscalYearRow>) {
    setFiscalYears((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  }

  async function handleSave(index: number) {
    setSaveError(null);
    setSaveSuccess(null);
    const row = fiscalYears[index];
    if (!row) {
      return;
    }

    if (!row.code.trim() || !row.name.trim()) {
      setSaveError("Code and name are required.");
      return;
    }

    if (!row.start_date.trim() || !row.end_date.trim()) {
      setSaveError("Start date and end date are required.");
      return;
    }

    const key = row.id ?? `new-${index}`;
    setSavingKey(key);
    try {
      if (row.isNew || !row.id) {
        const response = await apiRequest<FiscalYearResponse>(
          "/accounts/fiscal-years",
          {
            method: "POST",
            body: JSON.stringify({
              company_id: user.company_id,
              code: row.code.trim(),
              name: row.name.trim(),
              start_date: row.start_date.trim(),
              end_date: row.end_date.trim(),
              status: row.status
            })
          },
          accessToken
        );
        updateRow(index, { ...response.data, isNew: false });
        setSaveSuccess("Fiscal year created.");
      } else {
        const response = await apiRequest<FiscalYearResponse>(
          `/accounts/fiscal-years/${row.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              code: row.code.trim(),
              name: row.name.trim(),
              start_date: row.start_date.trim(),
              end_date: row.end_date.trim(),
              status: row.status
            })
          },
          accessToken
        );
        updateRow(index, response.data);
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
    setSaveError(null);
    setSaveSuccess(null);
    setFiscalYears((prev) => [buildNewRow(), ...prev]);
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
          <Button onClick={handleAdd} variant="light">
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

        {sortedYears.map((row, index) => {
          const key = row.id ?? `new-${index}`;
          const saving = savingKey === key;
          return (
            <Card key={key} withBorder>
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Text fw={600}>{row.name || "New fiscal year"}</Text>
                  <Badge color={row.status === "OPEN" ? "green" : "gray"} variant="light">
                    {row.status}
                  </Badge>
                </Group>
                <Group grow align="flex-end" wrap="wrap">
                  <TextInput
                    label="Code"
                    placeholder="FY2026"
                    value={row.code}
                    onChange={(event) => updateRow(index, { code: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Name"
                    placeholder="Fiscal Year 2026"
                    value={row.name}
                    onChange={(event) => updateRow(index, { name: event.currentTarget.value })}
                  />
                </Group>
                <Group grow align="flex-end" wrap="wrap">
                  <TextInput
                    label="Start date"
                    placeholder="YYYY-MM-DD"
                    value={row.start_date}
                    onChange={(event) =>
                      updateRow(index, { start_date: event.currentTarget.value })
                    }
                  />
                  <TextInput
                    label="End date"
                    placeholder="YYYY-MM-DD"
                    value={row.end_date}
                    onChange={(event) => updateRow(index, { end_date: event.currentTarget.value })}
                  />
                  <Select
                    label="Status"
                    data={STATUS_OPTIONS}
                    value={row.status}
                    onChange={(value) =>
                      updateRow(index, { status: (value as FiscalYearRow["status"]) ?? "OPEN" })
                    }
                  />
                </Group>
                <Group justify="flex-end">
                  <Button onClick={() => handleSave(index)} loading={saving}>
                    {row.isNew ? "Create" : "Save"}
                  </Button>
                </Group>
              </Stack>
            </Card>
          );
        })}
      </Stack>
    </Container>
  );
}
