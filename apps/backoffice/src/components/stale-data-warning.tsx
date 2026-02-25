import { useEffect, useState } from "react";
import { db } from "../lib/offline-db";
import { useOnlineStatus } from "../lib/connection";

type StaleDataWarningProps = {
  cacheKey: string;
  label: string;
};

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export function StaleDataWarning({ cacheKey, label }: StaleDataWarningProps) {
  const isOnline = useOnlineStatus();
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadStatus() {
      const cached = await db.masterDataCache.get(cacheKey);
      if (!isMounted) return;
      if (!cached) {
        setLastSync(null);
        setIsStale(false);
        return;
      }
      setLastSync(new Date(cached.lastSync));
      setIsStale(new Date(cached.expiresAt).getTime() <= Date.now());
    }

    loadStatus().catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [cacheKey, isOnline]);

  if (!lastSync || !isStale) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: "8px",
        padding: "8px 12px",
        borderRadius: "8px",
        backgroundColor: "#fff3cd",
        color: "#856404",
        border: "1px solid #ffeeba",
        fontSize: "13px"
      }}
    >
      ⚠️ Viewing cached {label} (last synced {formatRelativeTime(lastSync)}). Connect to refresh.
    </div>
  );
}
