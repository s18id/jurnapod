import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "../lib/api-client";
import type { CompanyResponse } from "@jurnapod/shared";

/**
 * API Response Types
 */
type SuccessResponse<T> = {
  success: true;
  data: T;
};

/**
 * Hook: useCompanies
 * Fetches list of all companies
 */
export function useCompanies(
  accessToken: string,
  options?: { enabled?: boolean; includeDeleted?: boolean }
) {
  const enabled = options?.enabled ?? true;
  const includeDeleted = options?.includeDeleted ?? false;
  const [data, setData] = useState<CompanyResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setData([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = includeDeleted ? "?include_deleted=1" : "";
      const response = await apiRequest<SuccessResponse<CompanyResponse[]>>(
        `/companies${query}`,
        {},
        accessToken
      );
      setData(response.data);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load companies");
      }
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, enabled, includeDeleted]);

  useEffect(() => {
    if (!enabled) {
      setData([]);
      setLoading(false);
      setError(null);
      return;
    }
    refetch();
  }, [enabled, refetch]);

  return { data, loading, error, refetch };
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
  data: { code: string; name: string },
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
  data: { name: string },
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
  await apiRequest<{ success: true }>(
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
