// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Shell context provider — Company context, outlet switcher, active user,
// pending jobs, online/offline status, sync health, and last sync timestamp.
//
// The ShellProvider wraps the app and makes shell state available to any
// component in the tree. It is consumed by the AppLayout to render the
// persistent header/sidebar/footer.

import { createContext, useContext, type ReactNode } from "react";
import type { SessionUser, UserOutlet } from "@/lib/session";

// ---------------------------------------------------------------------------
// Shell state types
// ---------------------------------------------------------------------------

export interface OutletContext {
  /** Currently selected outlet */
  currentOutlet: UserOutlet | null;
  /** All outlets the user has access to */
  availableOutlets: UserOutlet[];
  /** Switch to a different outlet (persisted to sessionStorage) */
  switchOutlet: (outlet: UserOutlet) => void;
}

export interface PendingJobsInfo {
  /** Count of sync items with status "running" or "failed" */
  count: number;
  /** Whether jobs data is currently loading */
  loading: boolean;
}

export interface SyncHealthInfo {
  /** Whether sync is currently in a healthy state */
  healthy: boolean;
  /** Last successful sync timestamp (epoch ms), or null */
  lastSyncTimestamp: number | null;
  /** Human-readable label for the last sync time */
  lastSyncLabel: string;
}

export interface ShellState {
  /** Currently authenticated user */
  user: SessionUser | null;
  /** Company context (derived from user) */
  companyId: number | null;
  /** Company timezone (from user session) */
  companyTimezone: string | null;
  /** Outlet switcher state */
  outlet: OutletContext;
  /** Pending jobs / sync alert count */
  pendingJobs: PendingJobsInfo;
  /** Online/offline status */
  isOnline: boolean;
  /** Sync health and last sync timestamp */
  syncHealth: SyncHealthInfo;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const defaultOutletContext: OutletContext = {
  currentOutlet: null,
  availableOutlets: [],
  switchOutlet: () => { /* noop */ },
};

const defaultPendingJobs: PendingJobsInfo = {
  count: 0,
  loading: false,
};

const defaultSyncHealth: SyncHealthInfo = {
  healthy: true,
  lastSyncTimestamp: null,
  lastSyncLabel: "Never",
};

const ShellContext = createContext<ShellState>({
  user: null,
  companyId: null,
  companyTimezone: null,
  outlet: defaultOutletContext,
  pendingJobs: defaultPendingJobs,
  isOnline: true,
  syncHealth: defaultSyncHealth,
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the shell state from any component in the tree.
 * MUST be called within a ShellProvider.
 */
export function useShell(): ShellState {
  return useContext(ShellContext);
}

// ---------------------------------------------------------------------------
// Provider props
// ---------------------------------------------------------------------------

export interface ShellProviderProps {
  children: ReactNode;
  /** Pre-computed shell state (populated by AppRouter) */
  state: ShellState;
}

/**
 * ShellProvider wraps the app tree with shell context.
 *
 * The parent (AppRouter) computes the shell state and passes it in.
 * Components below consume it via useShell().
 */
export function ShellProvider({ children, state }: ShellProviderProps) {
  return (
    <ShellContext.Provider value={state}>
      {children}
    </ShellContext.Provider>
  );
}
