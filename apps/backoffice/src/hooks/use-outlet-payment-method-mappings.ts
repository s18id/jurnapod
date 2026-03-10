// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useRef, useState } from "react";
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
  success: true;
  data: {
    outlet_id: number;
    payment_methods: PaymentMethodConfig[];
    mappings: PaymentMethodMapping[];
  };
};

type SaveResponse = {
  success: true;
  data: null;
};

export function useOutletPaymentMethodMappings(outletId: number, accessToken: string) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [mappings, setMappings] = useState<PaymentMethodMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!outletId) {
      requestSeqRef.current += 1;
      setPaymentMethods([]);
      setMappings([]);
      setError(null);
      setLoading(false);
      return;
    }

    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;

    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<MappingResponse>(
        `/settings/outlet-payment-method-mappings?outlet_id=${outletId}`,
        {},
        accessToken
      );
      if (requestSeq !== requestSeqRef.current) {
        return;
      }
      setPaymentMethods(response.data.payment_methods);
      setMappings(response.data.mappings);
    } catch (fetchError) {
      if (requestSeq !== requestSeqRef.current) {
        return;
      }
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load payment method mappings");
      }
      setPaymentMethods([]);
      setMappings([]);
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
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
