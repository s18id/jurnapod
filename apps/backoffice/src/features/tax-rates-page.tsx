// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Container,
  Group,
  MultiSelect,
  NumberInput,
  Stack,
  Switch,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import type { SessionUser } from "../lib/session";
import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import { OfflinePage } from "../components/offline-page";

type TaxRatesPageProps = {
  user: SessionUser;
  accessToken: string;
};

type TaxRateRow = {
  id?: number;
  code: string;
  name: string;
  rate_percent: number;
  is_inclusive: boolean;
  is_active: boolean;
  isNew?: boolean;
};

type TaxRatesResponse = {
  ok: true;
  tax_rates: Array<{
    id: number;
    code: string;
    name: string;
    rate_percent: number;
    is_inclusive: boolean;
    is_active: boolean;
  }>;
};

type TaxDefaultsResponse = {
  ok: true;
  tax_rate_ids: number[];
};

function buildNewRow(): TaxRateRow {
  return {
    code: "",
    name: "",
    rate_percent: 0,
    is_inclusive: false,
    is_active: true,
    isNew: true
  };
}

export function TaxRatesPage({ accessToken }: TaxRatesPageProps) {
  const isOnline = useOnlineStatus();
  const [rates, setRates] = useState<TaxRateRow[]>([]);
  const [defaultIds, setDefaultIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [defaultError, setDefaultError] = useState<string | null>(null);
  const [defaultSaved, setDefaultSaved] = useState(false);

  const activeOptions = useMemo(
    () =>
      rates
        .filter((rate) => rate.id && rate.is_active)
        .map((rate) => ({
          value: String(rate.id),
          label: `${rate.code} · ${rate.name} (${rate.rate_percent}%)`
        })),
    [rates]
  );

  useEffect(() => {
    async function fetchRates() {
      setLoading(true);
      setError(null);
      try {
        const [ratesResponse, defaultsResponse] = await Promise.all([
          apiRequest<TaxRatesResponse>("/settings/tax-rates", {}, accessToken),
          apiRequest<TaxDefaultsResponse>("/settings/tax-defaults", {}, accessToken)
        ]);
        setRates(
          ratesResponse.tax_rates.map((row) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            rate_percent: row.rate_percent,
            is_inclusive: row.is_inclusive,
            is_active: row.is_active
          }))
        );
        setDefaultIds(defaultsResponse.tax_rate_ids.map(String));
      } catch (fetchError) {
        if (fetchError instanceof ApiError) {
          setError(fetchError.message);
        } else {
          setError("Failed to load tax rates");
        }
      } finally {
        setLoading(false);
      }
    }

    fetchRates().catch(() => setError("Failed to load tax rates"));
  }, [accessToken]);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Tax Rates"
        message="Tax rate changes require a connection."
      />
    );
  }

  function updateRate(index: number, patch: Partial<TaxRateRow>) {
    setRates((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row))
    );
  }

  async function handleSaveRate(index: number) {
    setSaveError(null);
    const rate = rates[index];
    if (!rate) {
      return;
    }

    if (!rate.code.trim() || !rate.name.trim()) {
      setSaveError("Tax code and name are required.");
      return;
    }

    try {
      if (rate.isNew || !rate.id) {
        const response = await apiRequest<{ ok: true; id: number }>(
          "/settings/tax-rates",
          {
            method: "POST",
            body: JSON.stringify({
              code: rate.code.trim(),
              name: rate.name.trim(),
              rate_percent: rate.rate_percent,
              is_inclusive: rate.is_inclusive,
              is_active: rate.is_active
            })
          },
          accessToken
        );
        updateRate(index, { id: response.id, isNew: false });
      } else {
        await apiRequest<{ ok: true }>(
          `/settings/tax-rates/${rate.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              code: rate.code.trim(),
              name: rate.name.trim(),
              rate_percent: rate.rate_percent,
              is_inclusive: rate.is_inclusive,
              is_active: rate.is_active
            })
          },
          accessToken
        );
      }
    } catch (saveErr) {
      if (saveErr instanceof ApiError) {
        setSaveError(saveErr.message);
      } else {
        setSaveError("Failed to save tax rate");
      }
    }
  }

  async function handleDeactivate(index: number) {
    setSaveError(null);
    const rate = rates[index];
    if (!rate?.id) {
      return;
    }
    try {
      await apiRequest<{ ok: true }>(
        `/settings/tax-rates/${rate.id}`,
        { method: "DELETE" },
        accessToken
      );
      updateRate(index, { is_active: false });
    } catch (saveErr) {
      if (saveErr instanceof ApiError) {
        setSaveError(saveErr.message);
      } else {
        setSaveError("Failed to deactivate tax rate");
      }
    }
  }

  function handleAddRate() {
    setRates((prev) => [...prev, buildNewRow()]);
  }

  async function handleSaveDefaults() {
    setDefaultError(null);
    setDefaultSaved(false);
    setSavingDefaults(true);
    try {
      await apiRequest<{ ok: true }>(
        "/settings/tax-defaults",
        {
          method: "PUT",
          body: JSON.stringify({
            tax_rate_ids: defaultIds.map((id) => Number(id))
          })
        },
        accessToken
      );
      setDefaultSaved(true);
    } catch (saveErr) {
      if (saveErr instanceof ApiError) {
        setDefaultError(saveErr.message);
      } else {
        setDefaultError("Failed to update default taxes");
      }
    } finally {
      setSavingDefaults(false);
    }
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <div>
          <Title order={2}>Tax Rates</Title>
          <Text c="dimmed" size="sm">
            Manage tax rates and choose company defaults used when tax lines are not provided.
          </Text>
        </div>

        {loading ? (
          <Text size="sm" c="dimmed">
            Loading tax rates...
          </Text>
        ) : null}

        {error ? (
          <Alert color="red" title="Unable to load">
            {error}
          </Alert>
        ) : null}

        <Card>
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={4}>Default Taxes</Title>
              <Button onClick={handleSaveDefaults} loading={savingDefaults} variant="light">
                Save Defaults
              </Button>
            </Group>
            <MultiSelect
              data={activeOptions}
              value={defaultIds}
              onChange={setDefaultIds}
              placeholder="Select default taxes"
              searchable
              clearable
            />
            {defaultError ? (
              <Alert color="red" title="Save failed">
                {defaultError}
              </Alert>
            ) : null}
            {defaultSaved ? (
              <Alert color="green" title="Saved">
                Default taxes updated.
              </Alert>
            ) : null}
          </Stack>
        </Card>

        <Group justify="space-between">
          <Title order={4}>Rates</Title>
          <Button onClick={handleAddRate} variant="light">
            Add Rate
          </Button>
        </Group>

        {saveError ? (
          <Alert color="red" title="Save failed">
            {saveError}
          </Alert>
        ) : null}

        <Stack gap="md">
          {rates.map((rate, index) => (
            <Card key={rate.id ?? `new-${index}`} withBorder>
              <Stack gap="sm">
                <Group grow wrap="wrap">
                  <TextInput
                    label="Code"
                    value={rate.code}
                    onChange={(event) => updateRate(index, { code: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Name"
                    value={rate.name}
                    onChange={(event) => updateRate(index, { name: event.currentTarget.value })}
                  />
                </Group>
                <Group grow wrap="wrap">
                  <NumberInput
                    label="Rate (%)"
                    min={0}
                    max={100}
                    value={rate.rate_percent}
                    onChange={(value) =>
                      updateRate(index, { rate_percent: Number(value) || 0 })
                    }
                  />
                  <Switch
                    label="Inclusive"
                    checked={rate.is_inclusive}
                    onChange={(event) =>
                      updateRate(index, { is_inclusive: event.currentTarget.checked })
                    }
                  />
                  <Switch
                    label="Active"
                    checked={rate.is_active}
                    onChange={(event) =>
                      updateRate(index, { is_active: event.currentTarget.checked })
                    }
                  />
                </Group>
                <Group justify="flex-end" wrap="wrap">
                  {rate.id && rate.is_active ? (
                    <Button variant="subtle" color="red" onClick={() => handleDeactivate(index)}>
                      Deactivate
                    </Button>
                  ) : null}
                  <Button onClick={() => handleSaveRate(index)}>
                    {rate.isNew || !rate.id ? "Create" : "Save"}
                  </Button>
                </Group>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
