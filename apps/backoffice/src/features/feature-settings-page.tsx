// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
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
import type { SessionUser } from "../lib/session";
import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import { OfflinePage } from "../components/offline-page";

type FeatureSettingsPageProps = {
  user: SessionUser;
  accessToken: string;
};

type SettingsResponse = {
  ok: true;
  outlet_id: number;
  settings: Array<{
    key: string;
    value: number | boolean | string;
    value_type: string;
  }>;
};

type SettingsSaveResponse = {
  ok: true;
};

const SETTINGS_KEYS = [
  "feature.pos.auto_sync_enabled",
  "feature.pos.sync_interval_seconds",
  "feature.sales.tax_included_default",
  "feature.inventory.allow_backorder",
  "feature.purchasing.require_approval"
] as const;

const DEFAULT_SETTINGS: Record<(typeof SETTINGS_KEYS)[number], number | boolean | string> = {
  "feature.pos.auto_sync_enabled": true,
  "feature.pos.sync_interval_seconds": 60,
  "feature.sales.tax_included_default": false,
  "feature.inventory.allow_backorder": false,
  "feature.purchasing.require_approval": true
};

function buildOutletOptions(outlets: SessionUser["outlets"]) {
  return outlets.map((outlet) => ({
    value: String(outlet.id),
    label: `${outlet.code} - ${outlet.name}`
  }));
}

export function FeatureSettingsPage({ user, accessToken }: FeatureSettingsPageProps) {
  const isOnline = useOnlineStatus();
  const outletOptions = useMemo(() => buildOutletOptions(user.outlets), [user.outlets]);
  const [outletId, setOutletId] = useState<number>(user.outlets[0]?.id ?? 0);
  const [formState, setFormState] = useState<Record<string, number | boolean | string>>({
    ...DEFAULT_SETTINGS
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
        const keysParam = SETTINGS_KEYS.join(",");
        const response = await apiRequest<SettingsResponse>(
          `/settings/config?outlet_id=${outletId}&keys=${encodeURIComponent(keysParam)}`,
          {},
          accessToken
        );
        const nextState: Record<string, number | boolean | string> = { ...DEFAULT_SETTINGS };
        response.settings.forEach((setting) => {
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
  }, [outletId, accessToken]);

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
        },
        accessToken
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
