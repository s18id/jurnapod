// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ReactNode } from "react";

export type DashboardCardState =
  | { status: "loading" }
  | { status: "empty"; message: string }
  | { status: "error"; message: string; retry?: () => void }
  | { status: "success"; children: ReactNode }
  | { status: "api-gap"; message: string };

export interface DashboardCardProps {
  title: string;
  description?: string;
  href?: string;
  state: DashboardCardState;
}

export function DashboardCard(props: DashboardCardProps) {
  const content = renderDashboardCardContent(props.state);

  return (
    <section
      aria-label={props.title}
      style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, background: "#fff" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>{props.title}</h3>
          {props.description ? <p style={{ color: "#667085", margin: "4px 0 0" }}>{props.description}</p> : null}
        </div>
        {props.href ? <a href={props.href}>Open</a> : null}
      </div>
      <div style={{ marginTop: 14 }}>{content}</div>
    </section>
  );
}

export function renderDashboardCardContent(state: DashboardCardState): ReactNode {
  if (state.status === "loading") {
    return <div aria-label="Loading dashboard card">Loading…</div>;
  }

  if (state.status === "empty") {
    return <div style={{ color: "#047857" }}>{state.message}</div>;
  }

  if (state.status === "error") {
    return (
      <div role="alert" style={{ color: "#b42318" }}>
        <strong>Unable to load dashboard data.</strong>
        <p>{state.message}</p>
        {state.retry ? <button type="button" onClick={state.retry}>Retry</button> : null}
      </div>
    );
  }

  if (state.status === "api-gap") {
    return <div style={{ color: "#92400e" }}>{state.message}</div>;
  }

  return <>{state.children}</>;
}

export function CountMetric(props: { label: string; value: number; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const color = props.tone === "bad" ? "#b42318" : props.tone === "warn" ? "#92400e" : props.tone === "good" ? "#047857" : "#101828";
  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{props.value}</div>
      <div style={{ color: "#667085" }}>{props.label}</div>
    </div>
  );
}

export function ApiGapNotice(props: { message: string }) {
  return <div style={{ color: "#92400e" }}>{props.message}</div>;
}
