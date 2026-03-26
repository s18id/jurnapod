// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest, ApiError } from "../lib/api-client";

type SalesInvoice = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  client_ref?: string | null;
  invoice_date: string;
  status: "DRAFT" | "POSTED" | "VOID";
  payment_status: "UNPAID" | "PARTIAL" | "PAID";
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  paid_total: number;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

type InvoicesResponse = {
  success: true;
  data: {
    total: number;
    invoices: SalesInvoice[];
  };
};

type UseSalesInvoicesOptions = {
  outlet_id?: number;
  status?: "DRAFT" | "POSTED" | "VOID";
  payment_status?: "UNPAID" | "PARTIAL" | "PAID";
  limit?: number;
};

/**
 * Hook: useSalesInvoices
 * Fetches list of sales invoices with optional filters
 */
export function useSalesInvoices(
  accessToken: string,
  options: UseSalesInvoicesOptions = {}
) {
  const [data, setData] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const refetch = useCallback(async () => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options.outlet_id) params.set("outlet_id", String(options.outlet_id));
      if (options.status) params.set("status", options.status);
      if (options.payment_status) params.set("payment_status", options.payment_status);
      params.set("limit", String(options.limit ?? 100));

      const response = await apiRequest<InvoicesResponse>(
        `/sales/invoices?${params}`,
        {},
        accessToken
      );
      if (requestSeq !== requestSeqRef.current) {
        return;
      }
      setData(response.data.invoices);
    } catch (fetchError) {
      if (requestSeq !== requestSeqRef.current) {
        return;
      }
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load invoices");
      }
      setData([]);
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [accessToken, options.outlet_id, options.status, options.payment_status, options.limit]);

  useEffect(() => {
    refetch().catch(console.error);
  }, [refetch]);

  return { data, loading, error, refetch };
}
