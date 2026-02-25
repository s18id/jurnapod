type OfflinePageProps = {
  title: string;
  message: string;
};

const containerStyle = {
  padding: "28px",
  borderRadius: "12px",
  backgroundColor: "#fff3cd",
  border: "1px solid #ffeeba",
  color: "#856404",
  textAlign: "center" as const
};

export function OfflinePage({ title, message }: OfflinePageProps) {
  return (
    <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
      <div style={containerStyle}>
        <div style={{ fontSize: "28px", marginBottom: "8px" }}>⚠️</div>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <p style={{ marginBottom: 0 }}>{message}</p>
      </div>
    </div>
  );
}
