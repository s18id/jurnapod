import { useEffect, useState } from "react";
import { Button, Card, Container, Group, Select, Stack, Text, Title } from "@mantine/core";
import { THEME_OPTIONS, type ThemeVariant } from "../app/theme";
import { useThemeVariant } from "../app/theme-provider";
import { db } from "../lib/offline-db";

export function PWASettingsPage() {
  const [cacheSize, setCacheSize] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const { variant, setVariant } = useThemeVariant();

  useEffect(() => {
    async function estimateStorage() {
      if ("storage" in navigator && "estimate" in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        setCacheSize(estimate.usage ?? 0);
      }
      const count = await db.outbox.count();
      setQueueCount(count);
    }

    estimateStorage().catch(() => undefined);
  }, []);

  async function clearCache() {
    if (!window.confirm("Clear all cached master data? You will need internet to reload.")) {
      return;
    }
    await db.masterDataCache.clear();
    window.location.reload();
  }

  async function clearQueue() {
    const count = await db.outbox.count();
    if (!window.confirm(`Delete all ${count} queued transactions? This cannot be undone.`)) {
      return;
    }
    await db.outbox.clear();
    setQueueCount(0);
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <div>
          <Title order={2}>PWA Settings</Title>
          <Text c="dimmed" size="sm">
            Manage offline cache and queued transactions.
          </Text>
        </div>

        <Card>
          <Stack gap="sm">
            <div>
              <Title order={4}>Appearance</Title>
              <Text c="dimmed" size="sm">
                Choose a theme for the backoffice experience.
              </Text>
            </div>
            <Select
              data={THEME_OPTIONS}
              label="Theme"
              value={variant}
              onChange={(value) => {
                if (value) {
                  setVariant(value as ThemeVariant);
                }
              }}
              maxDropdownHeight={200}
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="sm">
            <div>
              <Title order={4}>Storage</Title>
              <Text c="dimmed" size="sm">
                Estimated cache size: {(cacheSize / 1024).toFixed(2)} KB
              </Text>
            </div>
            <Group gap="sm" wrap="wrap">
              <Button variant="light" onClick={clearCache}>
                Clear Cached Master Data
              </Button>
            </Group>
          </Stack>
        </Card>

        <Card>
          <Stack gap="sm">
            <div>
              <Title order={4}>Queue</Title>
              <Text c="dimmed" size="sm">
                Queued transactions: {queueCount}
              </Text>
            </div>
            <Group gap="sm" wrap="wrap">
              <Button color="red" onClick={clearQueue}>
                Clear Queue
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
