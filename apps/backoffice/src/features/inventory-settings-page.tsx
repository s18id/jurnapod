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

type InventorySettingsPageProps = {
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
  "inventory.low_stock_threshold",
  "inventory.reorder_point",
  "inventory.allow_negative_stock",
  "inventory.costing_method",
  "inventory.warn_on_negative"
] as const;

const DEFAULT_SETTINGS: Record<(typeof SETTINGS_KEYS)[number], number | boolean | string> = {
  "inventory.low_stock_threshold": 5,
  "inventory.reorder_point": 10,
  "inventory.allow_negative_stock": false,
  "inventory.costing_method": "AVG",
  "inventory.warn_on_negative": true
};

function buildOutletOptions(outlets: SessionUser["outlets"]) {
  return outlets.map((outlet) => ({
    value: String(outlet.id),
    label: `${outlet.code} - ${outlet.name}`
  }));
}

export function InventorySettingsPage({ user, accessToken }: InventorySettingsPageProps) {
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
          setError("Failed to load inventory settings");
        }
      } finally {
        setLoading(false);
      }
    }

    fetchSettings().catch(() => setError("Failed to load inventory settings"));
  }, [outletId, accessToken]);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Inventory Settings"
        message="Inventory setting changes require a connection."
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
        setSaveError("Failed to save inventory settings");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <div>
          <Title order={2}>Inventory Settings</Title>
          <Text c="dimmed" size="sm">
            Configure per-outlet inventory thresholds and costing behavior.
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
              <Title order={4}>Stock thresholds</Title>
              <Text c="dimmed" size="sm">
                Decide when to warn and when to reorder inventory.
              </Text>
            </div>
            <NumberInput
              label="Low stock threshold"
              description="Warn when stock falls below this number."
              min={0}
              value={Number(formState["inventory.low_stock_threshold"] ?? 0)}
              onChange={(value) =>
                setFormState((prev) => ({
                  ...prev,
                  "inventory.low_stock_threshold": Number(value) || 0
                }))
              }
            />
            <NumberInput
              label="Reorder point"
              description="Target stock level to reorder."
              min={0}
              value={Number(formState["inventory.reorder_point"] ?? 0)}
              onChange={(value) =>
                setFormState((prev) => ({
                  ...prev,
                  "inventory.reorder_point": Number(value) || 0
                }))
              }
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <div>
              <Title order={4}>Stock behavior</Title>
              <Text c="dimmed" size="sm">
                Control negative stock and costing calculations.
              </Text>
            </div>
            <Switch
              label="Allow negative stock"
              checked={Boolean(formState["inventory.allow_negative_stock"])}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  "inventory.allow_negative_stock": event.currentTarget.checked
                }))
              }
            />
            <Switch
              label="Warn on negative stock"
              checked={Boolean(formState["inventory.warn_on_negative"])}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  "inventory.warn_on_negative": event.currentTarget.checked
                }))
              }
            />
            <Select
              label="Costing method"
              data={[
                { value: "AVG", label: "Average" },
                { value: "FIFO", label: "FIFO" },
                { value: "LIFO", label: "LIFO" }
              ]}
              value={String(formState["inventory.costing_method"] ?? "AVG")}
              onChange={(value) =>
                setFormState((prev) => ({
                  ...prev,
                  "inventory.costing_method": value ?? "AVG"
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
              Inventory settings updated.
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
