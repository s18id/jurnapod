import { useEffect, useState } from "react";
import { db } from "../lib/offline-db";

const boxStyle = {
  border: "1px solid #e2ddd2",
  borderRadius: "10px",
  padding: "16px",
  backgroundColor: "#fcfbf8",
  marginBottom: "14px"
} as const;

const buttonStyle = {
  border: "1px solid #cabfae",
  borderRadius: "6px",
  padding: "8px 12px",
  backgroundColor: "#fff",
  cursor: "pointer",
  marginRight: "8px"
} as const;

const dangerButtonStyle = {
  ...buttonStyle,
  backgroundColor: "#d32f2f",
  color: "#fff",
  border: "1px solid #d32f2f"
} as const;

export function PWASettingsPage() {
  const [cacheSize, setCacheSize] = useState(0);
  const [queueCount, setQueueCount] = useState(0);

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
    <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ marginBottom: "8px" }}>PWA Settings</h1>
        <p style={{ color: "#666", margin: 0 }}>
          Manage offline cache and queued transactions.
        </p>
      </div>

      <section style={boxStyle}>
        <h2 style={{ marginTop: 0 }}>Storage</h2>
        <p>Estimated cache size: {(cacheSize / 1024).toFixed(2)} KB</p>
        <button type="button" style={buttonStyle} onClick={clearCache}>
          Clear Cached Master Data
        </button>
      </section>

      <section style={boxStyle}>
        <h2 style={{ marginTop: 0 }}>Queue</h2>
        <p>Queued transactions: {queueCount}</p>
        <button type="button" style={dangerButtonStyle} onClick={clearQueue}>
          Clear Queue
        </button>
      </section>
    </div>
  );
}
