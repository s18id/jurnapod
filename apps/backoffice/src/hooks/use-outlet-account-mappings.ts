// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "../lib/api-client";

export type OutletAccountMappingKey = "SALES_REVENUE" | "SALES_TAX" | "AR";

export type OutletAccountMapping = {
  mapping_key: OutletAccountMappingKey;
  account_id: number;
};

export type EffectiveOutletAccountMapping = {
  mapping_key: OutletAccountMappingKey;
  account_id: number | null;
  source: "outlet" | "company" | null;
  company_account_id: number | null;
};

type CompanyMappingResponse = {
  success: true;
  data: {
    scope: "company";
    mappings: OutletAccountMapping[];
  };
};

type OutletMappingResponse = {
  success: true;
  data: {
    scope: "outlet";
    outlet_id: number;
    mappings: EffectiveOutletAccountMapping[];
  };
};

type SaveResponse = {
  success: true;
  data: null;
};

type MappingScope = "company" | "outlet";

export function useOutletAccountMappings(
  outletId: number | null,
  accessToken: string,
  scope: MappingScope = "outlet"
) {
  const [data, setData] = useState<OutletAccountMapping[] | EffectiveOutletAccountMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (scope === "company") {
      setLoading(true);
      setError(null);
      try {
        const response = await apiRequest<CompanyMappingResponse>(
          `/settings/outlet-account-mappings?scope=company`,
          {},
          accessToken
        );
        setData(response.data.mappings);
      } catch (fetchError) {
        if (fetchError instanceof ApiError) {
          setError(fetchError.message);
        } else {
          setError("Failed to load company account mappings");
        }
        setData([]);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!outletId) {
      setData([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<OutletMappingResponse>(
        `/settings/outlet-account-mappings?scope=outlet&outlet_id=${outletId}`,
        {},
        accessToken
      );
      setData(response.data.mappings);
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
  }, [outletId, accessToken, scope]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function save(mappings: Array<{ mapping_key: OutletAccountMappingKey; account_id: number | "" }>) {
    if (scope === "company") {
      const response = await apiRequest<SaveResponse>(
        `/settings/outlet-account-mappings`,
        {
          method: "PUT",
          body: JSON.stringify({ scope: "company", mappings })
        },
        accessToken
      );
      return response;
    }

    if (!outletId) {
      throw new Error("Outlet ID required for outlet scope");
    }

    const response = await apiRequest<SaveResponse>(
      `/settings/outlet-account-mappings`,
      {
        method: "PUT",
        body: JSON.stringify({ scope: "outlet", outlet_id: outletId, mappings })
      },
      accessToken
    );
    return response;
  }

  return { data, loading, error, refetch, save, scope };
}
