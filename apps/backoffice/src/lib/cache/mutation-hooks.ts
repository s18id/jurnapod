// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Typed TanStack Query mutation hooks with automatic cache invalidation.
//
// Provides factory functions for create, update, and delete mutations that
// automatically invalidate related query caches after success.
//
// Dexie reference caches are NOT invalidated by these hooks — they operate
// independently. Only TanStack Query server-state caches are affected.
//
// Usage:
//   import { createCreateMutation } from "@/lib/cache/mutation-hooks";
//   import { api } from "@/lib/api";
//
//   const useCreateItem = createCreateMutation("inventory", "items", (body) =>
//     api.POST("/inventory/items", { body })
//   );
//
//   function CreateItemForm() {
//     const { mutate, isPending } = useCreateItem();
//     ...
//   }

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  listQueryKeyPrefix,
  resourceQueryKeyPrefix,
  type QueryDomain,
} from "./query-keys";
import type { QueryError } from "./query-hooks";

// ---------------------------------------------------------------------------
// Create mutation factory
// ---------------------------------------------------------------------------

/**
 * Options for a create mutation.
 */
export interface CreateMutationOptions<TData, TVariables, TError = QueryError> {
  /** Optional react-query overrides */
  mutationOptions?: Omit<
    UseMutationOptions<TData, TError, TVariables>,
    "mutationFn"
  >;
  /** If true, invalidate only list queries (not detail). Defaults to false (invalidate all). */
  invalidateListOnly?: boolean;
}

/**
 * Create a typed useMutation hook for creating new records.
 *
 * After a successful create, invalidates the resource's list (and detail)
 * caches so the updated list is fetched on next render.
 */
export function createCreateMutation<
  TData,
  TVariables,
  TError = QueryError,
>(
  domain: QueryDomain,
  resource: string,
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: CreateMutationOptions<TData, TVariables, TError>,
) {
  return function useCreateMutation(): UseMutationResult<TData, TError, TVariables> {
    const queryClient = useQueryClient();

    return useMutation<TData, TError, TVariables>({
      mutationFn,
      onSuccess: (_data, _variables) => {
        const key = options?.invalidateListOnly
          ? listQueryKeyPrefix(domain, resource)
          : resourceQueryKeyPrefix(domain, resource);
        queryClient.invalidateQueries({ queryKey: key });
      },
      ...options?.mutationOptions,
    });
  };
}

// ---------------------------------------------------------------------------
// Update mutation factory
// ---------------------------------------------------------------------------

/**
 * Options for an update mutation.
 */
export interface UpdateMutationOptions<TData, TVariables, TError = QueryError> {
  /** Optional react-query overrides */
  mutationOptions?: Omit<
    UseMutationOptions<TData, TError, TVariables>,
    "mutationFn"
  >;
}

/**
 * Create a typed useMutation hook for updating existing records.
 *
 * After a successful update, invalidates the resource's list and detail
 * caches so stale data is refreshed.
 */
export function createUpdateMutation<
  TData,
  TVariables,
  TError = QueryError,
>(
  domain: QueryDomain,
  resource: string,
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: UpdateMutationOptions<TData, TVariables, TError>,
) {
  return function useUpdateMutation(): UseMutationResult<TData, TError, TVariables> {
    const queryClient = useQueryClient();

    return useMutation<TData, TError, TVariables>({
      mutationFn,
      onSuccess: (_data, _variables) => {
        queryClient.invalidateQueries({
          queryKey: resourceQueryKeyPrefix(domain, resource),
        });
      },
      ...options?.mutationOptions,
    });
  };
}

// ---------------------------------------------------------------------------
// Delete mutation factory
// ---------------------------------------------------------------------------

/**
 * Options for a delete mutation.
 */
export interface DeleteMutationOptions<TData, TVariables, TError = QueryError> {
  /** Optional react-query overrides */
  mutationOptions?: Omit<
    UseMutationOptions<TData, TError, TVariables>,
    "mutationFn"
  >;
}

/**
 * Create a typed useMutation hook for deleting records.
 *
 * After a successful delete, invalidates the resource's list and detail
 * caches, and removes the deleted record from the detail cache.
 */
export function createDeleteMutation<
  TData,
  TVariables extends { id: string | number },
  TError = QueryError,
>(
  domain: QueryDomain,
  resource: string,
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: DeleteMutationOptions<TData, TVariables, TError>,
) {
  return function useDeleteMutation(): UseMutationResult<TData, TError, TVariables> {
    const queryClient = useQueryClient();

    return useMutation<TData, TError, TVariables>({
      mutationFn,
      onSuccess: (_data, variables) => {
        // Remove the specific detail cache entry
        queryClient.removeQueries({
          queryKey: [domain, resource, "detail", variables.id],
        });
        // Invalidate list caches
        queryClient.invalidateQueries({
          queryKey: resourceQueryKeyPrefix(domain, resource),
        });
      },
      ...options?.mutationOptions,
    });
  };
}

// ---------------------------------------------------------------------------
// Typed invalidation helpers (manually triggered by callers)
// ---------------------------------------------------------------------------

/**
 * Invalidate all list queries for a domain+resource.
 * Convenience helper for manual cache invalidation.
 */
export function invalidateListQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  domain: QueryDomain,
  resource: string,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: listQueryKeyPrefix(domain, resource),
  });
}

/**
 * Invalidate all queries (list + detail) for a domain+resource.
 */
export function invalidateResourceQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  domain: QueryDomain,
  resource: string,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: resourceQueryKeyPrefix(domain, resource),
  });
}
