// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Cache/query layer public API.
//
// TanStack Query handles server-state (dynamic data).
// Dexie handles offline/reference caches (accounts, items, etc.) — preserved as-is.

// QueryClient provider
export {
  getQueryClient,
  resetQueryClient,
  QueryProvider,
  DEFAULT_QUERY_CLIENT_CONFIG,
} from "./query-client.js";
export type { QueryProviderProps } from "./query-client.js";

// Query key factory
export {
  listQueryKey,
  detailQueryKey,
  listQueryKeyPrefix,
  resourceQueryKeyPrefix,
  isCanonicalQueryKey,
  DOMAINS,
} from "./query-keys";
export type { QueryDomain, ListQueryParams, QueryKey } from "./query-keys";

// Query hooks
export {
  createListQueryHook,
  createDetailQueryHook,
  deriveListState,
} from "./query-hooks";
export type {
  ListQueryOptions,
  DetailQueryOptions,
  QueryError,
  ResourceListState,
} from "./query-hooks";

// Mutation hooks
export {
  createCreateMutation,
  createUpdateMutation,
  createDeleteMutation,
  invalidateListQueries,
  invalidateResourceQueries,
} from "./mutation-hooks";
export type {
  CreateMutationOptions,
  UpdateMutationOptions,
  DeleteMutationOptions,
} from "./mutation-hooks";
