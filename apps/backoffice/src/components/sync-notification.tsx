import { useEffect, useState } from "react";
import { SyncService, type SyncResult } from "../lib/sync-service";

type SyncNotificationProps = {
  accessToken: string;
};

export function SyncNotification({ accessToken }: SyncNotificationProps) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

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

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        backgroundColor: syncing ? "#fff3cd" : "#d4edda",
        color: syncing ? "#856404" : "#155724",
        border: `1px solid ${syncing ? "#ffeeba" : "#c3e6cb"}`,
        padding: "12px 16px",
        borderRadius: "10px",
        boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
        zIndex: 9999,
        minWidth: "240px",
        fontSize: "13px",
        fontWeight: 600
      }}
    >
      {syncing && "Syncing queued transactions..."}
      {!syncing && result && (
        <span>
          Sync complete: {result.success} synced
          {result.conflicts > 0 ? `, ${result.conflicts} conflicts` : ""}
          {result.failed > 0 ? `, ${result.failed} failed` : ""}
        </span>
      )}
    </div>
  );
}
