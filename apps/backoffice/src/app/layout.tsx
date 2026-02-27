import type { ReactNode } from "react";
import type { AppRoute } from "./routes";
import type { SessionUser } from "../lib/session";
import { useOnlineStatus } from "../lib/connection";

type AppLayoutProps = {
  user: SessionUser;
  routes: readonly AppRoute[];
  activePath: string;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
  children: ReactNode;
};

type RuntimeConfig = {
  __JURNAPOD_POS_BASE_URL__?: string;
};

const styles = {
  page: {
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    minHeight: "100vh",
    margin: 0,
    background: "linear-gradient(160deg, #f6f2ea 0%, #ece8df 100%)",
    color: "#1f2a28",
    padding: "20px"
  } as const,
  shell: {
    maxWidth: "1100px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    border: "1px solid #d9d2c7",
    borderRadius: "14px",
    overflow: "hidden",
    boxShadow: "0 10px 20px rgba(0, 0, 0, 0.05)"
  } as const,
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "16px 20px",
    borderBottom: "1px solid #ece8df",
    backgroundColor: "#faf8f3"
  } as const,
  navbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "10px 20px",
    borderBottom: "1px solid #e4ded4",
    backgroundColor: "#f7f2e9"
  } as const,
  navBrand: {
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#6a5d4b"
  } as const,
  navGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 8px",
    backgroundColor: "#fff",
    borderRadius: "10px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#e1d8cb"
  } as const,
  navGroupActive: {
    borderColor: "#2f5f4a",
    boxShadow: "0 6px 14px rgba(47, 95, 74, 0.15)",
    backgroundColor: "#f3f8f5"
  } as const,
  navGroupLabel: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#6a5d4b",
    letterSpacing: "0.06em",
    textTransform: "uppercase"
  } as const,
  navSelect: {
    border: "none",
    outline: "none",
    fontSize: "14px",
    fontWeight: 600,
    backgroundColor: "transparent",
    color: "#2f2a24",
    paddingRight: "6px",
    cursor: "pointer"
  } as const,
  navSelectActive: {
    color: "#2f5f4a"
  } as const,
  navList: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    overflowX: "auto",
    paddingBottom: "2px",
    WebkitOverflowScrolling: "touch"
  } as const,
  navButton: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d9d2c7",
    borderRadius: "10px",
    padding: "8px 14px",
    backgroundColor: "#fff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 600,
    color: "#2f2a24",
    whiteSpace: "nowrap"
  } as const,
  navButtonActive: {
    backgroundColor: "#2f5f4a",
    color: "#fff",
    borderColor: "#2f5f4a",
    boxShadow: "0 6px 14px rgba(47, 95, 74, 0.2)"
  } as const,
  content: {
    padding: "20px"
  } as const,
  subtle: {
    color: "#5b6664",
    margin: 0
  } as const,
  title: {
    margin: 0,
    fontSize: "1.1rem"
  } as const,
  signOutButton: {
    border: "1px solid #9f8a6a",
    backgroundColor: "#f3ece0",
    color: "#3d3023",
    borderRadius: "8px",
    padding: "6px 10px",
    cursor: "pointer"
  } as const,
  posLink: {
    border: "1px solid #2f5f4a",
    backgroundColor: "#2f5f4a",
    color: "#fff",
    borderRadius: "8px",
    padding: "6px 12px",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "14px",
    fontWeight: "500",
    transition: "all 0.2s ease"
  } as const,
  topbarActions: {
    display: "flex",
    gap: "8px",
    alignItems: "center"
  } as const,
  connectionBadge: {
    padding: "6px 12px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "0.02em",
    border: "1px solid transparent"
  } as const,
  connectionOnline: {
    backgroundColor: "#d4edda",
    color: "#155724",
    borderColor: "#c3e6cb"
  } as const,
  connectionOffline: {
    backgroundColor: "#f8d7da",
    color: "#721c24",
    borderColor: "#f5c6cb"
  } as const
};

