// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useEffect, useCallback, useRef } from "react";
import { apiRequest } from "../lib/api-client";
import type { SessionUser } from "../lib/session";

export type VariantAttributeValue = {
  id: number;
  value: string;
  sort_order: number;
};

export type VariantAttribute = {
  id: number;
  attribute_name: string;
  sort_order: number;
  values: VariantAttributeValue[];
};

export type ItemVariant = {
  id: number;
  item_id: number;
  sku: string;
  variant_name: string;
  price_override: number | null;
  effective_price: number;
  stock_quantity: number;
  barcode: string | null;
  is_active: boolean;
  attributes: Array<{ attribute_name: string; value: string }>;
  created_at: string;
  updated_at: string;
};

export interface UseVariantsProps {
  user: SessionUser;
  accessToken: string;
  itemId: number | null;
}

// API response types for type-safe apiRequest calls
type VariantAttributesResponse = {
  success: true;
  data: VariantAttribute[];
};

type VariantsResponse = {
  success: true;
  data: ItemVariant[];
};

type ApiErrorResponse = {
  success: false;
  error?: {
    message?: string;
  };
};

type MutationResponse = {
  success: true;
  data?: unknown;
} | ApiErrorResponse;

export interface UseVariantsReturn {
  attributes: VariantAttribute[];
  variants: ItemVariant[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createAttribute: (data: { attribute_name: string; values: string[] }) => Promise<void>;
  updateAttribute: (attributeId: number, data: { attribute_name?: string; values?: string[] }) => Promise<void>;
  deleteAttribute: (attributeId: number) => Promise<void>;
  updateVariant: (variantId: number, data: {
    sku?: string;
    price_override?: number | null;
    stock_quantity?: number;
    barcode?: string | null;
    is_active?: boolean;
  }) => Promise<void>;
  adjustStock: (variantId: number, adjustment: number, reason: string) => Promise<void>;
}

export function useVariants({ user, accessToken, itemId }: UseVariantsProps): UseVariantsReturn {
  const [attributes, setAttributes] = useState<VariantAttribute[]>([]);
  const [variants, setVariants] = useState<ItemVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchData = useCallback(async () => {
    if (!itemId || !user || !accessToken) {
      setAttributes([]);
      setVariants([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [attrsRes, variantsRes] = await Promise.all([
        apiRequest<VariantAttributesResponse>(`/inventory/items/${itemId}/variant-attributes`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        apiRequest<VariantsResponse>(`/inventory/items/${itemId}/variants`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      if (!isMounted.current) return;

      if (attrsRes.success) {
        setAttributes(attrsRes.data || []);
      } else {
        setError("Failed to fetch attributes");
        return;
      }

      if (variantsRes.success) {
        setVariants(variantsRes.data || []);
      } else {
        setError("Failed to fetch variants");
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : "Failed to fetch variant data");
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [itemId, user, accessToken]);

  const createAttribute = useCallback(async (data: { attribute_name: string; values: string[] }) => {
    if (!itemId || !accessToken) throw new Error("Missing item or token");

    const response = await apiRequest<MutationResponse>(`/api/inventory/items/${itemId}/variant-attributes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(data),
    });

    if (!response.success) {
      throw new Error("Failed to create attribute");
    }

    await fetchData();
  }, [itemId, accessToken, fetchData]);

  const updateAttribute = useCallback(async (attributeId: number, data: { attribute_name?: string; values?: string[] }) => {
    if (!accessToken) throw new Error("Missing token");

    const response = await apiRequest<MutationResponse>(`/api/inventory/variant-attributes/${attributeId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(data),
    });

    if (!response.success) {
      throw new Error("Failed to update attribute");
    }

    await fetchData();
  }, [accessToken, fetchData]);

  const deleteAttribute = useCallback(async (attributeId: number) => {
    if (!accessToken) throw new Error("Missing token");

    const response = await apiRequest<MutationResponse>(`/api/inventory/variant-attributes/${attributeId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.success) {
      throw new Error("Failed to delete attribute");
    }

    await fetchData();
  }, [accessToken, fetchData]);

  const updateVariant = useCallback(async (variantId: number, data: {
    sku?: string;
    price_override?: number | null;
    stock_quantity?: number;
    barcode?: string | null;
    is_active?: boolean;
  }) => {
    if (!accessToken) throw new Error("Missing token");

    const response = await apiRequest<MutationResponse>(`/api/inventory/variants/${variantId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(data),
    });

    if (!response.success) {
      throw new Error("Failed to update variant");
    }

    await fetchData();
  }, [accessToken, fetchData]);

  const adjustStock = useCallback(async (variantId: number, adjustment: number, reason: string) => {
    if (!accessToken) throw new Error("Missing token");

    const response = await apiRequest<MutationResponse>(`/api/inventory/variants/${variantId}/stock-adjustment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ adjustment, reason }),
    });

    if (!response.success) {
      throw new Error("Failed to adjust stock");
    }

    await fetchData();
  }, [accessToken, fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  return {
    attributes,
    variants,
    loading,
    error,
    refresh: fetchData,
    createAttribute,
    updateAttribute,
    deleteAttribute,
    updateVariant,
    adjustStock,
  };
}