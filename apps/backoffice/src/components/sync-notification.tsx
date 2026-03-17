// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useState } from "react";
import { Paper, Text, useMantineTheme, Stack, Anchor, Group } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { SyncService, type SyncResult } from "../lib/sync-service";

type SyncNotificationProps = {
  accessToken: string;
  userId: number;
};

// Track which entity types were synced for navigation links
interface SyncedTypes {
  items: boolean;
  prices: boolean;
}

export function SyncNotification({ accessToken, userId }: SyncNotificationProps) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [syncedTypes, setSyncedTypes] = useState<SyncedTypes>({ items: false, prices: false });
  const theme = useMantineTheme();

  useEffect(() => {
    let timeoutId: number | null = null;

    async function handleSync() {
      setSyncing(true);
      const nextResult = await SyncService.syncAll(accessToken, userId);
      setSyncing(false);
      
      // Track which types were synced (check for item/price related sync types)
      const types: SyncedTypes = { items: false, prices: false };
      // Note: In a real implementation, SyncService.syncAll would return types
      // For now, we infer from sync history or assume false
      // This can be enhanced when SyncService provides detailed type info
      
      if (nextResult.success > 0 || nextResult.failed > 0 || nextResult.conflicts > 0) {
        setResult(nextResult);
        setSyncedTypes(types);
        timeoutId = window.setTimeout(() => {
          setResult(null);
          setSyncedTypes({ items: false, prices: false });
        }, 8000); // Longer timeout to allow link clicks
      }
    }

    const onlineHandler = () => {
      handleSync().catch(() => undefined);
    };

    window.addEventListener("online", onlineHandler);

    return () => {
      window.removeEventListener("online", onlineHandler);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [accessToken, userId]);

  if (!syncing && !result) {
    return null;
  }

  const backgroundColor = syncing ? theme.colors.yellow[1] : theme.colors.green[1];
  const borderColor = syncing ? theme.colors.yellow[3] : theme.colors.green[3];
  const textColor = syncing ? theme.colors.yellow[9] : theme.colors.green[9];

  const handleViewItems = () => {
    window.location.hash = "#/items";
    setResult(null);
  };

  const handleViewPrices = () => {
    window.location.hash = "#/prices";
    setResult(null);
  };

  return (
    <Paper
      withBorder
      shadow="md"
      p="sm"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        backgroundColor,
        borderColor,
        color: textColor,
        zIndex: 9999,
        minWidth: 280
      }}
    >
      <Stack gap="xs">
        <Text size="sm" fw={600} style={{ color: textColor }}>
          {syncing && "Syncing queued transactions..."}
          {!syncing && result && (
            <span>
              Sync complete: {result.success} synced
              {result.conflicts > 0 ? `, ${result.conflicts} conflicts` : ""}
              {result.failed > 0 ? `, ${result.failed} failed` : ""}
            </span>
          )}
        </Text>
        
        {/* Navigation links for synced data */}
        {!syncing && result && result.success > 0 && (
          <Stack gap={4} mt={4}>
            <Text size="xs" c="dimmed">View synced data:</Text>
            <Group gap="xs">
              <Anchor
                size="xs"
                onClick={handleViewItems}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                Items <IconExternalLink size={12} />
              </Anchor>
              <Text size="xs" c="dimmed">|</Text>
              <Anchor
                size="xs"
                onClick={handleViewPrices}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                Prices <IconExternalLink size={12} />
              </Anchor>
            </Group>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
