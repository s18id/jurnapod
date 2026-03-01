import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Container,
  Group,
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

type ModulesPageProps = {
  user: SessionUser;
  accessToken: string;
};

type ModulesResponse = {
  ok: true;
  modules: Array<{
    code: string;
    name: string;
    description?: string | null;
    enabled: boolean;
    config_json: string;
  }>;
};

type ModulesSaveResponse = {
  ok: true;
};

type ModuleRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  configPairs: ConfigPair[];
};

type ConfigPair = {
  id: string;
  key: string;
  value: string;
};

type RowError = {
  pairs?: Record<string, PairError>;
};

type PairError = {
  key?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function valueToString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function flattenConfigToPairs(config: unknown, prefix = ""): Array<{ key: string; value: string }> {
  if (!isPlainObject(config)) {
    return [];
  }

  const entries = Object.entries(config).sort(([a], [b]) => a.localeCompare(b));
  const result: Array<{ key: string; value: string }> = [];

  for (const [key, value] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      const nestedKeys = Object.keys(value);
      if (nestedKeys.length === 0) {
        result.push({ key: path, value: "{}" });
      } else {
        result.push(...flattenConfigToPairs(value, path));
      }
      continue;
    }

    result.push({ key: path, value: valueToString(value) });
  }

  return result;
}

function parseConfigJson(configJson: string): unknown {
  const trimmed = configJson.trim();
  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return {};
  }
}

function createPairsFromConfig(configJson: string): ConfigPair[] {
  const parsed = parseConfigJson(configJson);
  const pairs = flattenConfigToPairs(parsed);
  return pairs.map((pair) => ({
    id: crypto.randomUUID(),
    key: pair.key,
    value: pair.value
  }));
}

function createPair(): ConfigPair {
  return {
    id: crypto.randomUUID(),
    key: "",
    value: ""
  };
}

