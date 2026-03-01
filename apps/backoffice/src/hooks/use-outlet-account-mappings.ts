import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "../lib/api-client";

export type OutletAccountMappingKey = "SALES_REVENUE" | "SALES_TAX" | "AR";

export type OutletAccountMapping = {
  mapping_key: OutletAccountMappingKey;
  account_id: number;
};

type MappingResponse = {
  ok: true;
  outlet_id: number;
  mappings: OutletAccountMapping[];
};

type SaveResponse = {
  ok: true;
};

export function useOutletAccountMappings(outletId: number, accessToken: string) {
  const [data, setData] = useState<OutletAccountMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!outletId) {
      setData([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<MappingResponse>(
        `/settings/outlet-account-mappings?outlet_id=${outletId}`,
        {},
        accessToken
      );
      setData(response.mappings);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load account mappings");
      }
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [outletId, accessToken]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function save(mappings: OutletAccountMapping[]) {
    const response = await apiRequest<SaveResponse>(
      `/settings/outlet-account-mappings`,
      {
        method: "PUT",
        body: JSON.stringify({ outlet_id: outletId, mappings })
      },
      accessToken
    );
    return response;
  }

  return { data, loading, error, refetch, save };
}
