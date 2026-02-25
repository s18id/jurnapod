import { useEffect, useState } from "react";
import { OutboxService } from "../lib/outbox-service";
import { SyncService } from "../lib/sync-service";
import { useOnlineStatus } from "../lib/connection";

type QueueStatusBadgeProps = {
  accessToken?: string | null;
};

export function QueueStatusBadge({ accessToken }: QueueStatusBadgeProps) {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function refreshCount() {
      const count = await OutboxService.getPendingCount();
      if (isMounted) {
        setPendingCount(count);
      }
    }

    refreshCount().catch(() => undefined);
    const intervalId = window.setInterval(() => {
      refreshCount().catch(() => undefined);
    }, 10000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  async function handleManualSync() {
    if (!accessToken) {
      return;
    }
    setSyncing(true);
    await SyncService.syncAll(accessToken).catch(() => undefined);
    setSyncing(false);
    const count = await OutboxService.getPendingCount();
    setPendingCount(count);
  }

  if (pendingCount === 0) {
    return null;
  }

  return (
    <span
      style={{
        marginLeft: "8px",
        padding: "4px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        backgroundColor: isOnline ? "#fff3cd" : "#f8d7da",
        color: isOnline ? "#856404" : "#721c24",
        border: `1px solid ${isOnline ? "#ffeeba" : "#f5c6cb"}`
      }}
    >
      {isOnline ? `Queue: ${pendingCount}` : `Offline queue: ${pendingCount}`}
      {isOnline && accessToken ? (
        <button
          type="button"
          onClick={handleManualSync}
          disabled={syncing}
          style={{
            marginLeft: "8px",
            border: "1px solid #cabfae",
            borderRadius: "999px",
            padding: "2px 8px",
            backgroundColor: "#fff",
            cursor: syncing ? "not-allowed" : "pointer",
            fontSize: "11px"
          }}
        >
          {syncing ? "Syncing..." : "Sync now"}
        </button>
      ) : null}
    </span>
  );
}