function parseValue(rawValue: string): unknown {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function setNestedValue(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cursor: Record<string, unknown> = target;

  parts.forEach((part, index) => {
    const isLast = index === parts.length - 1;
    if (isLast) {
      cursor[part] = value;
      return;
    }

    const next = cursor[part];
    if (!isPlainObject(next)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  });
}

function buildConfigJson(pairs: ConfigPair[]): string {
  if (!pairs || pairs.length === 0) {
    return "{}";
  }

  const config: Record<string, unknown> = {};
  for (const pair of pairs) {
    const key = pair.key.trim();
    if (!key) {
      continue;
    }
    setNestedValue(config, key, parseValue(pair.value));
  }

  return JSON.stringify(config);
}

function isValidDotKey(key: string): boolean {
  const parts = key.split(".");
  return parts.every((part) => part.trim().length > 0);
}

const DEFAULT_CONFIG_PAIRS: Record<string, Array<{ key: string; value: string }>> = {
  pos: [{ key: "payment_methods", value: "[\"CASH\"]" }],
  inventory: [{ key: "level", value: "0" }]
};

function createRow(moduleEntry: ModulesResponse["modules"][number]): ModuleRow {
  return {
    id: crypto.randomUUID(),
    code: moduleEntry.code,
    name: moduleEntry.name,
    description: moduleEntry.description ?? null,
    enabled: moduleEntry.enabled,
    configPairs: createPairsFromConfig(moduleEntry.config_json || "{}")
  };
}

function validateRows(rows: ModuleRow[]) {
  const errors: Record<string, RowError> = {};

  rows.forEach((row) => {
    if (row.configPairs.length === 0) {
      return;
    }

    const pairErrors: Record<string, PairError> = {};
    const seenKeys = new Set<string>();

    row.configPairs.forEach((pair) => {
      const key = pair.key.trim();
      if (!key) {
        pairErrors[pair.id] = { ...pairErrors[pair.id], key: "Key is required" };
        return;
      }

      if (!isValidDotKey(key)) {
        pairErrors[pair.id] = { ...pairErrors[pair.id], key: "Invalid key" };
        return;
      }

      if (seenKeys.has(key)) {
        pairErrors[pair.id] = { ...pairErrors[pair.id], key: "Duplicate key" };
        return;
      }

      seenKeys.add(key);
    });

    if (Object.keys(pairErrors).length > 0) {
      errors[row.id] = { pairs: pairErrors };
    }
  });

  return errors;
}

export function ModulesPage({ accessToken }: ModulesPageProps) {
  const isOnline = useOnlineStatus();
  const [rows, setRows] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, RowError>>({});

  const hasRows = rows.length > 0;

  useEffect(() => {
    async function fetchModules() {
      setLoading(true);
      setError(null);
      setSaveSuccess(false);
      try {
        const response = await apiRequest<ModulesResponse>(
          "/settings/modules",
          {},
          accessToken
        );
        const nextRows = response.modules.map((moduleEntry) => createRow(moduleEntry));
        setRows(nextRows);
        setRowErrors({});
      } catch (fetchError) {
        if (fetchError instanceof ApiError) {
          setError(fetchError.message);
        } else {
          setError("Failed to load modules");
        }
      } finally {
        setLoading(false);
      }
    }

    fetchModules().catch(() => setError("Failed to load modules"));
  }, [accessToken]);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Modules"
        message="Module changes require a connection."
      />
    );
  }

  function updateRow(rowId: string, patch: Partial<ModuleRow>) {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
    if (rowErrors[rowId]) {
      setRowErrors((prev) => ({ ...prev, [rowId]: {} }));
    }
    setSaveSuccess(false);
  }

  function updatePair(rowId: string, pairId: string, patch: Partial<ConfigPair>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        return {
          ...row,
          configPairs: row.configPairs.map((pair) =>
            pair.id === pairId ? { ...pair, ...patch } : pair
          )
        };
      })
    );

    const rowError = rowErrors[rowId];
    if (rowError?.pairs?.[pairId]) {
      setRowErrors((prev) => {
        const next = { ...prev };
        const pairs = { ...next[rowId].pairs };
        delete pairs[pairId];
        if (Object.keys(pairs).length === 0) {
          delete next[rowId];
        } else {
          next[rowId] = { pairs };
        }
        return next;
      });
    }

    setSaveSuccess(false);
  }

  function addPair(rowId: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, configPairs: [...row.configPairs, createPair()] }
          : row
      )
    );
    setSaveSuccess(false);
  }

  function removePair(rowId: string, pairId: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, configPairs: row.configPairs.filter((pair) => pair.id !== pairId) }
          : row
      )
    );

    setRowErrors((prev) => {
      const next = { ...prev };
      const rowError = next[rowId];
      if (!rowError?.pairs) {
        return prev;
      }
      const pairs = { ...rowError.pairs };
      delete pairs[pairId];
      if (Object.keys(pairs).length === 0) {
        delete next[rowId];
      } else {
        next[rowId] = { pairs };
      }
      return next;
    });

    setSaveSuccess(false);
  }

  function applyDefaults(rowId: string, moduleCode: string) {
    const defaults = DEFAULT_CONFIG_PAIRS[moduleCode];
    if (!defaults || defaults.length === 0) {
      return;
    }

    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const existingKeys = new Set(
          row.configPairs.map((pair) => pair.key.trim()).filter((key) => key.length > 0)
        );
        const nextPairs = defaults
          .filter((pair) => !existingKeys.has(pair.key))
          .map((pair) => ({
            id: crypto.randomUUID(),
            key: pair.key,
            value: pair.value
          }));

        if (nextPairs.length === 0) {
          return row;
        }

        return {
          ...row,
          configPairs: [...row.configPairs, ...nextPairs]
        };
      })
    );

    setSaveSuccess(false);
  }

  async function handleSave() {
    setSaveError(null);
    const errors = validateRows(rows);
    setRowErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSaveError("Resolve validation errors before saving.");
      return;
    }

    setSaving(true);
    setSaveSuccess(false);
    try {
      await apiRequest<ModulesSaveResponse>(
        "/settings/modules",
        {
          method: "PUT",
          body: JSON.stringify({
            modules: rows.map((row) => ({
              code: row.code,
              enabled: row.enabled,
              config_json: buildConfigJson(row.configPairs)
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
        setSaveError("Failed to save modules");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Title order={2}>Modules</Title>
            <Text c="dimmed" size="sm">
              Enable modules and configure their settings.
            </Text>
          </div>
          <Button onClick={handleSave} loading={saving} variant="light">
            Save Modules
          </Button>
        </Group>

        {loading ? (
          <Text size="sm" c="dimmed">
            Loading modules...
          </Text>
        ) : null}

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
            Modules updated successfully.
          </Alert>
        ) : null}

        {!loading && !error && !hasRows ? (
          <Text size="sm" c="dimmed">
            No modules found yet.
          </Text>
        ) : null}

        <Stack gap="md">
          {rows.map((row) => {
            const rowError = rowErrors[row.id];
            const pairErrors = rowError?.pairs ?? {};
            return (
              <Card key={row.id} withBorder>
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start" wrap="wrap">
                    <div>
                      <Text fw={600}>{row.name}</Text>
                      {row.description ? (
                        <Text c="dimmed" size="xs">
                          {row.description}
                        </Text>
                      ) : null}
                      <Text c="dimmed" size="xs">
                        Code: {row.code}
                      </Text>
                    </div>
                    <Switch
                      label="Enabled"
                      checked={row.enabled}
                      onChange={(event) =>
                        updateRow(row.id, { enabled: event.currentTarget.checked })
                      }
                    />
                  </Group>
                  <Stack gap="xs">
                    <Group justify="space-between" align="center" wrap="wrap">
                      <Text fw={500} size="sm">
                        Config (dot notation)
                      </Text>
                      <Group gap="xs">
                        {DEFAULT_CONFIG_PAIRS[row.code] ? (
                          <Button
                            size="xs"
                            variant="subtle"
                            onClick={() => applyDefaults(row.id, row.code)}
                          >
                            Use Defaults
                          </Button>
                        ) : null}
                        <Button size="xs" variant="light" onClick={() => addPair(row.id)}>
                          Add Entry
                        </Button>
                      </Group>
                    </Group>
                    <Text size="xs" c="dimmed">
                      Keys use dot notation (e.g. tax.rate). Values accept JSON literals like true, 10,
                      ["CASH"], or a JSON object and fall back to strings when invalid.
                    </Text>
                    {row.configPairs.length === 0 ? (
                      <Text size="xs" c="dimmed">
                        No config entries yet.
                      </Text>
                    ) : null}
                    {row.configPairs.map((pair) => (
                      <Group key={pair.id} align="flex-end" wrap="wrap">
                        <TextInput
                          label="Key"
                          placeholder="tax.rate"
                          value={pair.key}
                          error={pairErrors[pair.id]?.key}
                          onChange={(event) =>
                            updatePair(row.id, pair.id, { key: event.currentTarget.value })
                          }
                          style={{ flexGrow: 1, minWidth: 180 }}
                        />
                        <TextInput
                          label="Value"
                          placeholder='e.g. 10, true, ["CASH"]'
                          value={pair.value}
                          onChange={(event) =>
                            updatePair(row.id, pair.id, { value: event.currentTarget.value })
                          }
                          style={{ flexGrow: 1, minWidth: 200 }}
                        />
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={() => removePair(row.id, pair.id)}
                        >
                          Remove
                        </Button>
                      </Group>
                    ))}
                  </Stack>
                </Stack>
              </Card>
            );
          })}
        </Stack>
      </Stack>
    </Container>
  );
}
