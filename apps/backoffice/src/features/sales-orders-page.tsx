// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Paper,
  Title,
  Stack,
  Group,
  Table,
  Badge,
  Button,
  TextInput,
  Select,
  NumberInput,
  Alert,
  ActionIcon,
  Menu,
  Text,
  Grid,
  Flex,
  Divider,
  Loader,
  ScrollArea,
  Modal,
  Card,
  ThemeIcon,
  SegmentedControl,
  Textarea,
  SimpleGrid
} from "@mantine/core";
import {
  IconPlus,
  IconTrash,
  IconEdit,
  IconDotsVertical,
  IconAlertCircle,
  IconFileInvoice,
  IconCalendar,
  IconX,
  IconCheck,
  IconFileExport,
  IconArrowLeft
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { apiRequest, ApiError } from "../lib/api-client";
import { CacheService } from "../lib/cache-service";
import { useOnlineStatus } from "../lib/connection";
import type { SessionUser } from "../lib/session";

type SalesOrderStatus = "DRAFT" | "CONFIRMED" | "COMPLETED" | "VOID";
type LineType = "SERVICE" | "PRODUCT";

type InventoryItem = {
  id: number;
  name: string;
  type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
  is_active: boolean;
};

type SalesOrderLine = {
  id: number;
  order_id: number;
  line_no: number;
  line_type: LineType;
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
  lines?: SalesOrderLine[];
  converted_invoice_id?: number | null;
  converted_invoice_number?: string | null;
};

type SalesOrderDetail = SalesOrder & { lines: SalesOrderLine[] };

type OrdersListResponse = { success: true; data: { total: number; orders: SalesOrder[] } };
type OrderDetailResponse = { success: true; data: SalesOrderDetail };

const LINE_TYPE_OPTIONS = [
  { value: "SERVICE", label: "Service" },
  { value: "PRODUCT", label: "Product" }
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatDateOnly(value: string): string {
  return parseDateOnly(value).toLocaleDateString("id-ID");
}

// Date-only helpers to avoid timezone issues
function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateOnlyLocal(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function getTodayDateOnlyLocal(): string {
  return formatDateOnlyLocal(new Date());
}

function getStatusBadgeColor(status: SalesOrderStatus): string {
  switch (status) {
    case "DRAFT":
      return "gray";
    case "CONFIRMED":
      return "yellow";
    case "COMPLETED":
      return "green";
    case "VOID":
      return "red";
    default:
      return "gray";
  }
}

function getOrderStatusLabel(status: SalesOrderStatus): string {
  switch (status) {
    case "COMPLETED":
      return "Converted";
    case "VOID":
      return "Cancelled";
    default:
      return status;
  }
}

type SalesOrdersPageProps = {
  user: SessionUser;
};

type OrderLineDraft = {
  line_type: LineType;
  item_id: number | null;
  description: string;
  qty: string;
  unit_price: string;
};

type OrderDraft = {
  outlet_id: number;
  customer_id: string;
  order_date: string;
  expected_date: string;
  notes: string;
  lines: OrderLineDraft[];
};

type OrderEditDraft = OrderDraft & {
  id: number;
};

const emptyLineDraft: OrderLineDraft = {
  line_type: "SERVICE",
  item_id: null,
  description: "",
  qty: "1",
  unit_price: "0"
};

export function SalesOrdersPage(props: SalesOrdersPageProps) {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ color: "yellow" | "blue"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedOutletId, setSelectedOutletId] = useState<number>(
    props.user.outlets[0]?.id ?? 0
  );
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFromFilter, setDateFromFilter] = useState<string>("");
  const [dateToFilter, setDateToFilter] = useState<string>("");
  
  // Detail view state
  const [viewingOrderId, setViewingOrderId] = useState<number | null>(null);
  const [viewingOrder, setViewingOrder] = useState<SalesOrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // Items for product selection
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  
  // Customers for dropdown
  const [customers, setCustomers] = useState<Array<{ id: number; name: string }>>([]);
  
  // Confirmation dialogs
  const [confirmAction, setConfirmAction] = useState<{ type: "confirm" | "complete" | "cancel" | "void"; orderId: number } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  
  // Convert to invoice modal
  const [convertModal, setConvertModal] = useState<{ isOpen: boolean; orderId: number } | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertInvoiceDate, setConvertInvoiceDate] = useState(getTodayDateOnlyLocal());

  const isOnline = useOnlineStatus();

  // Load items for product selection (works offline via cache)
  useEffect(() => {
    async function loadItems() {
      setItemsLoading(true);
      try {
        const itemsData = await CacheService.getCachedItems(
          props.user.company_id,
          { allowStale: true }
        );
        // Normalize items to expected shape
        const normalizedItems: InventoryItem[] = (itemsData as unknown[]).map((item: unknown) => {
          const i = item as Record<string, unknown>;
          return {
            id: Number(i.id),
            name: String(i.name ?? ""),
            type: (i.type as InventoryItem["type"]) ?? "PRODUCT",
            is_active: Boolean(i.is_active ?? true)
          };
        });
        setItems(normalizedItems);
      } catch {
        // Silently fail - items are optional
      } finally {
        setItemsLoading(false);
      }
    }
    loadItems();
  }, [props.user.company_id]);

  // Fetch customers for dropdown
  useEffect(() => {
    if (!isOnline) return;
    apiRequest<{ data: Array<{ id: number; name: string }> }>(
      `/customers?company_id=${props.user.company_id}`
    ).then((response) => setCustomers(response.data)).catch(() => {
      // Silently fail - customers are optional
    });
  }, [isOnline, props.user.company_id]);

  // Product items only (for dropdown)
  const productItems = useMemo(() => {
    return items.filter((item) => item.type === "PRODUCT" && item.is_active);
  }, [items]);

  // Item options for select
  const itemOptions = useMemo(() => {
    return [
      { value: "", label: "Select item..." },
      ...productItems.map((item) => ({ value: String(item.id), label: item.name }))
    ];
  }, [productItems]);

  const [newOrder, setNewOrder] = useState<OrderDraft>(() => {
    const today = getTodayDateOnlyLocal();
    return {
      outlet_id: props.user.outlets[0]?.id ?? 0,
      customer_id: "",
      order_date: today,
      expected_date: "",
      notes: "",
      lines: [{ ...emptyLineDraft }]
    };
  });
  const [editingOrder, setEditingOrder] = useState<OrderEditDraft | null>(null);

  async function refreshData(outletId: number) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const params = new URLSearchParams();
      params.set("outlet_id", String(outletId));
      params.set("limit", "100");
      if (statusFilter) params.set("status", statusFilter);
      if (dateFromFilter) params.set("date_from", dateFromFilter);
      if (dateToFilter) params.set("date_to", dateToFilter);

      const response = await apiRequest<OrdersListResponse>(
        `/sales/orders?${params.toString()}`
      );
      setOrders(response.data.orders);
      setOrdersTotal(response.data.total);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load orders");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedOutletId > 0) {
      refreshData(selectedOutletId).catch(() => {});
    }
  }, [selectedOutletId, statusFilter, dateFromFilter, dateToFilter]);

  function handleOutletChange(value: string | null) {
    if (value) {
      setSelectedOutletId(Number(value));
    }
  }

  function resetNewOrder() {
    const today = getTodayDateOnlyLocal();
    setNewOrder({
      outlet_id: props.user.outlets[0]?.id ?? 0,
      customer_id: "",
      order_date: today,
      expected_date: "",
      notes: "",
      lines: [{ ...emptyLineDraft }]
    });
  }

  function buildLinePayload(line: OrderLineDraft) {
    const payload: {
      line_type: LineType;
      item_id?: number;
      description: string;
      qty: number;
      unit_price: number;
    } = {
      line_type: line.line_type,
      description: line.description.trim(),
      qty: Number(line.qty),
      unit_price: Number(line.unit_price)
    };
    
    if (line.line_type === "PRODUCT" && line.item_id) {
      payload.item_id = line.item_id;
    }
    
    return payload;
  }

  function validateOrderDraft(order: OrderDraft): string | null {
    if (!order.order_date.trim()) {
      return "Order date is required";
    }

    if (!order.outlet_id || order.outlet_id <= 0) {
      return "Outlet is required";
    }

    const lines = order.lines;
    if (lines.length === 0) {
      return "Order must have at least one line item";
    }

    for (const line of lines) {
      // Validate quantity for all lines
      if (Number(line.qty) <= 0) {
        return "Quantity must be greater than 0";
      }

      // All lines require description per API contract
      if (!line.description.trim()) {
        return "All lines must include a description";
      }

      // PRODUCT lines require item_id
      if (line.line_type === "PRODUCT" && !line.item_id) {
        return "Product lines must have an item selected";
      }
    }

    return null;
  }

  async function createOrder() {
    const validationError = validateOrderDraft(newOrder);
    if (validationError) {
      setError(validationError);
      return;
    }

    const lines = newOrder.lines.map(buildLinePayload);

    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        outlet_id: newOrder.outlet_id,
        customer_id: newOrder.customer_id ? Number(newOrder.customer_id) : undefined,
        order_date: newOrder.order_date,
        notes: newOrder.notes || undefined,
        lines
      };

      if (newOrder.expected_date.trim()) {
        payload.expected_date = newOrder.expected_date;
      }

      await apiRequest(
        "/sales/orders",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );
      resetNewOrder();
      await refreshData(selectedOutletId);
      setNotice({ color: "blue", message: "Order created successfully." });
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create order");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function loadOrderForEdit(orderId: number) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<OrderDetailResponse>(
        `/sales/orders/${orderId}`
      );
      const order = response.data;
      setEditingOrder({
        id: order.id,
        outlet_id: order.outlet_id,
        customer_id: order.customer_id ? String(order.customer_id) : "",
        order_date: order.order_date,
        expected_date: order.expected_date ?? "",
        notes: order.notes ?? "",
        lines: (order.lines || []).map((line) => ({
          line_type: line.line_type,
          item_id: line.item_id,
          description: line.description,
          qty: String(line.qty),
          unit_price: String(line.unit_price)
        }))
      });
    } catch (loadError) {
      if (loadError instanceof ApiError) {
        setError(loadError.message);
      } else {
        setError("Failed to load order detail");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function loadOrderDetail(orderId: number) {
    setLoadingDetail(true);
    setError(null);
    try {
      const response = await apiRequest<OrderDetailResponse>(
        `/sales/orders/${orderId}`
      );
      setViewingOrder(response.data);
    } catch (loadError) {
      if (loadError instanceof ApiError) {
        setError(loadError.message);
      } else {
        setError("Failed to load order detail");
      }
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    if (viewingOrderId !== null) {
      loadOrderDetail(viewingOrderId);
    }
  }, [viewingOrderId]);

  async function saveOrderEdit() {
    if (!editingOrder) {
      return;
    }

    const validationError = validateOrderDraft(editingOrder);
    if (validationError) {
      setError(validationError);
      return;
    }

    const lines = editingOrder.lines.map(buildLinePayload);

    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        order_date: editingOrder.order_date,
        customer_id: editingOrder.customer_id ? Number(editingOrder.customer_id) : undefined,
        notes: editingOrder.notes || undefined,
        lines
      };

      if (editingOrder.outlet_id) {
        payload.outlet_id = editingOrder.outlet_id;
      }

      if (editingOrder.expected_date.trim()) {
        payload.expected_date = editingOrder.expected_date;
      }

      await apiRequest(
        `/sales/orders/${editingOrder.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );
      setEditingOrder(null);
      await refreshData(selectedOutletId);
      if (viewingOrderId) {
        await loadOrderDetail(viewingOrderId);
      }
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      } else {
        setError("Failed to update order");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmOrderById(orderId: number) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/sales/orders/${orderId}/confirm`, { method: "POST" });
      await refreshData(selectedOutletId);
      if (viewingOrderId === orderId) {
        await loadOrderDetail(orderId);
      }
    } catch (confirmError) {
      if (confirmError instanceof ApiError) {
        setError(confirmError.message);
      } else {
        setError("Failed to confirm order");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function completeOrderById(orderId: number) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/sales/orders/${orderId}/complete`, { method: "POST" });
      await refreshData(selectedOutletId);
      if (viewingOrderId === orderId) {
        await loadOrderDetail(orderId);
      }
    } catch (completeError) {
      if (completeError instanceof ApiError) {
        setError(completeError.message);
      } else {
        setError("Failed to complete order");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelOrderById(orderId: number, reason: string) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/sales/orders/${orderId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      await refreshData(selectedOutletId);
      if (viewingOrderId === orderId) {
        await loadOrderDetail(orderId);
      }
      setCancelReason("");
    } catch (cancelError) {
      if (cancelError instanceof ApiError) {
        setError(cancelError.message);
      } else {
        setError("Failed to cancel order");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function convertToInvoice(orderId: number, invoiceDate: string) {
    setConverting(true);
    setError(null);
    try {
      await apiRequest(`/sales/orders/${orderId}/convert-to-invoice`, {
        method: "POST",
        body: JSON.stringify({ invoice_date: invoiceDate })
      });
      setConvertModal(null);
      setNotice({ color: "blue", message: `Order converted to invoice successfully. Order status changed to "Converted".` });
      await refreshData(selectedOutletId);
      if (viewingOrderId === orderId) {
        await loadOrderDetail(orderId);
      }
    } catch (convertError) {
      if (convertError instanceof ApiError) {
        setError(convertError.message);
      } else {
        setError("Failed to convert order to invoice");
      }
    } finally {
      setConverting(false);
    }
  }

  function handleConfirmClick(orderId: number) {
    setConfirmAction({ type: "confirm", orderId });
  }

  function handleCompleteClick(orderId: number) {
    setConfirmAction({ type: "complete", orderId });
  }

  function handleCancelClick(orderId: number) {
    setConfirmAction({ type: "cancel", orderId });
  }

  async function executeConfirmedAction() {
    if (!confirmAction) return;
    
    if (confirmAction.type === "confirm") {
      await confirmOrderById(confirmAction.orderId);
    } else if (confirmAction.type === "complete") {
      await completeOrderById(confirmAction.orderId);
    } else if (confirmAction.type === "cancel") {
      if (cancelReason.trim()) {
        await cancelOrderById(confirmAction.orderId, cancelReason);
      }
    }
    setConfirmAction(null);
  }

  const outletOptions = props.user.outlets.map((outlet) => ({
    value: String(outlet.id),
    label: outlet.name
  }));

  // Calculate KPIs
  const draftCount = useMemo(() => {
    return orders.filter((o) => o.status === "DRAFT").length;
  }, [orders]);

  const confirmedCount = useMemo(() => {
    return orders.filter((o) => o.status === "CONFIRMED").length;
  }, [orders]);

  const totalOrderValue = useMemo(() => {
    return orders
      .filter((o) => o.status !== "VOID")
      .reduce((sum, o) => sum + o.grand_total, 0);
  }, [orders]);

  const renderOrderForm = (
    order: OrderDraft,
    setOrder: React.Dispatch<React.SetStateAction<OrderDraft>>,
    onSubmit: () => void,
    onCancel?: () => void,
    isEdit = false
  ) => (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={4}>{isEdit ? `Edit Order #${(order as OrderEditDraft).id}` : "Create New Order"}</Title>
          {isEdit && (
            <Button variant="subtle" color="gray" onClick={onCancel} size="sm">
              Cancel
            </Button>
          )}
        </Group>

        <Divider />

        <Grid>
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Select
              label="Outlet"
              data={outletOptions}
              value={String(order.outlet_id)}
              onChange={(value) => {
                if (value) {
                  setOrder((prev) => ({ ...prev, outlet_id: Number(value) }));
                }
              }}
              required
              disabled={isEdit}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Select
              label="Customer"
              data={[
                { value: "", label: "Select customer..." },
                ...customers.map((c) => ({ value: String(c.id), label: c.name }))
              ]}
              value={order.customer_id}
              onChange={(value) => {
                setOrder((prev) => ({ ...prev, customer_id: value || "" }));
              }}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <TextInput
              label="Order Date"
              type="date"
              value={order.order_date}
              onChange={(e) =>
                setOrder((prev) => ({ ...prev, order_date: e.target.value }))
              }
              required
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <TextInput
              label="Expected Delivery Date"
              type="date"
              value={order.expected_date}
              onChange={(e) =>
                setOrder((prev) => ({ ...prev, expected_date: e.target.value }))
              }
            />
          </Grid.Col>
        </Grid>

        <Textarea
          label="Notes"
          placeholder="Optional notes for this order"
          value={order.notes}
          onChange={(e) =>
            setOrder((prev) => ({ ...prev, notes: e.target.value }))
          }
          rows={2}
        />

        <Divider label="Line Items" labelPosition="left" />

        <Stack gap="xs">
          {order.lines.map((line, index) => (
            <Grid key={`line-${index}`} align="flex-start" gutter="xs">
              <Grid.Col span={{ base: 12, sm: 2 }}>
                <Select
                  label={index === 0 ? "Type" : undefined}
                  data={LINE_TYPE_OPTIONS}
                  value={line.line_type}
                  onChange={(value) => {
                    const newType = (value as LineType) ?? "SERVICE";
                    setOrder((prev) => ({
                      ...prev,
                      lines: prev.lines.map((entry, lineIndex) =>
                        lineIndex === index 
                          ? { ...entry, line_type: newType, item_id: newType === "SERVICE" ? null : entry.item_id } 
                          : entry
                      )
                    }));
                  }}
                  size="sm"
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 3 }}>
                {line.line_type === "PRODUCT" ? (
                  <Select
                    label={index === 0 ? "Item" : undefined}
                    data={itemOptions}
                    value={line.item_id ? String(line.item_id) : ""}
                    onChange={(value) => {
                      const itemId = value ? Number(value) : null;
                      const selectedItem = itemId ? productItems.find(i => i.id === itemId) : null;
                      setOrder((prev) => ({
                        ...prev,
                        lines: prev.lines.map((entry, lineIndex) =>
                          lineIndex === index 
                            ? { 
                                ...entry, 
                                item_id: itemId,
                                description: selectedItem ? selectedItem.name : entry.description
                              } 
                            : entry
                        )
                      }));
                    }}
                    disabled={itemsLoading || productItems.length === 0}
                    placeholder={itemsLoading ? "Loading..." : "Select item"}
                    size="sm"
                  />
                ) : (
                  <TextInput
                    label={index === 0 ? "Description" : undefined}
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) =>
                      setOrder((prev) => ({
                        ...prev,
                        lines: prev.lines.map((entry, lineIndex) =>
                          lineIndex === index ? { ...entry, description: e.target.value } : entry
                        )
                      }))
                    }
                    size="sm"
                  />
                )}
              </Grid.Col>
              {line.line_type === "PRODUCT" && (
                <Grid.Col span={{ base: 12, sm: 2 }}>
                  <TextInput
                    label={index === 0 ? "Description" : undefined}
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) =>
                      setOrder((prev) => ({
                        ...prev,
                        lines: prev.lines.map((entry, lineIndex) =>
                          lineIndex === index ? { ...entry, description: e.target.value } : entry
                        )
                      }))
                    }
                    size="sm"
                  />
                </Grid.Col>
              )}
              <Grid.Col span={{ base: 6, sm: 2 }}>
                <NumberInput
                  label={index === 0 ? "Qty" : undefined}
                  placeholder="Qty"
                  value={Number(line.qty) || 0}
                  onChange={(value) =>
                    setOrder((prev) => ({
                      ...prev,
                      lines: prev.lines.map((entry, lineIndex) =>
                        lineIndex === index ? { ...entry, qty: String(value ?? 0) } : entry
                      )
                    }))
                  }
                  min={0.01}
                  step={1}
                  decimalScale={2}
                  hideControls
                  size="sm"
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 2 }}>
                <NumberInput
                  label={index === 0 ? "Unit Price" : undefined}
                  placeholder="Unit Price"
                  value={Number(line.unit_price) || 0}
                  onChange={(value) =>
                    setOrder((prev) => ({
                      ...prev,
                      lines: prev.lines.map((entry, lineIndex) =>
                        lineIndex === index ? { ...entry, unit_price: String(value ?? 0) } : entry
                      )
                    }))
                  }
                  min={0}
                  prefix="Rp "
                  thousandSeparator="."
                  decimalSeparator=","
                  hideControls
                  size="sm"
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 1 }}>
                {order.lines.length > 1 && (
                  <ActionIcon
                    color="red"
                    variant="light"
                    onClick={() =>
                      setOrder((prev) => ({
                        ...prev,
                        lines: prev.lines.filter((_, lineIndex) => lineIndex !== index)
                      }))
                    }
                    mt={index === 0 ? 24 : 0}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Grid.Col>
            </Grid>
          ))}
        </Stack>

        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={() =>
            setOrder((prev) => ({
              ...prev,
              lines: [...prev.lines, { ...emptyLineDraft }]
            }))
          }
          size="sm"
          style={{ alignSelf: "flex-start" }}
        >
          Add Line
        </Button>

        <Group justify="flex-end" gap="sm">
          {isEdit && (
            <Button variant="default" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            onClick={onSubmit}
            loading={submitting}
            leftSection={isEdit ? <IconCheck size={16} /> : <IconPlus size={16} />}
          >
            {isEdit ? "Save Changes" : "Create Order"}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );

  // Detail View
  if (viewingOrder) {
    const order = viewingOrder;
    const canEdit = ["DRAFT", "CONFIRMED"].includes(order.status) && !order.converted_invoice_id;
    const canConfirm = order.status === "DRAFT" && !order.converted_invoice_id;
    const canComplete = order.status === "CONFIRMED" && !order.converted_invoice_id;
    const canConvert = order.status === "CONFIRMED" && !order.converted_invoice_id;
    const canCancel = ["DRAFT", "CONFIRMED"].includes(order.status) && !order.converted_invoice_id;

    return (
      <Stack gap="md" p="md">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <Button 
              variant="subtle" 
              color="gray" 
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => {
                setViewingOrderId(null);
                setViewingOrder(null);
              }}
            >
              Back to List
            </Button>
          </Group>
          <Group gap="sm">
            {canEdit && (
              <Button
                variant="light"
                leftSection={<IconEdit size={16} />}
                onClick={() => loadOrderForEdit(order.id)}
              >
                Edit
              </Button>
            )}
            {canConfirm && (
              <Button
                variant="light"
                color="blue"
                leftSection={<IconCheck size={16} />}
                onClick={() => handleConfirmClick(order.id)}
                loading={submitting}
              >
                Confirm
              </Button>
            )}
            {canComplete && (
              <Button
                variant="light"
                color="green"
                leftSection={<IconCheck size={16} />}
                onClick={() => handleCompleteClick(order.id)}
                loading={submitting}
              >
                Complete
              </Button>
            )}
            {canConvert && (
              <Button
                variant="light"
                color="blue"
                leftSection={<IconFileExport size={16} />}
                onClick={() => setConvertModal({ isOpen: true, orderId: order.id })}
              >
                Convert to Invoice
              </Button>
            )}
            {canCancel && (
              <Button
                variant="light"
                color="red"
                leftSection={<IconX size={16} />}
                onClick={() => handleCancelClick(order.id)}
                loading={submitting}
              >
                Cancel
              </Button>
            )}
          </Group>
        </Group>

        <Card withBorder shadow="sm" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Title order={2}>Order #{order.order_no}</Title>
                <Text c="dimmed" size="sm">
                  {formatDateOnly(order.order_date)}
                  {order.expected_date && ` → ${formatDateOnly(order.expected_date)}`}
                </Text>
              </div>
              <Badge color={getStatusBadgeColor(order.status)} size="lg" variant="light">
                {getOrderStatusLabel(order.status)}
              </Badge>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>Outlet</Text>
                <Text fw={500}>{order.outlet_name || `#${order.outlet_id}`}</Text>
              </div>
              {order.customer_name && (
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={500}>Customer</Text>
                  <Text fw={500}>{order.customer_name}</Text>
                </div>
              )}
              {order.converted_invoice_number && (
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={500}>Converted to Invoice</Text>
                  <Text fw={500} c="blue">{order.converted_invoice_number}</Text>
                </div>
              )}
            </SimpleGrid>

            {order.notes && (
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>Notes</Text>
                <Text>{order.notes}</Text>
              </div>
            )}
          </Stack>
        </Card>

        {/* Line Items */}
        <Card withBorder shadow="sm" padding="md">
          <Stack gap="md">
            <Title order={4}>Line Items</Title>
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>#</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th ta="right">Qty</Table.Th>
                  <Table.Th ta="right">Unit Price</Table.Th>
                  <Table.Th ta="right">Line Total</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(order.lines || []).map((line) => (
                  <Table.Tr key={line.id}>
                    <Table.Td>{line.line_no}</Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light">
                        {line.line_type}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{line.description}</Table.Td>
                    <Table.Td ta="right">{line.qty}</Table.Td>
                    <Table.Td ta="right">{formatCurrency(line.unit_price)}</Table.Td>
                    <Table.Td ta="right" fw={500}>{formatCurrency(line.line_total)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            <Divider />

            <Group justify="flex-end">
              <Stack gap="xs" style={{ minWidth: 250 }}>
                <Group justify="space-between">
                  <Text c="dimmed">Subtotal</Text>
                  <Text fw={500}>{formatCurrency(order.subtotal)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text c="dimmed">Tax</Text>
                  <Text fw={500}>{formatCurrency(order.tax_amount)}</Text>
                </Group>
                <Divider />
                <Group justify="space-between">
                  <Text fw={600}>Grand Total</Text>
                  <Text fw={700} size="lg">{formatCurrency(order.grand_total)}</Text>
                </Group>
              </Stack>
            </Group>
          </Stack>
        </Card>

        {/* Confirmation Modal */}
        <Modal
          opened={confirmAction !== null}
          onClose={() => {
            setConfirmAction(null);
            setCancelReason("");
          }}
          title={
            confirmAction?.type === "confirm"
              ? "Confirm Order"
              : confirmAction?.type === "complete"
              ? "Complete Order"
              : "Cancel Order"
          }
          centered
        >
          <Stack gap="md">
            {confirmAction?.type === "cancel" ? (
              <>
                <Text>Please provide a reason for cancelling this order:</Text>
                <Textarea
                  placeholder="Cancellation reason..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                />
              </>
            ) : (
              <Text>
                {confirmAction?.type === "confirm"
                  ? "Are you sure you want to confirm this order? This will reserve the items."
                  : "Are you sure you want to mark this order as complete?"}
              </Text>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => {
                setConfirmAction(null);
                setCancelReason("");
              }}>
                Cancel
              </Button>
              <Button 
                color={confirmAction?.type === "cancel" ? "red" : "blue"}
                onClick={executeConfirmedAction}
                loading={submitting}
                disabled={confirmAction?.type === "cancel" && !cancelReason.trim()}
              >
                Confirm
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Convert to Invoice Modal */}
        <Modal
          opened={convertModal?.isOpen === true}
          onClose={() => setConvertModal(null)}
          title="Convert to Invoice"
          centered
          size="lg"
        >
          <Stack gap="md">
            <Alert color="blue" variant="light">
              This will create an invoice from this order. The order status will change to indicate it has been converted.
            </Alert>

            <Grid>
              <Grid.Col span={6}>
                <Text size="sm" fw={500}>Order Number</Text>
                <Text>{order.order_no}</Text>
              </Grid.Col>
              <Grid.Col span={6}>
                <Text size="sm" fw={500}>Order Total</Text>
                <Text fw={700}>{formatCurrency(order.grand_total)}</Text>
              </Grid.Col>
            </Grid>

            <TextInput
              label="Invoice Date"
              type="date"
              value={convertInvoiceDate}
              onChange={(e) => setConvertInvoiceDate(e.target.value)}
              required
            />

            <Divider label="Line Items Preview" labelPosition="left" />

            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Description</Table.Th>
                  <Table.Th ta="right">Qty</Table.Th>
                  <Table.Th ta="right">Unit Price</Table.Th>
                  <Table.Th ta="right">Total</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(order.lines || []).map((line) => (
                  <Table.Tr key={line.id}>
                    <Table.Td>{line.description}</Table.Td>
                    <Table.Td ta="right">{line.qty}</Table.Td>
                    <Table.Td ta="right">{formatCurrency(line.unit_price)}</Table.Td>
                    <Table.Td ta="right" fw={500}>{formatCurrency(line.line_total)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            <Group justify="flex-end">
              <Stack gap="xs" style={{ minWidth: 200 }}>
                <Group justify="space-between">
                  <Text c="dimmed">Subtotal</Text>
                  <Text fw={500}>{formatCurrency(order.subtotal)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text c="dimmed">Tax</Text>
                  <Text fw={500}>{formatCurrency(order.tax_amount)}</Text>
                </Group>
                <Divider />
                <Group justify="space-between">
                  <Text fw={600}>Invoice Total</Text>
                  <Text fw={700} size="lg">{formatCurrency(order.grand_total)}</Text>
                </Group>
              </Stack>
            </Group>

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setConvertModal(null)}>
                Cancel
              </Button>
              <Button
                color="blue"
                leftSection={<IconFileInvoice size={16} />}
                onClick={() => {
                  if (!convertInvoiceDate.trim()) {
                    setError("Invoice date is required");
                    return;
                  }
                  convertToInvoice(order.id, convertInvoiceDate);
                }}
                loading={converting}
                disabled={!convertInvoiceDate.trim()}
              >
                Create Invoice
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    );
  }

  // Edit View
  if (editingOrder) {
    return (
      <Stack gap="lg" p="md">
        <Group justify="space-between" align="center">
          <Button 
            variant="subtle" 
            color="gray" 
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => setEditingOrder(null)}
          >
            Cancel Edit
          </Button>
        </Group>

        {error && (
          <Alert color="red" icon={<IconAlertCircle size={16} />} onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        {renderOrderForm(editingOrder, setEditingOrder as React.Dispatch<React.SetStateAction<OrderDraft>>, saveOrderEdit, () => setEditingOrder(null), true)}
      </Stack>
    );
  }

  // List View
  return (
    <Stack gap="lg" p="md">
      {/* Header Card */}
      <Card withBorder shadow="sm" padding="lg">
        <Group justify="space-between" align="flex-start">
          <Stack gap="xs">
            <Group gap="xs">
              <ThemeIcon size={40} radius="md" variant="light" color="blue">
                <IconFileInvoice size={24} />
              </ThemeIcon>
              <div>
                <Title order={2}>Sales Orders</Title>
                <Text size="sm" c="dimmed">
                  Manage sales orders with confirmation and invoice conversion workflow
                </Text>
              </div>
            </Group>
          </Stack>
          <Group gap="md" align="center">
            <Select
              label="Outlet"
              data={outletOptions}
              value={String(selectedOutletId)}
              onChange={handleOutletChange}
              style={{ minWidth: 180 }}
            />
            <Badge size="lg" variant="light">
              {ordersTotal > orders.length
                ? `Loaded ${orders.length} of ${ordersTotal}`
                : `${ordersTotal} order${ordersTotal !== 1 ? "s" : ""}`}
            </Badge>
            {!isOnline && <Badge color="yellow" variant="light">Offline</Badge>}
          </Group>
        </Group>
      </Card>

      {!isOnline && (
        <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
          You are offline. Orders will be queued for sync when connection is restored.
        </Alert>
      )}

      {error && (
        <Alert color="red" icon={<IconAlertCircle size={16} />} onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      {notice && (
        <Alert color={notice.color} icon={<IconAlertCircle size={16} />} onClose={() => setNotice(null)} withCloseButton>
          {notice.message}
        </Alert>
      )}

      {/* KPI Cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
        <Card withBorder padding="md">
          <Stack gap={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
              Total Orders
            </Text>
            <Text size="xl" fw={700}>{ordersTotal}</Text>
            <Text size="xs" c="dimmed">Loaded {orders.length}</Text>
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Stack gap={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
              Draft Orders
            </Text>
            <Text size="xl" fw={700} c="blue">{draftCount}</Text>
            <Text size="xs" c="dimmed">Pending confirmation</Text>
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Stack gap={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
              Confirmed Orders
            </Text>
            <Text size="xl" fw={700} c="yellow">{confirmedCount}</Text>
            <Text size="xs" c="dimmed">Ready for fulfillment</Text>
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Stack gap={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
              Total Order Value
            </Text>
            <Text size="xl" fw={700} c="blue">
              {formatCurrency(totalOrderValue)}
            </Text>
            <Text size="xs" c="dimmed">Based on loaded rows</Text>
          </Stack>
        </Card>
      </SimpleGrid>

      {/* Order Form */}
      {!editingOrder && renderOrderForm(newOrder, setNewOrder, createOrder)}

      {/* Order List */}
      <Card withBorder shadow="sm" padding="md">
        <Stack gap="md">
          {/* Filters */}
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
            <Title order={4}>Order History</Title>
            <Group gap="sm" align="flex-start" wrap="wrap">
              <TextInput
                label="From"
                type="date"
                value={dateFromFilter}
                onChange={(e) => setDateFromFilter(e.target.value)}
                leftSection={<IconCalendar size={16} />}
                style={{ minWidth: 140 }}
              />
              <TextInput
                label="To"
                type="date"
                value={dateToFilter}
                onChange={(e) => setDateToFilter(e.target.value)}
                leftSection={<IconCalendar size={16} />}
                style={{ minWidth: 140 }}
              />
              <Button
                variant="subtle"
                size="sm"
                onClick={() => {
                  setStatusFilter("");
                  setDateFromFilter("");
                  setDateToFilter("");
                }}
                disabled={!statusFilter && !dateFromFilter && !dateToFilter}
                mt={26}
              >
                Reset
              </Button>
            </Group>
          </Group>

          {/* Status Filter Tabs */}
          <SegmentedControl
            value={statusFilter || "ALL"}
            onChange={(value) => setStatusFilter(value === "ALL" ? "" : value)}
            data={[
              { label: "All", value: "ALL" },
              { label: "Draft", value: "DRAFT" },
              { label: "Confirmed", value: "CONFIRMED" },
              { label: "Converted", value: "COMPLETED" },
              { label: "Cancelled", value: "VOID" }
            ]}
          />

          <Divider />

          {loading || loadingDetail ? (
            <Flex justify="center" p="xl">
              <Loader />
            </Flex>
          ) : orders.length === 0 ? (
            <Alert color="blue" variant="light">
              No orders found for this outlet.
            </Alert>
          ) : (
            <ScrollArea>
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Order No</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th ta="center">Expected</Table.Th>
                    <Table.Th ta="center">Status</Table.Th>
                    <Table.Th ta="right">Subtotal</Table.Th>
                    <Table.Th ta="right">Tax</Table.Th>
                    <Table.Th ta="right">Total</Table.Th>
                    <Table.Th ta="center">Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {orders.map((order) => (
                    <Table.Tr key={order.id}>
                      <Table.Td>
                        <Text fw={500} style={{ cursor: "pointer" }} onClick={() => setViewingOrderId(order.id)}>
                          {order.order_no}
                        </Text>
                      </Table.Td>
                      <Table.Td>{formatDateOnly(order.order_date)}</Table.Td>
                      <Table.Td>
                        {order.expected_date ? formatDateOnly(order.expected_date) : "—"}
                      </Table.Td>
                      <Table.Td ta="center">
                        <Badge color={getStatusBadgeColor(order.status)} size="sm">
                          {getOrderStatusLabel(order.status)}
                        </Badge>
                      </Table.Td>
                      <Table.Td ta="right">
                        {formatCurrency(order.subtotal)}
                      </Table.Td>
                      <Table.Td ta="right">
                        {formatCurrency(order.tax_amount)}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text fw={500}>{formatCurrency(order.grand_total)}</Text>
                      </Table.Td>
                      <Table.Td ta="center">
                        <Menu position="bottom-end" withArrow>
                          <Menu.Target>
                            <ActionIcon variant="subtle" disabled={submitting}>
                              <IconDotsVertical size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<IconFileInvoice size={14} />}
                              onClick={() => setViewingOrderId(order.id)}
                            >
                              View Details
                            </Menu.Item>
                            {["DRAFT", "CONFIRMED"].includes(order.status) && !order.converted_invoice_id && (
                              <Menu.Item
                                leftSection={<IconEdit size={14} />}
                                onClick={() => loadOrderForEdit(order.id)}
                              >
                                Edit
                              </Menu.Item>
                            )}
                            {order.status === "DRAFT" && (
                              <Menu.Item
                                leftSection={<IconCheck size={14} />}
                                onClick={() => handleConfirmClick(order.id)}
                              >
                                Confirm
                              </Menu.Item>
                            )}
                            {order.status === "CONFIRMED" && (
                              <Menu.Item
                                leftSection={<IconCheck size={14} />}
                                onClick={() => handleCompleteClick(order.id)}
                              >
                                Complete
                              </Menu.Item>
                            )}
                            {order.status === "CONFIRMED" && !order.converted_invoice_id && (
                              <Menu.Item
                                leftSection={<IconFileExport size={14} />}
                                onClick={() => setConvertModal({ isOpen: true, orderId: order.id })}
                              >
                                Convert to Invoice
                              </Menu.Item>
                            )}
                            {["DRAFT", "CONFIRMED"].includes(order.status) && !order.converted_invoice_id && (
                              <Menu.Divider />
                            )}
                            {["DRAFT", "CONFIRMED"].includes(order.status) && !order.converted_invoice_id && (
                              <Menu.Item
                                leftSection={<IconX size={14} />}
                                color="red"
                                onClick={() => handleCancelClick(order.id)}
                              >
                                Cancel
                              </Menu.Item>
                            )}
                          </Menu.Dropdown>
                        </Menu>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Stack>
      </Card>

      {/* Convert to Invoice Modal (for list view) */}
      <Modal
        opened={convertModal?.isOpen === true}
        onClose={() => setConvertModal(null)}
        title="Convert to Invoice"
        centered
      >
        <Stack gap="md">
          <Alert color="blue" variant="light">
            This will create an invoice from this order.
          </Alert>
          <TextInput
            label="Invoice Date"
            type="date"
            value={convertInvoiceDate}
            onChange={(e) => setConvertInvoiceDate(e.target.value)}
            required
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConvertModal(null)}>
              Cancel
            </Button>
            <Button
              color="blue"
              leftSection={<IconFileInvoice size={16} />}
              onClick={() => {
                if (!convertInvoiceDate.trim()) {
                  setError("Invoice date is required");
                  return;
                }
                if (convertModal) {
                  convertToInvoice(convertModal.orderId, convertInvoiceDate);
                }
              }}
              loading={converting}
              disabled={!convertInvoiceDate.trim()}
            >
              Create Invoice
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        opened={confirmAction !== null}
        onClose={() => {
          setConfirmAction(null);
          setCancelReason("");
        }}
        title={
          confirmAction?.type === "confirm"
            ? "Confirm Order"
            : confirmAction?.type === "complete"
            ? "Complete Order"
            : "Cancel Order"
        }
        centered
      >
        <Stack gap="md">
          {confirmAction?.type === "cancel" ? (
            <>
              <Text>Please provide a reason for cancelling this order:</Text>
              <Textarea
                placeholder="Cancellation reason..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
              />
            </>
          ) : (
            <Text>
              {confirmAction?.type === "confirm"
                ? "Are you sure you want to confirm this order?"
                : "Are you sure you want to mark this order as complete?"}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => {
              setConfirmAction(null);
              setCancelReason("");
            }}>
              Cancel
            </Button>
            <Button 
              color={confirmAction?.type === "cancel" ? "red" : "blue"}
              onClick={executeConfirmedAction}
              loading={submitting}
              disabled={confirmAction?.type === "cancel" && !cancelReason.trim()}
            >
              Confirm
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}