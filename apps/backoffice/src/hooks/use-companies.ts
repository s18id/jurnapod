// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { CompanyResponse } from "@jurnapod/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest, ApiError } from "../lib/api-client";

/**
 * API Response Types
 */
type SuccessResponse<T> = {
  success: true;
  data: T;
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
 * Hook options for useCompanies
 */
interface UseCompaniesOptions {
  enabled?: boolean;
  includeDeleted?: boolean;
  pagination?: PaginationOptions;
  sort?: SortOptions;
}

/**
 * Builds query string from pagination and sort options
 */
function buildQueryString(
  includeDeleted: boolean,
  pagination?: PaginationOptions,
  sort?: SortOptions
): string {
  const params = new URLSearchParams();

  if (includeDeleted) {
    params.set("include_deleted", "1");
  }

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

/**
 * Hook: useCompanies
 * Fetches list of companies with server-side pagination and sorting
 */
export function useCompanies(accessToken: string, options?: UseCompaniesOptions) {
  const enabled = options?.enabled ?? true;
  const includeDeleted = options?.includeDeleted ?? false;
  const pagination = options?.pagination;
  const sort = options?.sort;
  const [data, setData] = useState<CompanyResponse[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const refetch = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (!enabled) {
      setData([]);
      setTotalCount(0);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const query = buildQueryString(includeDeleted, pagination, sort);
      const response = await apiRequest<SuccessResponse<CompanyResponse[]>>(
        `/companies${query}`,
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
        setError("Failed to load companies");
      }
      setData([]);
      setTotalCount(0);
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [accessToken, enabled, includeDeleted, pagination, sort]);

  useEffect(() => {
    if (!enabled) {
      setData([]);
      setTotalCount(0);
      setLoading(false);
      setError(null);
      return;
    }
    refetch();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, refetch]);

  return { data, totalCount, loading, error, refetch };
}

/**
 * Hook: useCompany
 * Fetches a single company by ID
 */
export function useCompany(
  companyId: number | null,
  accessToken: string
) {
  const [data, setData] = useState<CompanyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!companyId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<SuccessResponse<CompanyResponse>>(
        `/companies/${companyId}`,
        {},
        accessToken
      );
      setData(response.data);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load company");
      }
      setData(null);
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
 * Mutation: createCompany
 * Creates a new company
 */
export async function createCompany(
  data: {
    code: string;
    name: string;
    legal_name?: string;
    tax_id?: string;
    email?: string;
    phone?: string;
    timezone: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    postal_code?: string;
  },
  accessToken: string
): Promise<CompanyResponse> {
  const response = await apiRequest<SuccessResponse<CompanyResponse>>(
    "/companies",
    {
      method: "POST",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: updateCompany
 * Updates an existing company
 */
export async function updateCompany(
  companyId: number,
  data: {
    name?: string;
    legal_name?: string | null;
    tax_id?: string | null;
    email?: string | null;
    phone?: string | null;
    timezone?: string;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postal_code?: string | null;
  },
  accessToken: string
): Promise<CompanyResponse> {
  const response = await apiRequest<SuccessResponse<CompanyResponse>>(
    `/companies/${companyId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: deleteCompany
 * Deletes a company
 */
export async function deleteCompany(
  companyId: number,
  accessToken: string
): Promise<void> {
  await apiRequest<{ success: true; data: null }>(
    `/companies/${companyId}`,
    {
      method: "DELETE"
    },
    accessToken
  );
}

export async function reactivateCompany(
  companyId: number,
  accessToken: string
): Promise<CompanyResponse> {
  const response = await apiRequest<SuccessResponse<CompanyResponse>>(
    `/companies/${companyId}/reactivate`,
    {
      method: "POST"
    },
    accessToken
  );
  return response.data;
}
