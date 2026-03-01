import { useEffect, useState } from "react";
import { Paper, Text, useMantineTheme } from "@mantine/core";
import { SyncService, type SyncResult } from "../lib/sync-service";

type SyncNotificationProps = {
  accessToken: string;
};

export function SyncNotification({ accessToken }: SyncNotificationProps) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const theme = useMantineTheme();

  useEffect(() => {
    let timeoutId: number | null = null;

    async function handleSync() {
      setSyncing(true);
      const nextResult = await SyncService.syncAll(accessToken);
      setSyncing(false);
      if (nextResult.success > 0 || nextResult.failed > 0 || nextResult.conflicts > 0) {
        setResult(nextResult);
        timeoutId = window.setTimeout(() => setResult(null), 5000);
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
  }, [accessToken]);

  if (!syncing && !result) {
    return null;
  }

  const backgroundColor = syncing ? theme.colors.yellow[1] : theme.colors.green[1];
  const borderColor = syncing ? theme.colors.yellow[3] : theme.colors.green[3];
  const textColor = syncing ? theme.colors.yellow[9] : theme.colors.green[9];

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
        minWidth: 240
      }}
    >
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
    </Paper>
  );
}
