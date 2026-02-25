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
  nav: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    padding: "12px 20px",
    borderBottom: "1px solid #ece8df"
  } as const,
  navButton: {
    border: "1px solid #d9d2c7",
    borderRadius: "999px",
    padding: "6px 12px",
    backgroundColor: "#fff",
    cursor: "pointer"
  } as const,
  navButtonActive: {
    backgroundColor: "#2f5f4a",
    color: "#fff",
    borderColor: "#2f5f4a"
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

export function AppLayout(props: AppLayoutProps) {
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
              href="http://localhost:5173" 
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

        <nav style={styles.nav}>
          {props.routes.map((route) => {
            const isActive = route.path === props.activePath;
            return (
              <button
                key={route.path}
                type="button"
                onClick={() => props.onNavigate(route.path)}
                style={{
                  ...styles.navButton,
                  ...(isActive ? styles.navButtonActive : undefined)
                }}
              >
                {route.label}
              </button>
            );
          })}
        </nav>

        <section style={styles.content}>{props.children}</section>
      </section>
    </main>
  );
}
