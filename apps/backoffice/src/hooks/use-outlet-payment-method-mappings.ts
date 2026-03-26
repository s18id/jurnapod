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

export type EffectivePaymentMethodMapping = {
  method_code: string;
  account_id: number;
  label?: string;
  is_invoice_default?: boolean;
  source: "outlet" | "company";
  company_account_id: number | null;
};

type CompanyMappingResponse = {
  success: true;
  data: {
    scope: "company";
    payment_methods: PaymentMethodConfig[];
    mappings: PaymentMethodMapping[];
  };
};

type OutletMappingResponse = {
  success: true;
  data: {
    scope: "outlet";
    outlet_id: number;
    payment_methods: PaymentMethodConfig[];
    mappings: EffectivePaymentMethodMapping[];
  };
};

type SaveResponse = {
  success: true;
  data: null;
};

type MappingScope = "company" | "outlet";

export function useOutletPaymentMethodMappings(
  outletId: number | null,
  accessToken: string,
  scope: MappingScope = "outlet"
) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [mappings, setMappings] = useState<PaymentMethodMapping[] | EffectivePaymentMethodMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const refetch = useCallback(async () => {
    if (scope === "company") {
      setLoading(true);
      setError(null);
      try {
        const response = await apiRequest<CompanyMappingResponse>(
          `/settings/outlet-payment-method-mappings?scope=company`,
          {},
          accessToken
        );
        setPaymentMethods(response.data.payment_methods);
        setMappings(response.data.mappings);
      } catch (fetchError) {
        if (fetchError instanceof ApiError) {
          setError(fetchError.message);
        } else {
          setError("Failed to load company payment method mappings");
        }
        setPaymentMethods([]);
        setMappings([]);
      } finally {
        setLoading(false);
      }
      return;
    }

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
      const response = await apiRequest<OutletMappingResponse>(
        `/settings/outlet-payment-method-mappings?scope=outlet&outlet_id=${outletId}`,
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
  }, [outletId, accessToken, scope]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function save(nextMappings: Array<{ method_code: string; account_id: number | ""; label?: string; is_invoice_default?: boolean }>) {
    if (scope === "company") {
      const filteredMappings = nextMappings
        .filter((m): m is { method_code: string; account_id: number; label?: string; is_invoice_default?: boolean } => m.account_id !== "")
        .map((m) => ({
          method_code: m.method_code,
          account_id: m.account_id,
          label: m.label?.trim() || undefined,
          is_invoice_default: m.is_invoice_default
        }));

      const response = await apiRequest<SaveResponse>(
        `/settings/outlet-payment-method-mappings`,
        {
          method: "PUT",
          body: JSON.stringify({ scope: "company", mappings: filteredMappings })
        },
        accessToken
      );
      return response;
    }

    if (!outletId) {
      throw new Error("Outlet ID required for outlet scope");
    }

    const filteredMappings = nextMappings.map((m) => {
      const hasAccount = m.account_id !== "";
      return {
        method_code: m.method_code,
        account_id: m.account_id,
        label: m.label?.trim() || undefined,
        is_invoice_default: hasAccount ? m.is_invoice_default : false
      };
    });

    const response = await apiRequest<SaveResponse>(
      `/settings/outlet-payment-method-mappings`,
      {
        method: "PUT",
        body: JSON.stringify({ scope: "outlet", outlet_id: outletId, mappings: filteredMappings })
      },
      accessToken
    );
    return response;
  }

  return { paymentMethods, mappings, loading, error, refetch, save, scope };
}
