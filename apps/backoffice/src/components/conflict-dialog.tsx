import type { OutboxItem } from "../lib/offline-db";

type ConflictDialogProps = {
  item: OutboxItem;
  onResolve: (action: "keep" | "discard" | "edit") => void;
  onClose: () => void;
};

const overlayStyle = {
  position: "fixed" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10000
};

const dialogStyle = {
  backgroundColor: "#fff",
  borderRadius: "10px",
  padding: "24px",
  width: "90%",
  maxWidth: "520px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)"
} as const;

const buttonStyle = {
  border: "1px solid #cabfae",
  borderRadius: "6px",
  padding: "8px 12px",
  backgroundColor: "#fff",
  cursor: "pointer"
} as const;

const dangerButtonStyle = {
  ...buttonStyle,
  backgroundColor: "#d32f2f",
  color: "#fff",
  border: "1px solid #d32f2f"
} as const;

export function ConflictDialog({ item, onResolve, onClose }: ConflictDialogProps) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(event) => event.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Transaction Needs Attention</h2>
        <p style={{ color: "#721c24", marginBottom: "12px" }}>
          ⚠️ Data changed while you were offline.
        </p>
        <div style={{ marginBottom: "16px", fontSize: "14px" }}>
          <div><strong>Type:</strong> {item.type}</div>
          <div><strong>Created:</strong> {new Date(item.timestamp).toLocaleString("id-ID")}</div>
          {item.error ? <div><strong>Error:</strong> {item.error}</div> : null}
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" style={buttonStyle} onClick={() => onResolve("edit")}>
            Edit Transaction
          </button>
          <button type="button" style={buttonStyle} onClick={() => onResolve("keep")}>
            Keep in Queue
          </button>
          <button type="button" style={dangerButtonStyle} onClick={() => onResolve("discard")}>
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
