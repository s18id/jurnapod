import { useEffect, useState } from "react";
import { OutboxService } from "../lib/outbox-service";
import type { OutboxItem } from "../lib/offline-db";

const boxStyle = {
  border: "1px solid #e2ddd2",
  borderRadius: "10px",
  padding: "16px",
  backgroundColor: "#fcfbf8",
  marginBottom: "14px"
} as const;

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const
};

const cellStyle = {
  borderBottom: "1px solid #ece7dc",
  padding: "8px"
} as const;

const buttonStyle = {
  border: "1px solid #cabfae",
  borderRadius: "6px",
  padding: "6px 12px",
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

function formatDateTime(value: Date) {
  return new Date(value).toLocaleString("id-ID");
}

export function SyncQueuePage() {
  const [queue, setQueue] = useState<OutboxItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadQueue() {
    setLoading(true);
    try {
      const items = await OutboxService.getAllItems();
      setQueue(items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQueue().catch(() => undefined);
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm("Discard this queued transaction?")) {
      return;
    }
    await OutboxService.deleteItem(id);
    await loadQueue();
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ marginBottom: "8px" }}>Sync Queue</h1>
        <p style={{ color: "#666", margin: 0 }}>
          Transactions saved offline and pending sync.
        </p>
      </div>

      <div style={boxStyle}>
        {loading ? (
          <p>Loading queue...</p>
        ) : queue.length === 0 ? (
          <p style={{ color: "#666" }}>No queued transactions.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ backgroundColor: "#f5f1ea" }}>
                <th style={{ ...cellStyle, textAlign: "left" }}>Type</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Created</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Status</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Error</th>
                <th style={{ ...cellStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item) => (
                <tr key={item.id}>
                  <td style={cellStyle}>{item.type}</td>
                  <td style={cellStyle}>{formatDateTime(item.timestamp)}</td>
                  <td style={cellStyle}>{item.status}</td>
                  <td style={cellStyle}>{item.error ?? "-"}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    <button type="button" style={dangerButtonStyle} onClick={() => handleDelete(item.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
