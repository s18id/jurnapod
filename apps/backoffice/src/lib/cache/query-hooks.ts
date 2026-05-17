// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Typed TanStack Query hooks for the Jurnapod backoffice.
//
// Provides factory functions that create useQuery hooks for list and detail
// endpoints, and useMutation hooks for create/update/delete operations.
//
// These hooks are typed via the generated API client types so callers get
// full type safety on request params and response shapes.
//
// Usage:
//   import { createListQueryHook } from "@/lib/cache/query-hooks";
//   import { api } from "@/lib/api";
//
//   const useItems = createListQueryHook("inventory", "items", (params) =>
//     api.GET("/inventory/items", { params: { query: params } })
//   );
//
//   function ItemsPage() {
//     const { data, isLoading, error } = useItems({ page: 1, limit: 25 });
//     ...
//   }

import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { listQueryKey, detailQueryKey, type ListQueryParams, type QueryKey, type QueryDomain } from "./query-keys";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export interface QueryError {
  code: string;
  message: string;
  status?: number;
}

// ---------------------------------------------------------------------------
// List query hook factory
// ---------------------------------------------------------------------------

/**
 * Options for a list query hook.
 */
export interface ListQueryOptions<TData, TError = QueryError> {
  /** Optional react-query overrides */
  queryOptions?: Omit<
    UseQueryOptions<TData, TError, TData, QueryKey>,
    "queryKey" | "queryFn"
  >;
}

/**
 * Create a typed useQuery hook for a list endpoint.
 *
 * @param domain   - The canonical module domain (e.g., "inventory", "platform")
 * @param resource - The resource within the domain (e.g., "items", "users")
 * @param fetcher  - A typed function that accepts list params and returns data
 *
 * @returns A hook that accepts ListQueryParams and returns UseQueryResult
 */
export function createListQueryHook<
  TData,
  TParams extends ListQueryParams = ListQueryParams,
  TError = QueryError,
>(
  domain: QueryDomain,
  resource: string,
  fetcher: (params?: TParams) => Promise<TData>,
) {
  return function useListQuery(
    params?: TParams,
    options?: ListQueryOptions<TData, TError>,
  ): UseQueryResult<TData, TError> {
    const queryKey = listQueryKey(domain, resource, params as ListQueryParams);
    return useQuery<TData, TError, TData, QueryKey>({
      queryKey,
      queryFn: () => fetcher(params),
      ...options?.queryOptions,
    });
  };
}

// ---------------------------------------------------------------------------
// Detail query hook factory
// ---------------------------------------------------------------------------

/**
 * Options for a detail query hook.
 */
export interface DetailQueryOptions<TData, TError = QueryError> {
  /** Optional react-query overrides */
  queryOptions?: Omit<
    UseQueryOptions<TData, TError, TData, QueryKey>,
    "queryKey" | "queryFn"
  >;
}

/**
 * Create a typed useQuery hook for a detail (single-record) endpoint.
 *
 * @param domain   - The canonical module domain
 * @param resource - The resource within the domain
 * @param fetcher  - A typed function that accepts an ID and returns data
 *
 * @returns A hook that accepts an ID and returns UseQueryResult
 */
export function createDetailQueryHook<
  TData,
  TId extends string | number = string | number,
  TError = QueryError,
>(
  domain: QueryDomain,
  resource: string,
  fetcher: (id: TId) => Promise<TData>,
) {
  return function useDetailQuery(
    id: TId | undefined,
    options?: DetailQueryOptions<TData, TError>,
  ): UseQueryResult<TData, TError> {
    const queryKey = id !== undefined ? detailQueryKey(domain, resource, id) : [domain, resource];
    return useQuery<TData, TError, TData, QueryKey>({
      queryKey,
      queryFn: () => fetcher(id as TId),
      enabled: id !== undefined,
      ...options?.queryOptions,
    });
  };
}

// ---------------------------------------------------------------------------
// Higher-level convenience hook: useResourceList
// ---------------------------------------------------------------------------

/**
 * Generic state shape returned by useResourceList for immediate use in
 * components (loading, error, empty, data states).
 */
export interface ResourceListState<TData> {
  data: TData | undefined;
  isLoading: boolean;
  isError: boolean;
  error: QueryError | null;
  isEmpty: boolean;
}

/**
 * Derive a ResourceListState from a UseQueryResult.
 * Convenience helper for mapping react-query states to component-ready shapes.
 */
export function deriveListState<TData extends { data?: unknown[] }>(
  result: UseQueryResult<TData, QueryError>,
): ResourceListState<TData> {
  const data = result.data;
  const isEmpty = data !== undefined && Array.isArray(data) && data.length === 0;

  return {
    data: result.data,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error ?? null,
    isEmpty,
  };
}
