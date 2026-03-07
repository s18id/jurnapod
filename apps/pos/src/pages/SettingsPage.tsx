// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { Button } from "../shared/components/index.js";
import { SyncControls } from "../features/sync/SyncControls.js";
import { usePosAppState } from "../router/pos-app-state.js";

interface SettingsPageProps {
  context: WebBootstrapContext;
  onLogout: () => void;
}

export function SettingsPage({ context: _context, onLogout }: SettingsPageProps): JSX.Element {
  const {
    scope,
    pullSyncInFlight,
    pushSyncInFlight,
    pullSyncMessage,
    pushSyncMessage,
    lastDataVersion,
    runSyncPullNow,
    runSyncPushNow
  } = usePosAppState();

  const containerStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "16px"
  };

  const sectionStyles: React.CSSProperties = {
    marginBottom: "24px"
  };

  const sectionTitleStyles: React.CSSProperties = {
    fontSize: "16px",
    fontWeight: 700,
    marginBottom: "12px",
    color: "#1f2937"
  };

  const infoRowStyles: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    padding: "12px 0",
    borderBottom: "1px solid #e5e7eb"
  };

  const labelStyles: React.CSSProperties = {
    color: "#6b7280"
  };

  const valueStyles: React.CSSProperties = {
    fontWeight: 500
  };

  return (
    <div style={containerStyles}>
      <h1 style={{ margin: "0 0 24px", fontSize: "20px", fontWeight: 700 }}>Settings</h1>

      <section style={sectionStyles}>
        <h2 style={sectionTitleStyles}>Sync</h2>
        <SyncControls
          pushInFlight={pushSyncInFlight}
          pullInFlight={pullSyncInFlight}
          lastDataVersion={lastDataVersion}
          onPushSync={() => {
            void runSyncPushNow();
          }}
          onPullSync={() => {
            void runSyncPullNow();
          }}
        />

        {pullSyncMessage && (
          <p style={{ marginTop: "12px", fontSize: "14px", color: "#6b7280" }}>
            {pullSyncMessage}
          </p>
        )}
        {pushSyncMessage && (
          <p style={{ marginTop: "12px", fontSize: "14px", color: "#6b7280" }}>
            {pushSyncMessage}
          </p>
        )}
      </section>

      <section style={sectionStyles}>
        <h2 style={sectionTitleStyles}>Context</h2>
        
        <div style={infoRowStyles}>
          <span style={labelStyles}>Company ID</span>
          <span style={valueStyles}>{scope.company_id}</span>
        </div>
        <div style={infoRowStyles}>
          <span style={labelStyles}>Outlet ID</span>
          <span style={valueStyles}>{scope.outlet_id}</span>
        </div>
      </section>

      <section style={sectionStyles}>
        <h2 style={sectionTitleStyles}>Account</h2>
        
        <Button variant="danger" onClick={onLogout} style={{ width: "100%" }}>
          Logout
        </Button>
      </section>
    </div>
  );
}
