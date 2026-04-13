// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest, ApiError } from "../../lib/api-client";

type SalesOrderStatus = "DRAFT" | "CONFIRMED" | "COMPLETED" | "VOID";

type SalesOrderLine = {
  id: number;
  order_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

type SalesOrder = {
  id: number;
  company_id: number;
  outlet_id: number;
  outlet_name?: string;
  customer_id?: number;
  customer_name?: string;
  order_no: string;
  client_ref?: string | null;
  order_date: string;
  expected_date: string | null;
  status: SalesOrderStatus;
  notes: string | null;
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  confirmed_by_user_id: number | null;
  confirmed_at: string | null;
  completed_by_user_id: number | null;
  completed_at: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

type SalesOrderDetail = SalesOrder & { lines: SalesOrderLine[] };

type OrdersListResponse = {
  success: true;
  data: {
    total: number;
    orders: SalesOrder[];
  };
};

type OrderDetailResponse = {
  success: true;
  data: SalesOrderDetail;
};

type UseSalesOrdersOptions = {
  outlet_id?: number;
  status?: SalesOrderStatus;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
};

/**
 * Hook: useSalesOrders
 * Fetches list of sales orders with optional filters
 */
export function useSalesOrders(options: UseSalesOrdersOptions = {}) {
  const [data, setData] = useState<SalesOrder[]>([]);
  const [total, setTotal] = useState(0);
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
      if (options.date_from) params.set("date_from", options.date_from);
      if (options.date_to) params.set("date_to", options.date_to);
      params.set("limit", String(options.limit ?? 100));
      if (options.offset) params.set("offset", String(options.offset));

      const response = await apiRequest<OrdersListResponse>(
        `/sales/orders?${params}`,
        {}
      );
      if (requestSeq !== requestSeqRef.current) {
        return;
      }
      setData(response.data.orders);
      setTotal(response.data.total);
    } catch (fetchError) {
      if (requestSeq !== requestSeqRef.current) {
        return;
      }
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load orders");
      }
      setData([]);
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [options.outlet_id, options.status, options.date_from, options.date_to, options.limit, options.offset]);

  useEffect(() => {
    refetch().catch(console.error);
  }, [refetch]);

  return { data, total, loading, error, refetch };
}

/**
 * Hook: useSalesOrder
 * Fetches a single sales order by ID
 */
export function useSalesOrder(orderId: number | null) {
  const [data, setData] = useState<SalesOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const refetch = useCallback(async () => {
    if (orderId === null) {
      setData(null);
      return;
    }

    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;

    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<OrderDetailResponse>(
        `/sales/orders/${orderId}`,
        {}
      );
      if (requestSeq !== requestSeqRef.current) {
        return;
      }
      setData(response.data);
    } catch (fetchError) {
      if (requestSeq !== requestSeqRef.current) {
        return;
      }
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load order");
      }
      setData(null);
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [orderId]);

  useEffect(() => {
    refetch().catch(console.error);
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Hook: useCreateSalesOrder
 * Creates a new sales order
 */
export function useCreateSalesOrder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (payload: {
    outlet_id: number;
    order_date: string;
    expected_date?: string;
    notes?: string;
    lines: Array<{
      line_type: "SERVICE" | "PRODUCT";
      item_id?: number;
      description: string;
      qty: number;
      unit_price: number;
    }>;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{ success: true; data: SalesOrder }>(
        "/sales/orders",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );
      return response.data;
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create order");
      }
      throw createError;
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading, error };
}

/**
 * Hook: useUpdateSalesOrder
 * Updates an existing sales order
 */
export function useUpdateSalesOrder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(async (orderId: number, payload: {
    order_date?: string;
    expected_date?: string;
    notes?: string;
    lines?: Array<{
      line_type: "SERVICE" | "PRODUCT";
      item_id?: number;
      description: string;
      qty: number;
      unit_price: number;
    }>;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{ success: true; data: SalesOrder }>(
        `/sales/orders/${orderId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );
      return response.data;
    } catch (updateError) {
      if (updateError instanceof ApiError) {
        setError(updateError.message);
      } else {
        setError("Failed to update order");
      }
      throw updateError;
    } finally {
      setLoading(false);
    }
  }, []);

  return { update, loading, error };
}

/**
 * Hook: useConvertOrderToInvoice
 * Converts a sales order to invoice
 */
export function useConvertOrderToInvoice() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convert = useCallback(async (orderId: number, invoiceDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{
        success: true;
        data: {
          invoice_id: number;
          invoice_number: string;
          total_amount: number;
        };
      }>(
        `/sales/orders/${orderId}/convert-to-invoice`,
        {
          method: "POST",
          body: JSON.stringify({ invoice_date: invoiceDate })
        }
      );
      return response.data;
    } catch (convertError) {
      if (convertError instanceof ApiError) {
        setError(convertError.message);
      } else {
        setError("Failed to convert order to invoice");
      }
      throw convertError;
    } finally {
      setLoading(false);
    }
  }, []);

  return { convert, loading, error };
}

/**
 * Hook: useCancelSalesOrder
 * Cancels a sales order
 */
export function useCancelSalesOrder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback(async (orderId: number, reason: string) => {
    setLoading(true);
    setError(null);
    try {
      await apiRequest(
        `/sales/orders/${orderId}/cancel`,
        {
          method: "POST",
          body: JSON.stringify({ reason })
        }
      );
    } catch (cancelError) {
      if (cancelError instanceof ApiError) {
        setError(cancelError.message);
      } else {
        setError("Failed to cancel order");
      }
      throw cancelError;
    } finally {
      setLoading(false);
    }
  }, []);

  return { cancel, loading, error };
}

// Re-export types
export type { SalesOrder, SalesOrderDetail, SalesOrderLine, SalesOrderStatus, UseSalesOrdersOptions };