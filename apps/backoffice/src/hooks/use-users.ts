// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, ApiError } from "../lib/api-client";
import type {
  UserResponse,
  UserCreateRequest,
  UserUpdateRequest,
  UserRolesUpdateRequest,
  UserOutletsUpdateRequest,
  UserPasswordUpdateRequest,
  RoleResponse,
  OutletResponse
} from "@jurnapod/shared";

/**
 * API Response Types
 */
type UsersListResponse = {
  success: true;
  data: UserResponse[];
  total?: number;
};

/**
 * Pagination options
 */
interface PaginationOptions {
  page: number;
  pageSize: number;
}

/**
 * Sort options
 */
interface SortOptions {
  id: string;
  direction: "asc" | "desc" | null;
}

/**
 * Builds query string from pagination and sort options
 */
function buildQueryString(
  pagination?: PaginationOptions,
  sort?: SortOptions
): string {
  const params = new URLSearchParams();

  if (pagination) {
    params.set("page", String(pagination.page));
    params.set("page_size", String(pagination.pageSize));
  }

  if (sort?.id && sort.direction) {
    params.set("sort_by", sort.id);
    params.set("sort_order", sort.direction);
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

type UserSingleResponse = {
  success: true;
  data: UserResponse;
};

type RolesListResponse = {
  success: true;
  data: RoleResponse[];
};

type OutletsListResponse = {
  success: true;
  data: OutletResponse[];
};

type UsersListFilters = {
  is_active?: boolean;
  search?: string;
};

/**
 * Hook options for useUsers
 */
interface UseUsersOptions {
  filters?: UsersListFilters;
  pagination?: PaginationOptions;
  sort?: SortOptions;
}

/**
 * Hook: useUsers
 * Fetches list of users with optional filters, server-side pagination and sorting
 */
export function useUsers(
  companyId: number,
  accessToken: string,
  options?: UseUsersOptions
) {
  const filters = options?.filters;
  const pagination = options?.pagination;
  const sort = options?.sort;
  const [data, setData] = useState<UserResponse[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const refetch = useCallback(
    async (fetchOptions?: { force?: boolean }) => {
      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ company_id: String(companyId) });

        if (filters?.is_active !== undefined) {
          params.set("is_active", String(filters.is_active));
        }
        if (filters?.search) {
          params.set("search", filters.search);
        }

        // Build query string with pagination and sort
        const paginationSortParams = buildQueryString(pagination, sort);
        const baseParams = params.toString();
        const queryString = paginationSortParams
          ? `${paginationSortParams}&${baseParams}`
          : `?${baseParams}`;

        const response = await apiRequest<UsersListResponse>(
          `/users${queryString}`,
          { signal: controller.signal },
          accessToken
        );
        setData(response.data);
        setTotalCount(response.total ?? response.data.length);
      } catch (fetchError) {
        // Ignore abort errors
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          return;
        }
        if (fetchError instanceof ApiError) {
          setError(fetchError.message);
        } else {
          setError("Failed to load users");
        }
        setData([]);
        setTotalCount(0);
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false);
        }
      }
    },
    [companyId, accessToken, filters, pagination, sort]
  );

  useEffect(() => {
    refetch();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [refetch]);

  return { data, totalCount, loading, error, refetch };
}

/**
 * Hook: useUser
 * Fetches a single user by ID
 */
export function useUser(
  userId: number | null,
  companyId: number,
  accessToken: string
) {
  const [data, setData] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!userId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ company_id: String(companyId) });
      const response = await apiRequest<UserSingleResponse>(
        `/users/${userId}?${params.toString()}`,
        {},
        accessToken
      );
      setData(response.data);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load user");
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [userId, companyId, accessToken]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Hook: useRoles
 * Fetches list of available roles
 */
export function useRoles(accessToken: string, companyId?: number) {
  const [data, setData] = useState<RoleResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = companyId !== undefined 
        ? `?company_id=${companyId}` 
        : "";
      const response = await apiRequest<RolesListResponse>(
        `/roles${params}`,
        {},
        accessToken
      );
      setData(response.data);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load roles");
      }
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, companyId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Hook: useOutlets
 * Fetches list of outlets for a company
 */
export function useOutlets(companyId: number, accessToken: string) {
  const [data, setData] = useState<OutletResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ company_id: String(companyId) });
      const response = await apiRequest<OutletsListResponse>(
        `/outlets?${params.toString()}`,
        {},
        accessToken
      );
      setData(response.data);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load outlets");
      }
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, accessToken]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Mutation: createUser
 * Creates a new user
 */
export async function createUser(
  data: UserCreateRequest,
  accessToken: string
): Promise<UserResponse> {
  const response = await apiRequest<UserSingleResponse>(
    "/users",
    {
      method: "POST",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: updateUser
 * Updates an existing user
 */
export async function updateUser(
  userId: number,
  data: UserUpdateRequest,
  accessToken: string
): Promise<UserResponse> {
  const response = await apiRequest<UserSingleResponse>(
    `/users/${userId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: updateUserRoles
 * Updates user roles
 */
export async function updateUserRoles(
  userId: number,
  data: UserRolesUpdateRequest,
  accessToken: string
): Promise<UserResponse> {
  const response = await apiRequest<UserSingleResponse>(
    `/users/${userId}/roles`,
    {
      method: "POST",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: updateUserOutlets
 * Updates user outlets
 */
export async function updateUserOutlets(
  userId: number,
  data: UserOutletsUpdateRequest,
  accessToken: string
): Promise<UserResponse> {
  const response = await apiRequest<UserSingleResponse>(
    `/users/${userId}/outlets`,
    {
      method: "POST",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: updateUserPassword
 * Changes user password
 */
export async function updateUserPassword(
  userId: number,
  data: UserPasswordUpdateRequest,
  accessToken: string
): Promise<void> {
  await apiRequest<{ success: true; data: null }>(
    `/users/${userId}/password`,
    {
      method: "POST",
      body: JSON.stringify(data)
    },
    accessToken
  );
}

/**
 * Mutation: deactivateUser
 * Deactivates a user
 */
export async function deactivateUser(
  userId: number,
  accessToken: string
): Promise<UserResponse> {
  const response = await apiRequest<UserSingleResponse>(
    `/users/${userId}/deactivate`,
    {
      method: "POST"
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: reactivateUser
 * Reactivates a deactivated user
 */
export async function reactivateUser(
  userId: number,
  accessToken: string
): Promise<UserResponse> {
  const response = await apiRequest<UserSingleResponse>(
    `/users/${userId}/reactivate`,
    {
      method: "POST"
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: createRole
 * Creates a new role
 */
export async function createRole(
  data: { code: string; name: string; role_level?: number },
  accessToken: string
): Promise<RoleResponse> {
  const response = await apiRequest<{ success: true; data: RoleResponse }>(
    "/roles",
    {
      method: "POST",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: updateRole
 * Updates an existing role
 */
export async function updateRole(
  roleId: number,
  data: { name: string },
  accessToken: string
): Promise<RoleResponse> {
  const response = await apiRequest<{ success: true; data: RoleResponse }>(
    `/roles/${roleId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: deleteRole
 * Deletes a role
 */
export async function deleteRole(
  roleId: number,
  accessToken: string
): Promise<void> {
  await apiRequest<{ success: true; data: null }>(
    `/roles/${roleId}`,
    {
      method: "DELETE"
    },
    accessToken
  );
}
