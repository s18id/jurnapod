// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// TanStack Query (React Query v5) client provider and sensible defaults.
//
// Provides a pre-configured QueryClient and a QueryClientProvider component
// that wraps the app tree. The defaults are tuned for the backoffice:
//
//   - staleTime: 30 seconds (refetch after this if a new mount happens)
//   - gcTime: 5 minutes (keep unused cache entries for this long)
//   - retry: 1 (retry failed queries once)
//   - refetchOnWindowFocus: true (typical for admin dashboards)
//
// These defaults can be overridden per-query via hook options.
//
// Dexie reference caches (accounts, items, etc.) are preserved and operate
// independently — TanStack Query handles server-state (dynamic data),
// Dexie handles offline/reference caches.

import { QueryClient, QueryClientProvider, type QueryClientConfig } from "@tanstack/react-query";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_QUERY_CLIENT_CONFIG: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,       // 30 seconds
      gcTime: 5 * 60 * 1000,      // 5 minutes
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,                    // Mutations MUST NOT auto-retry
    },
  },
};

// ---------------------------------------------------------------------------
// Singleton QueryClient factory
// ---------------------------------------------------------------------------

let _queryClient: QueryClient | null = null;

/**
 * Get or create the singleton QueryClient instance with default configuration.
 *
 * Call this once at app bootstrap. If a custom config is needed, pass it on
 * the first call; subsequent calls ignore the config and return the cached
 * instance. To replace the singleton with custom config, call resetQueryClient().
 */
export function getQueryClient(config?: Partial<QueryClientConfig>): QueryClient {
  if (!_queryClient) {
    _queryClient = new QueryClient({
      ...DEFAULT_QUERY_CLIENT_CONFIG,
      ...config,
    });
  }
  return _queryClient;
}

/**
 * Reset the QueryClient singleton (useful in tests).
 * Clears all cached queries and creates a fresh client.
 */
export function resetQueryClient(config?: Partial<QueryClientConfig>): QueryClient {
  _queryClient?.clear();
  _queryClient = new QueryClient({
    ...DEFAULT_QUERY_CLIENT_CONFIG,
    ...config,
  });
  return _queryClient;
}

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

export interface QueryProviderProps {
  children: ReactNode;
  /** Optional custom QueryClient. If omitted, the singleton is used. */
  client?: QueryClient;
}

/**
 * QueryClientProvider wrapper with sensible defaults already baked in.
 *
 * Usage at the app root:
 *   <QueryProvider>
 *     <App />
 *   </QueryProvider>
 */
export function QueryProvider({ children, client }: QueryProviderProps) {
  const queryClient = client ?? getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
