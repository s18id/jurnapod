// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { Button } from "../shared/components/index.js";
import { SyncControls } from "../features/sync/SyncControls.js";
import { usePosAppState } from "../router/pos-app-state.js";
import { POLL_INTERVAL_MS } from "../shared/utils/constants.js";

interface SettingsPageProps {
  context: WebBootstrapContext;
  onLogout: () => void;
}

export function SettingsPage({ context: _context, onLogout }: SettingsPageProps): JSX.Element {
  const {
    scope,
    outletOptions,
    syncBadgeState,
    pendingOutboxCount,
    autoRefreshEnabled,
    setAutoRefreshEnabled,
    autoPullEnabled,
    setAutoPullEnabled,
    autoPullIntervalMs,
    setAutoPullIntervalMs,
    hasProductCache,
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

  const activeOutlet =
    outletOptions.find((outlet) => outlet.outlet_id === scope.outlet_id)?.label ?? `Outlet ${scope.outlet_id}`;

  const contextCardStyles: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
    padding: 14,
    display: "grid",
    gap: 10
  };

  const contextRowStyles: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  };

  const contextLabelStyles: React.CSSProperties = {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#64748b",
    fontWeight: 700
  };

  const contextValueStyles: React.CSSProperties = {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: 700,
    textAlign: "right"
  };

  const statusChipStyles = (tone: "ok" | "warn" | "info"): React.CSSProperties => {
    if (tone === "ok") {
      return {
        fontSize: 12,
        fontWeight: 700,
        color: "#14532d",
        background: "#dcfce7",
        border: "1px solid #86efac",
        borderRadius: 999,
        padding: "4px 8px"
      };
    }

    if (tone === "warn") {
      return {
        fontSize: 12,
        fontWeight: 700,
        color: "#7c2d12",
        background: "#ffedd5",
        border: "1px solid #fdba74",
        borderRadius: 999,
        padding: "4px 8px"
      };
    }

    return {
      fontSize: 12,
      fontWeight: 700,
      color: "#1e3a8a",
      background: "#dbeafe",
      border: "1px solid #93c5fd",
      borderRadius: 999,
      padding: "4px 8px"
    };
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

        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Auto refresh</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                Poll runtime state every {Math.round(POLL_INTERVAL_MS / 1000)}s
              </div>
            </div>
            <Button
              id="settings-auto-refresh-toggle"
              name="settingsAutoRefreshToggle"
              size="small"
              variant={autoRefreshEnabled ? "primary" : "secondary"}
              onClick={() => setAutoRefreshEnabled((enabled) => !enabled)}
            >
              {autoRefreshEnabled ? "On" : "Off"}
            </Button>
          </div>
        </div>

        <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Auto pull catalog</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                Pull incremental product updates on interval
              </div>
            </div>
            <Button
              id="settings-auto-pull-toggle"
              name="settingsAutoPullToggle"
              size="small"
              variant={autoPullEnabled ? "primary" : "secondary"}
              onClick={() => setAutoPullEnabled((enabled) => !enabled)}
            >
              {autoPullEnabled ? "On" : "Off"}
            </Button>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[30000, 60000, 300000].map((ms) => {
              const isActive = autoPullIntervalMs === ms;
              const label = ms === 30000 ? "30s" : ms === 60000 ? "1m" : "5m";
              return (
                <Button
                  key={ms}
                  id={`settings-auto-pull-interval-${ms}`}
                  name={`settingsAutoPullInterval-${ms}`}
                  size="small"
                  variant={isActive ? "primary" : "secondary"}
                  disabled={!autoPullEnabled}
                  onClick={() => setAutoPullIntervalMs(ms)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </div>
      </section>

      <section style={sectionStyles}>
        <h2 style={sectionTitleStyles}>Active POS Context</h2>

        <div style={contextCardStyles}>
          <div style={contextRowStyles}>
            <div style={contextLabelStyles}>Company</div>
            <div style={contextValueStyles}>#{scope.company_id}</div>
          </div>
          <div style={contextRowStyles}>
            <div style={contextLabelStyles}>Outlet</div>
            <div style={contextValueStyles}>{activeOutlet}</div>
          </div>
          <div style={contextRowStyles}>
            <div style={contextLabelStyles}>Outlet ID</div>
            <div style={contextValueStyles}>#{scope.outlet_id}</div>
          </div>
          <div style={contextRowStyles}>
            <div style={contextLabelStyles}>Data Version</div>
            <div style={contextValueStyles}>{lastDataVersion}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={statusChipStyles("ok")}>Authenticated</span>
            <span style={statusChipStyles(syncBadgeState === "Offline" ? "warn" : "ok")}>{syncBadgeState}</span>
            <span style={statusChipStyles(hasProductCache ? "ok" : "warn")}>
              {hasProductCache ? "Catalog Ready" : "Catalog Empty"}
            </span>
            <span style={statusChipStyles(pendingOutboxCount > 0 ? "warn" : "info")}>
              Outbox: {pendingOutboxCount}
            </span>
          </div>
        </div>

        <div style={infoRowStyles}>
          <span style={labelStyles}>Context refresh</span>
          <span style={valueStyles}>Pull to rebuild local catalog</span>
        </div>
        <Button
          id="settings-refresh-catalog"
          name="settingsRefreshCatalog"
          variant="secondary"
          fullWidth
          onClick={() => {
            void runSyncPullNow();
          }}
          disabled={pullSyncInFlight}
        >
          {pullSyncInFlight ? "Refreshing context..." : "Refresh Catalog Now"}
        </Button>
      </section>

      <section style={sectionStyles}>
        <h2 style={sectionTitleStyles}>Account</h2>
        
        <Button id="settings-logout" name="settingsLogout" variant="danger" onClick={onLogout} style={{ width: "100%" }}>
          Logout
        </Button>
      </section>
    </div>
  );
}