const NAV_GROUPS: Array<{ label: string; paths: string[] }> = [
  {
    label: "Platform",
    paths: ["/users", "/roles", "/companies", "/outlets"]
  },
  {
    label: "Core",
    paths: ["/daily-sales", "/profit-loss", "/general-ledger", "/journals", "/accounting-worksheet"]
  },
  {
    label: "Operations",
    paths: [
      "/transactions",
      "/transaction-templates",
      "/sales-invoices",
      "/sales-payments",
      "/pos-transactions",
      "/pos-payments"
    ]
  },
  {
    label: "Assets",
    paths: ["/items-prices", "/supplies", "/fixed-assets"]
  },
  {
    label: "Admin",
    paths: [
      "/chart-of-accounts",
      "/account-types",
      "/account-mappings",
      "/static-pages",
      "/sync-queue",
      "/sync-history",
      "/pwa-settings"
    ]
  }
];

function ConnectionStatusBadge() {
  const isOnline = useOnlineStatus();

  return (
    <span
      style={{
        ...styles.connectionBadge,
        ...(isOnline ? styles.connectionOnline : styles.connectionOffline)
      }}
    >
      {isOnline ? "Online" : "Offline"}
    </span>
  );
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolvePosBaseUrl(): string {
  const runtimeConfig = globalThis as RuntimeConfig;
  const runtimeBaseUrl = runtimeConfig.__JURNAPOD_POS_BASE_URL__?.trim();
  if (runtimeBaseUrl) {
    return normalizeBaseUrl(runtimeBaseUrl);
  }

  const envBaseUrl = import.meta.env.VITE_POS_BASE_URL?.trim();
  if (envBaseUrl) {
    return normalizeBaseUrl(envBaseUrl);
  }

  if (typeof window !== "undefined") {
    return normalizeBaseUrl(window.location.origin);
  }

  return "";
}

export function AppLayout(props: AppLayoutProps) {
  const posBaseUrl = resolvePosBaseUrl();

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.topbar}>
          <div>
            <h1 style={styles.title}>Jurnapod Backoffice v0</h1>
            <p style={styles.subtle}>
              {props.user.email} · company #{props.user.company_id}
            </p>
          </div>
          <div style={styles.topbarActions}>
            <ConnectionStatusBadge />
            <a
              href={posBaseUrl}
              target="_blank" 
              rel="noopener noreferrer"
              style={styles.posLink}
              title="Open POS in new tab"
            >
              🛒 Open POS
            </a>
            <button type="button" onClick={props.onSignOut} style={styles.signOutButton}>
              Sign out
            </button>
          </div>
        </header>

        <nav style={styles.navbar}>
          <span style={styles.navBrand}>Menu</span>
          <div style={styles.navList}>
            {NAV_GROUPS.map((group) => {
              const groupRoutes = props.routes.filter((route) => group.paths.includes(route.path));
              if (groupRoutes.length === 0) {
                return null;
              }
              const selectedPath = groupRoutes.some((route) => route.path === props.activePath)
                ? props.activePath
                : "";

              return (
                <label
                  key={group.label}
                  style={{
                    ...styles.navGroup,
                    ...(selectedPath ? styles.navGroupActive : undefined)
                  }}
                >
                  <span style={styles.navGroupLabel}>{group.label}</span>
                  <select
                    value={selectedPath}
                    onChange={(event) => {
                      const nextPath = event.target.value;
                      if (nextPath) {
                        props.onNavigate(nextPath);
                      }
                    }}
                    style={{
                      ...styles.navSelect,
                      ...(selectedPath ? styles.navSelectActive : undefined)
                    }}
                    aria-label={`${group.label} navigation`}
                  >
                    <option value="">Select...</option>
                    {groupRoutes.map((route) => (
                      <option key={route.path} value={route.path}>
                        {route.label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        </nav>

        <section style={styles.content}>{props.children}</section>
      </section>
    </main>
  );
}
