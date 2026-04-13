// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Alert,
  Button,
  Card,
  Container,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Title
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

import { OfflinePage } from "../components/offline-page";
import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import type { SessionUser } from "../lib/session";

type FeatureSettingsPageProps = {
  user: SessionUser;
};

type SettingsResponse = {
  success: true;
  data: {
    outlet_id: number;
    settings: Array<{
      key: string;
      value: number | boolean | string;
      value_type: string;
    }>;
  };
};

type SettingsSaveResponse = {
  success: true;
  data: null;
};

const SETTINGS_KEYS = [
  "feature.pos.auto_sync_enabled",
  "feature.pos.sync_interval_seconds",
  "feature.sales.tax_included_default",
  "accounting.allow_multiple_open_fiscal_years",
  "feature.inventory.allow_backorder",
  "feature.purchasing.require_approval"
] as const;

const COMPANY_SETTINGS_KEYS = ["feature.reservation.default_duration_minutes"] as const;

const DEFAULT_SETTINGS: Record<(typeof SETTINGS_KEYS)[number], number | boolean | string> = {
  "feature.pos.auto_sync_enabled": true,
  "feature.pos.sync_interval_seconds": 60,
  "feature.sales.tax_included_default": false,
  "accounting.allow_multiple_open_fiscal_years": false,
  "feature.inventory.allow_backorder": false,
  "feature.purchasing.require_approval": true
};

const DEFAULT_COMPANY_SETTINGS: Record<(typeof COMPANY_SETTINGS_KEYS)[number], number> = {
  "feature.reservation.default_duration_minutes": 120
};

function buildOutletOptions(outlets: SessionUser["outlets"]) {
  return outlets.map((outlet) => ({
    value: String(outlet.id),
    label: `${outlet.code} - ${outlet.name}`
  }));
}

