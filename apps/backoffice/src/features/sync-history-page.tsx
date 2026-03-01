// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useState } from "react";
import { db, type SyncHistory } from "../lib/offline-db";

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

export function SyncHistoryPage() {
  const [history, setHistory] = useState<SyncHistory[]>([]);

  useEffect(() => {
    async function loadHistory() {
      const logs = await db.syncHistory.orderBy("timestamp").reverse().limit(50).toArray();
      setHistory(logs);
    }

    loadHistory().catch(() => undefined);
  }, []);

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ marginBottom: "8px" }}>Sync History</h1>
        <p style={{ color: "#666", margin: 0 }}>
          Recent sync actions for offline transactions.
        </p>
      </div>

      <div style={boxStyle}>
        {history.length === 0 ? (
          <p style={{ color: "#666" }}>No sync history yet.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ backgroundColor: "#f5f1ea" }}>
                <th style={{ ...cellStyle, textAlign: "left" }}>Time</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Action</th>
                <th style={{ ...cellStyle, textAlign: "right" }}>Items</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {history.map((log) => (
                <tr key={log.id}>
                  <td style={cellStyle}>{new Date(log.timestamp).toLocaleString("id-ID")}</td>
                  <td style={cellStyle}>{log.action}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>{log.itemCount}</td>
                  <td style={cellStyle}>{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
