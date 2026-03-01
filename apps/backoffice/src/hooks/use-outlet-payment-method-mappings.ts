// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "../lib/api-client";

export type PaymentMethodConfig = {
  code: string;
  label: string;
  method?: string;
};

export type PaymentMethodMapping = {
  method_code: string;
  account_id: number;
  label?: string;
  is_invoice_default?: boolean;
};

type MappingResponse = {
  ok: true;
  outlet_id: number;
  payment_methods: PaymentMethodConfig[];
  mappings: PaymentMethodMapping[];
};

type SaveResponse = {
  ok: true;
};

export function useOutletPaymentMethodMappings(outletId: number, accessToken: string) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [mappings, setMappings] = useState<PaymentMethodMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!outletId) {
      setPaymentMethods([]);
      setMappings([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<MappingResponse>(
        `/settings/outlet-payment-method-mappings?outlet_id=${outletId}`,
        {},
        accessToken
      );
      setPaymentMethods(response.payment_methods);
      setMappings(response.mappings);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load payment method mappings");
      }
      setPaymentMethods([]);
      setMappings([]);
    } finally {
      setLoading(false);
    }
  }, [outletId, accessToken]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function save(nextMappings: PaymentMethodMapping[]) {
    const response = await apiRequest<SaveResponse>(
      `/settings/outlet-payment-method-mappings`,
      {
        method: "PUT",
        body: JSON.stringify({ outlet_id: outletId, mappings: nextMappings })
      },
      accessToken
    );
    return response;
  }

  return { paymentMethods, mappings, loading, error, refetch, save };
}
