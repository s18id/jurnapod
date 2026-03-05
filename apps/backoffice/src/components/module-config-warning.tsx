// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useOnlineStatus } from "../lib/connection";

type ModuleConfigWarningProps = {
  source: "cached" | "empty";
};

export function ModuleConfigWarning({ source }: ModuleConfigWarningProps) {
  const isOnline = useOnlineStatus();

  let message = "";
  if (source === "cached") {
    message = isOnline
      ? "Using cached module configuration while reconnecting. Some sections may be unavailable."
      : "Using cached module configuration. Connect to refresh.";
  } else {
    message = isOnline
      ? "Module configuration unavailable. Module-gated sections are disabled until refresh."
      : "Module configuration unavailable while offline. Module-gated sections are disabled until you reconnect.";
  }

  return (
    <div
      style={{
        marginBottom: "12px",
        padding: "10px 12px",
        borderRadius: "8px",
        backgroundColor: "#fff3cd",
        color: "#856404",
        border: "1px solid #ffeeba",
        fontSize: "13px"
      }}
    >
      {message}
    </div>
  );
}
