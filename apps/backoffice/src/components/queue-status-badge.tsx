import { useEffect, useState } from "react";
import { OutboxService } from "../lib/outbox-service";
import { useOnlineStatus } from "../lib/connection";

export function QueueStatusBadge() {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);

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
    </span>
  );
}