export function FeatureSettingsPage({ user }: FeatureSettingsPageProps) {
  const isOnline = useOnlineStatus();
  const outletOptions = useMemo(() => buildOutletOptions(user.outlets), [user.outlets]);
  const [outletId, setOutletId] = useState<number>(user.outlets[0]?.id ?? 0);
  const [formState, setFormState] = useState<Record<string, number | boolean | string>>({
    ...DEFAULT_SETTINGS,
    ...DEFAULT_COMPANY_SETTINGS
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!outletId) {
      return;
    }

    async function fetchSettings() {
      setLoading(true);
      setError(null);
      setSaveSuccess(false);
      try {
        const outletKeysParam = SETTINGS_KEYS.join(",");
        const companyKeysParam = COMPANY_SETTINGS_KEYS.join(",");
        const [outletResponse, companyResponse] = await Promise.all([
          apiRequest<SettingsResponse>(
            `/settings/config?outlet_id=${outletId}&keys=${encodeURIComponent(outletKeysParam)}`,
            {}
          ),
          apiRequest<{ success: true; data: { settings: SettingsResponse["data"]["settings"] } }>(
            `/settings/company-config?keys=${encodeURIComponent(companyKeysParam)}`,
            {}
          )
        ]);
        const nextState: Record<string, number | boolean | string> = {
          ...DEFAULT_SETTINGS,
          ...DEFAULT_COMPANY_SETTINGS
        };
        outletResponse.data.settings.forEach((setting) => {
          nextState[setting.key] = setting.value;
        });
        companyResponse.data.settings.forEach((setting) => {
          nextState[setting.key] = setting.value;
        });
        setFormState(nextState);
      } catch (fetchError) {
        if (fetchError instanceof ApiError) {
          setError(fetchError.message);
        } else {
          setError("Failed to load outlet settings");
        }
      } finally {
        setLoading(false);
      }
    }

    fetchSettings().catch(() => setError("Failed to load outlet settings"));
  }, [outletId]);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Outlet Settings"
        message="Outlet setting changes require a connection."
      />
    );
  }

  async function handleSave() {
    if (!outletId) {
      setSaveError("Select an outlet before saving.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await apiRequest<SettingsSaveResponse>(
        "/settings/config",
        {
          method: "PUT",
          body: JSON.stringify({
            outlet_id: outletId,
            settings: SETTINGS_KEYS.map((key) => ({
              key,
              value: formState[key]
            }))
          })
        }
      );
      await apiRequest<SettingsSaveResponse>(
        "/settings/company-config",
        {
          method: "PUT",
          body: JSON.stringify({
            settings: COMPANY_SETTINGS_KEYS.map((key) => ({
              key,
              value: Number(formState[key] ?? DEFAULT_COMPANY_SETTINGS[key])
            }))
          })
        }
      );
      setSaveSuccess(true);
    } catch (saveErr) {
      if (saveErr instanceof ApiError) {
        setSaveError(saveErr.message);
      } else {
        setSaveError("Failed to save outlet settings");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <div>
          <Title order={2}>Outlet Settings</Title>
          <Text c="dimmed" size="sm">
            Configure outlet-level defaults for POS, sales, inventory, and purchasing.
          </Text>
        </div>

        <Card>
          <Stack gap="sm">
            <Select
              label="Outlet"
              data={outletOptions}
              value={outletId ? String(outletId) : ""}
              onChange={(value) => setOutletId(Number(value))}
              placeholder="Select outlet"
              disabled={outletOptions.length === 0}
            />
            {loading ? (
              <Text size="sm" c="dimmed">
                Loading settings...
              </Text>
            ) : null}
            {error ? (
              <Alert color="red" title="Unable to load">
                {error}
              </Alert>
            ) : null}
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <div>
              <Title order={4}>POS</Title>
              <Text c="dimmed" size="sm">
                Sync defaults for POS operations.
              </Text>
            </div>
            <Switch
              label="Auto sync enabled"
              checked={Boolean(formState["feature.pos.auto_sync_enabled"])}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  "feature.pos.auto_sync_enabled": event.currentTarget.checked
                }))
              }
            />
            <NumberInput
              label="Sync interval (seconds)"
              min={5}
              value={Number(formState["feature.pos.sync_interval_seconds"] ?? 60)}
              onChange={(value) =>
                setFormState((prev) => ({
                  ...prev,
                  "feature.pos.sync_interval_seconds": Number(value) || 5
                }))
              }
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <div>
              <Title order={4}>Reservation</Title>
              <Text c="dimmed" size="sm">
                Company-wide defaults for reservation scheduling.
              </Text>
            </div>
            <NumberInput
              label="Default reservation duration (minutes)"
              description="Used when reservation duration is empty in calendar and form defaults."
              min={15}
              max={480}
              value={Number(formState["feature.reservation.default_duration_minutes"] ?? 120)}
              onChange={(value) =>
                setFormState((prev) => ({
                  ...prev,
                  "feature.reservation.default_duration_minutes": Number(value) || 120
                }))
              }
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <div>
              <Title order={4}>Sales</Title>
              <Text c="dimmed" size="sm">
                Default sales document options.
              </Text>
            </div>
            <Switch
              label="Tax included by default"
              checked={Boolean(formState["feature.sales.tax_included_default"])}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  "feature.sales.tax_included_default": event.currentTarget.checked
                }))
              }
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <div>
              <Title order={4}>Accounting</Title>
              <Text c="dimmed" size="sm">
                Control fiscal year constraints for postings.
              </Text>
            </div>
            <Switch
              label="Allow multiple open fiscal years"
              checked={Boolean(formState["accounting.allow_multiple_open_fiscal_years"])}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  "accounting.allow_multiple_open_fiscal_years": event.currentTarget.checked
                }))
              }
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <div>
              <Title order={4}>Inventory</Title>
              <Text c="dimmed" size="sm">
                Default inventory behavior settings.
              </Text>
            </div>
            <Switch
              label="Allow backorders"
              checked={Boolean(formState["feature.inventory.allow_backorder"])}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  "feature.inventory.allow_backorder": event.currentTarget.checked
                }))
              }
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <div>
              <Title order={4}>Purchasing</Title>
              <Text c="dimmed" size="sm">
                Approval requirements for purchasing workflows.
              </Text>
            </div>
            <Switch
              label="Require approval"
              checked={Boolean(formState["feature.purchasing.require_approval"])}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  "feature.purchasing.require_approval": event.currentTarget.checked
                }))
              }
            />
          </Stack>
        </Card>

        <Group justify="flex-end" wrap="wrap">
          {saveError ? (
            <Alert color="red" title="Save failed">
              {saveError}
            </Alert>
          ) : null}
          {saveSuccess ? (
            <Alert color="green" title="Saved">
              Outlet settings updated.
            </Alert>
          ) : null}
          <Button onClick={handleSave} loading={saving} disabled={loading || !outletId}>
            Save changes
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
