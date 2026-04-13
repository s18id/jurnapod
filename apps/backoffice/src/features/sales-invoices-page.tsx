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
  SimpleGrid,
  ScrollArea,
  Modal,
  Card,
  ThemeIcon,
  SegmentedControl
} from "@mantine/core";
import {
  IconPlus,
  IconTrash,
  IconPrinter,
  IconFileTypePdf,
  IconCheck,
  IconX,
  IconEdit,
  IconDotsVertical,
  IconAlertCircle,
  IconFileInvoice,
  IconCalendar
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { apiRequest, ApiError, getApiBaseUrl } from "../lib/api-client";
import { CacheService } from "../lib/cache-service";
import { useOnlineStatus } from "../lib/connection";
import { OutboxService } from "../lib/outbox-service";
import type { SessionUser } from "../lib/session";

type InvoiceStatus = "DRAFT" | "APPROVED" | "POSTED" | "VOID";
type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";
type LineType = "SERVICE" | "PRODUCT";

type InventoryItem = {
  id: number;
  name: string;
  type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
  is_active: boolean;
};

type Invoice = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  paid_total: number;
  approved_by_user_id: number | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

type InvoiceLine = {
  id: number;
  invoice_id: number;
  line_no: number;
  line_type: LineType;
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

type InvoiceDetail = Invoice & { lines: InvoiceLine[]; due_term?: string };

type InvoicesResponse = { success: true; data: { total: number; invoices: Invoice[] } };
type InvoiceDetailResponse = { success: true; data: InvoiceDetail };

const DUE_TERM_OPTIONS = [
  { value: "NET_0", label: "Due on receipt" },
  { value: "NET_7", label: "Net 7 days" },
  { value: "NET_14", label: "Net 14 days" },
  { value: "NET_15", label: "Net 15 days" },
  { value: "NET_20", label: "Net 20 days" },
  { value: "NET_30", label: "Net 30 days" },
  { value: "NET_45", label: "Net 45 days" },
  { value: "NET_60", label: "Net 60 days" },
  { value: "NET_90", label: "Net 90 days" }
];

const LINE_TYPE_OPTIONS = [
  { value: "SERVICE", label: "Service" },
  { value: "PRODUCT", label: "Product" }
];

const PAYMENT_STATUS_OPTIONS = [
  { value: "", label: "All Payment Statuses" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIAL", label: "Partial" },
  { value: "PAID", label: "Paid" }
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

function addDaysToDateOnly(value: string, days: number): string {
  const dt = parseDateOnly(value);
  dt.setDate(dt.getDate() + days);
  return formatDateOnlyLocal(dt);
}

function effectiveDueDate(invoice: Invoice): string {
  return invoice.due_date ?? invoice.invoice_date;
}

function getStatusBadgeColor(status: InvoiceStatus): string {
  switch (status) {
    case "POSTED":
      return "green";
    case "DRAFT":
      return "yellow";
    case "APPROVED":
      return "blue";
    case "VOID":
      return "gray";
    default:
      return "gray";
  }
}

function getDaysOverdue(dueDate: string | null, invoiceDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseDateOnly(dueDate ?? invoiceDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function isOverdue(dueDate: string | null, invoiceDate: string, status: InvoiceStatus, paymentStatus: PaymentStatus): boolean {
  if (status !== "POSTED") return false;
  if (paymentStatus === "PAID") return false;
  return getDaysOverdue(dueDate, invoiceDate) > 0;
}

function getPaymentStatusBadgeColor(status: PaymentStatus): string {
  switch (status) {
    case "PAID":
      return "blue";
    case "PARTIAL":
      return "yellow";
    case "UNPAID":
      return "red";
    default:
      return "gray";
  }
}

function getTermDays(term: string): number {
  const daysMap: Record<string, number> = {
    NET_0: 0,
    NET_7: 7,
    NET_14: 14,
    NET_15: 15,
    NET_20: 20,
    NET_30: 30,
    NET_45: 45,
    NET_60: 60,
    NET_90: 90
  };
  return daysMap[term] ?? 30;
}

type SalesInvoicesPageProps = {
  user: SessionUser;
};

type InvoiceLineDraft = {
  line_type: LineType;
  item_id: number | null;
  description: string;
  qty: string;
  unit_price: string;
};

type InvoiceDraft = {
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  due_term: string;
  tax_amount: string;
  lines: InvoiceLineDraft[];
};

type InvoiceEditDraft = InvoiceDraft & {
  id: number;
};

const emptyLineDraft: InvoiceLineDraft = {
  line_type: "SERVICE",
  item_id: null,
  description: "",
  qty: "1",
  unit_price: "0"
};

export function SalesInvoicesPage(props: SalesInvoicesPageProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesTotal, setInvoicesTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ color: "yellow" | "blue"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedOutletId, setSelectedOutletId] = useState<number>(
    props.user.outlets[0]?.id ?? 0
  );
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("");
  const [dateFromFilter, setDateFromFilter] = useState<string>("");
  const [dateToFilter, setDateToFilter] = useState<string>("");
  
  // Items for product selection
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  
  // Confirmation dialogs
  const [confirmAction, setConfirmAction] = useState<{ type: "post" | "void"; invoiceId: number } | null>(null);

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

  function getDefaultDueDate(date: string): string {
    return addDaysToDateOnly(date, 30);
  }

  const [newInvoice, setNewInvoice] = useState<InvoiceDraft>(() => {
    const today = getTodayDateOnlyLocal();
    return {
      invoice_no: "",
      invoice_date: today,
      due_date: getDefaultDueDate(today),
      due_term: "NET_30",
      tax_amount: "0",
      lines: [{ ...emptyLineDraft }]
    };
  });
  const [editingInvoice, setEditingInvoice] = useState<InvoiceEditDraft | null>(null);

  async function refreshData(outletId: number) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const params = new URLSearchParams();
      params.set("outlet_id", String(outletId));
      params.set("limit", "100");
      if (statusFilter) params.set("status", statusFilter);
      if (paymentStatusFilter) params.set("payment_status", paymentStatusFilter);
      if (dateFromFilter) params.set("date_from", dateFromFilter);
      if (dateToFilter) params.set("date_to", dateToFilter);

      const response = await apiRequest<InvoicesResponse>(
        `/sales/invoices?${params.toString()}`,
        {}
      );
      setInvoices(response.data.invoices);
      setInvoicesTotal(response.data.total);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load invoices");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedOutletId > 0) {
      refreshData(selectedOutletId).catch(console.error);
    }
  }, [selectedOutletId, statusFilter, paymentStatusFilter, dateFromFilter, dateToFilter]);

  function handleOutletChange(value: string | null) {
    if (value) {
      setSelectedOutletId(Number(value));
    }
  }

  function resetNewInvoice() {
    const invoiceDate = getTodayDateOnlyLocal();
    setNewInvoice({
      invoice_no: "",
      invoice_date: invoiceDate,
      due_date: getDefaultDueDate(invoiceDate),
      due_term: "NET_30",
      tax_amount: "0",
      lines: [{ ...emptyLineDraft }]
    });
  }

  function buildLinePayload(line: InvoiceLineDraft) {
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

  function validateInvoiceDraft(invoice: InvoiceDraft): string | null {
    if (!invoice.invoice_date.trim()) {
      return "Invoice date is required";
    }

    const lines = invoice.lines;
    if (lines.length === 0) {
      return "Invoice must have at least one line item";
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

  async function createInvoice() {
    const validationError = validateInvoiceDraft(newInvoice);
    if (validationError) {
      setError(validationError);
      return;
    }

    const lines = newInvoice.lines.map(buildLinePayload);

    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        outlet_id: selectedOutletId,
        invoice_date: newInvoice.invoice_date,
        due_date: newInvoice.due_date || newInvoice.invoice_date,
        due_term: newInvoice.due_term,
        tax_amount: Number(newInvoice.tax_amount || "0"),
        lines
      };

      // Only send invoice_no if provided (otherwise server auto-generates)
      const trimmedInvoiceNo = newInvoice.invoice_no.trim();
      if (trimmedInvoiceNo) {
        payload.invoice_no = trimmedInvoiceNo;
      }

      if (isOnline) {
        await apiRequest(
          "/sales/invoices",
          {
            method: "POST",
            body: JSON.stringify(payload)
          }
        );
        resetNewInvoice();
        await refreshData(selectedOutletId);
      } else {
        await OutboxService.queueTransaction("invoice", payload, props.user.id);
        resetNewInvoice();
        setNotice({ color: "yellow", message: "Invoice queued for sync while offline." });
      }
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create invoice");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function loadInvoiceForEdit(invoiceId: number) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<InvoiceDetailResponse>(
        `/sales/invoices/${invoiceId}`,
        {}
      );
      setEditingInvoice({
        id: response.data.id,
        invoice_no: response.data.invoice_no,
        invoice_date: response.data.invoice_date,
        due_date: response.data.due_date ?? response.data.invoice_date,
        due_term: response.data.due_term ?? "NET_30",
        tax_amount: String(response.data.tax_amount ?? 0),
        lines: response.data.lines.map((line) => ({
          line_type: line.line_type ?? "SERVICE",
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
        setError("Failed to load invoice detail");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function saveInvoiceEdit() {
    if (!editingInvoice) {
      return;
    }

    const validationError = validateInvoiceDraft(editingInvoice);
    if (validationError) {
      setError(validationError);
      return;
    }

    const lines = editingInvoice.lines.map(buildLinePayload);

    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        invoice_date: editingInvoice.invoice_date,
        due_date: editingInvoice.due_date || editingInvoice.invoice_date,
        due_term: editingInvoice.due_term,
        tax_amount: Number(editingInvoice.tax_amount || "0"),
        lines
      };

      // Only send invoice_no if provided (otherwise preserve existing)
      const trimmedInvoiceNo = editingInvoice.invoice_no.trim();
      if (trimmedInvoiceNo) {
        payload.invoice_no = trimmedInvoiceNo;
      }

      await apiRequest(
        `/sales/invoices/${editingInvoice.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );
      setEditingInvoice(null);
      await refreshData(selectedOutletId);
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      } else {
        setError("Failed to update invoice");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function postInvoiceById(invoiceId: number) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/sales/invoices/${invoiceId}/post`, { method: "POST" });
      await refreshData(selectedOutletId);
    } catch (postError) {
      if (postError instanceof ApiError) {
        setError(postError.message);
      } else {
        setError("Failed to post invoice");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function approveInvoiceById(invoiceId: number) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/sales/invoices/${invoiceId}/approve`, { method: "POST" });
      await refreshData(selectedOutletId);
    } catch (approveError) {
      if (approveError instanceof ApiError) {
        setError(approveError.message);
      } else {
        setError("Failed to approve invoice");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function voidInvoiceById(invoiceId: number) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/sales/invoices/${invoiceId}/void`, { method: "POST" });
      await refreshData(selectedOutletId);
    } catch (voidError) {
      if (voidError instanceof ApiError) {
        setError(voidError.message);
      } else {
        setError("Failed to void invoice");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handlePostClick(invoiceId: number) {
    setConfirmAction({ type: "post", invoiceId });
  }

  function handleVoidClick(invoiceId: number) {
    setConfirmAction({ type: "void", invoiceId });
  }

  async function executeConfirmedAction() {
    if (!confirmAction) return;
    
    if (confirmAction.type === "post") {
      await postInvoiceById(confirmAction.invoiceId);
    } else {
      await voidInvoiceById(confirmAction.invoiceId);
    }
    setConfirmAction(null);
  }

  async function handleViewPrint(invoiceId: number) {
    setError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/sales/invoices/${invoiceId}/print`);

      if (!response.ok) {
        throw new Error("Failed to load invoice print view");
      }

      const html = await response.text();
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        throw new Error("Popup blocked");
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (viewError) {
      setError(viewError instanceof Error ? viewError.message : "Failed to open print view");
    }
  }

  async function handleViewPdf(invoiceId: number) {
    setError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/sales/invoices/${invoiceId}/pdf`);

      if (!response.ok) {
        throw new Error("Failed to load invoice PDF");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (viewError) {
      setError(viewError instanceof Error ? viewError.message : "Failed to open invoice PDF");
    }
  }

  const outletOptions = props.user.outlets.map((outlet) => ({
    value: String(outlet.id),
    label: outlet.name
  }));

  // Calculate KPIs
  const totalOutstanding = useMemo(() => {
    return invoices
      .filter((inv) => inv.status === "POSTED" && inv.payment_status !== "PAID")
      .reduce((sum, inv) => sum + Math.max(inv.grand_total - inv.paid_total, 0), 0);
  }, [invoices]);

  const overdueCount = useMemo(() => {
    return invoices.filter((inv) => 
      isOverdue(inv.due_date, inv.invoice_date, inv.status, inv.payment_status)
    ).length;
  }, [invoices]);

  const renderInvoiceForm = (
    invoice: InvoiceDraft,
    setInvoice: React.Dispatch<React.SetStateAction<InvoiceDraft>>,
    onSubmit: () => void,
    onCancel?: () => void,
    isEdit = false
  ) => (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={4}>{isEdit ? `Edit Draft Invoice #${(invoice as InvoiceEditDraft).id}` : "Create New Invoice"}</Title>
          {isEdit && (
            <Button variant="subtle" color="gray" onClick={onCancel} size="sm">
              Cancel
            </Button>
          )}
        </Group>

        <Divider />

        <Grid>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <TextInput
              label="Invoice Number"
              placeholder="Leave blank for auto-number"
              description="Optional - auto-generated if empty"
              value={invoice.invoice_no}
              onChange={(e) =>
                setInvoice((prev) => ({ ...prev, invoice_no: e.target.value }))
              }
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <TextInput
              label="Invoice Date"
              type="date"
              value={invoice.invoice_date}
              onChange={(e) => {
                const newDate = e.target.value;
                const dueDate = addDaysToDateOnly(newDate, getTermDays(invoice.due_term));
                setInvoice((prev) => ({
                  ...prev,
                  invoice_date: newDate,
                  due_date: dueDate
                }));
              }}
              required
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Select
              label="Payment Terms"
              data={DUE_TERM_OPTIONS}
              value={invoice.due_term}
              onChange={(value) => {
                if (value) {
                  const dueDate = addDaysToDateOnly(invoice.invoice_date, getTermDays(value));
                  setInvoice((prev) => ({
                    ...prev,
                    due_term: value,
                    due_date: dueDate
                  }));
                }
              }}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <TextInput
              label="Due Date"
              type="date"
              value={invoice.due_date}
              onChange={(e) =>
                setInvoice((prev) => ({ ...prev, due_date: e.target.value }))
              }
            />
          </Grid.Col>
        </Grid>

        <NumberInput
          label="Tax Amount"
          placeholder="0"
          value={Number(invoice.tax_amount) || 0}
          onChange={(value) =>
            setInvoice((prev) => ({ ...prev, tax_amount: String(value ?? 0) }))
          }
          min={0}
          prefix="Rp "
          thousandSeparator="."
          decimalSeparator=","
          hideControls
        />

        <Divider label="Line Items" labelPosition="left" />

        <Stack gap="xs">
          {invoice.lines.map((line, index) => (
            <Grid key={`line-${index}`} align="flex-start" gutter="xs">
              <Grid.Col span={{ base: 12, sm: 2 }}>
                <Select
                  label={index === 0 ? "Type" : undefined}
                  data={LINE_TYPE_OPTIONS}
                  value={line.line_type}
                  onChange={(value) => {
                    const newType = (value as LineType) ?? "SERVICE";
                    setInvoice((prev) => ({
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
                      setInvoice((prev) => ({
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
                      setInvoice((prev) => ({
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
                      setInvoice((prev) => ({
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
                    setInvoice((prev) => ({
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
                    setInvoice((prev) => ({
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
                {invoice.lines.length > 1 && (
                  <ActionIcon
                    color="red"
                    variant="light"
                    onClick={() =>
                      setInvoice((prev) => ({
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
            setInvoice((prev) => ({
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
            {isEdit ? "Save Changes" : "Create Invoice"}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );

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
                <Title order={2}>Sales Invoices</Title>
                <Text size="sm" c="dimmed">
                  Manage sales invoices with approval workflow and payment tracking
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
              {invoicesTotal > invoices.length
                ? `Loaded ${invoices.length} of ${invoicesTotal}`
                : `${invoicesTotal} invoice${invoicesTotal !== 1 ? "s" : ""}`}
            </Badge>
            {!isOnline && <Badge color="yellow" variant="light">Offline</Badge>}
          </Group>
        </Group>
      </Card>

      {!isOnline && (
        <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
          You are offline. Invoices will be queued for sync when connection is restored.
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
              Total Invoices
            </Text>
            <Text size="xl" fw={700}>{invoicesTotal}</Text>
            <Text size="xs" c="dimmed">Loaded {invoices.length}</Text>
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Stack gap={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
              Loaded Outstanding
            </Text>
            <Text size="xl" fw={700} c={totalOutstanding > 0 ? "red" : "green"}>
              {formatCurrency(totalOutstanding)}
            </Text>
            <Text size="xs" c="dimmed">Based on loaded rows</Text>
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Stack gap={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
              Loaded Overdue Invoices
            </Text>
            <Text size="xl" fw={700} c={overdueCount > 0 ? "red" : "green"}>
              {overdueCount}
            </Text>
            <Text size="xs" c="dimmed">
              Based on loaded rows
            </Text>
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Stack gap={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
              Posted Amount (Loaded)
            </Text>
            <Text size="xl" fw={700} c="blue">
              {formatCurrency(
                invoices.filter((i) => i.status === "POSTED").reduce((sum, i) => sum + i.grand_total, 0)
              )}
            </Text>
          </Stack>
        </Card>
      </SimpleGrid>

      {/* Invoice Form */}
      {!editingInvoice && renderInvoiceForm(newInvoice, setNewInvoice, createInvoice)}

      {editingInvoice && renderInvoiceForm(
        editingInvoice,
        setEditingInvoice as React.Dispatch<React.SetStateAction<InvoiceDraft>>,
        saveInvoiceEdit,
        () => setEditingInvoice(null),
        true
      )}

      {/* Invoice List */}
      <Card withBorder shadow="sm" padding="md">
        <Stack gap="md">
          {/* Filters */}
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
            <Title order={4}>Invoice History</Title>
            <Group gap="sm" align="flex-start" wrap="wrap">
              <Select
                label="Payment"
                data={PAYMENT_STATUS_OPTIONS}
                value={paymentStatusFilter}
                onChange={(value) => setPaymentStatusFilter(value ?? "")}
                style={{ minWidth: 160 }}
              />
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
                  setPaymentStatusFilter("");
                  setDateFromFilter("");
                  setDateToFilter("");
                }}
                disabled={!statusFilter && !paymentStatusFilter && !dateFromFilter && !dateToFilter}
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
              { label: "Approved", value: "APPROVED" },
              { label: "Posted", value: "POSTED" },
              { label: "Void", value: "VOID" }
            ]}
          />

          <Divider />

          {loading ? (
            <Flex justify="center" p="xl">
              <Loader />
            </Flex>
          ) : invoices.length === 0 ? (
            <Alert color="blue" variant="light">
              No invoices found for this outlet.
            </Alert>
          ) : (
            <ScrollArea>
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Invoice No</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th ta="center">Status</Table.Th>
                    <Table.Th ta="center">Payment</Table.Th>
                    <Table.Th>Due Date</Table.Th>
                    <Table.Th ta="center">Overdue</Table.Th>
                    <Table.Th ta="right">Grand Total</Table.Th>
                    <Table.Th ta="right">Paid</Table.Th>
                    <Table.Th ta="right">Outstanding</Table.Th>
                    <Table.Th ta="center">Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {invoices.map((invoice) => (
                    <Table.Tr key={invoice.id}>
                      <Table.Td>{invoice.invoice_no}</Table.Td>
                      <Table.Td>{formatDateOnly(invoice.invoice_date)}</Table.Td>
                      <Table.Td ta="center">
                        <Badge color={getStatusBadgeColor(invoice.status)} size="sm">
                          {invoice.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td ta="center">
                        <Badge color={getPaymentStatusBadgeColor(invoice.payment_status)} size="sm">
                          {invoice.payment_status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {invoice.due_date ? (
                          formatDateOnly(invoice.due_date)
                        ) : (
                          <span>
                            {formatDateOnly(invoice.invoice_date)}{" "}
                            <Text span size="xs" c="dimmed">
                              (invoice date)
                            </Text>
                          </span>
                        )}
                      </Table.Td>
                      <Table.Td ta="center">
                        {invoice.status === "POSTED" ? (
                          isOverdue(effectiveDueDate(invoice), invoice.invoice_date, invoice.status, invoice.payment_status) ? (
                            <Badge color="red" size="sm">
                              {getDaysOverdue(effectiveDueDate(invoice), invoice.invoice_date)}d
                            </Badge>
                          ) : (
                            <Badge color="green" size="sm">
                              Current
                            </Badge>
                          )
                        ) : (
                          "—"
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text fw={500}>{formatCurrency(invoice.grand_total)}</Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        {formatCurrency(invoice.paid_total)}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text c={invoice.grand_total - invoice.paid_total > 0 ? "red" : "green"}>
                          {formatCurrency(invoice.grand_total - invoice.paid_total)}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="center">
                        <Menu position="bottom-end" withArrow>
                          <Menu.Target>
                            <ActionIcon variant="subtle" disabled={submitting}>
                              <IconDotsVertical size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            {invoice.status === "DRAFT" && (
                              <Menu.Item
                                leftSection={<IconEdit size={14} />}
                                onClick={() => loadInvoiceForEdit(invoice.id)}
                              >
                                Edit
                              </Menu.Item>
                            )}
                            {(invoice.status === "DRAFT" || invoice.status === "APPROVED") && (
                              <Menu.Item
                                leftSection={<IconCheck size={14} />}
                                onClick={() => handlePostClick(invoice.id)}
                              >
                                Post
                              </Menu.Item>
                            )}
                            {invoice.status === "DRAFT" && (
                              <Menu.Item
                                leftSection={<IconCheck size={14} />}
                                onClick={() => approveInvoiceById(invoice.id)}
                              >
                                Approve
                              </Menu.Item>
                            )}
                            {invoice.status !== "VOID" && (
                              <Menu.Item
                                leftSection={<IconX size={14} />}
                                color="red"
                                onClick={() => handleVoidClick(invoice.id)}
                              >
                                Void
                              </Menu.Item>
                            )}
                            <Menu.Divider />
                            <Menu.Item
                              leftSection={<IconPrinter size={14} />}
                              onClick={() => handleViewPrint(invoice.id)}
                            >
                              Print
                            </Menu.Item>
                            <Menu.Item
                              leftSection={<IconFileTypePdf size={14} />}
                              onClick={() => handleViewPdf(invoice.id)}
                            >
                              Download PDF
                            </Menu.Item>
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

      {/* Confirmation Modal */}
      <Modal
        opened={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.type === "post" ? "Confirm Post Invoice" : "Confirm Void Invoice"}
        centered
      >
        <Stack gap="md">
          <Text>
            {confirmAction?.type === "post" 
              ? "Are you sure you want to post this invoice? This action will create journal entries."
              : "Are you sure you want to void this invoice? This action cannot be undone."
            }
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button 
              color={confirmAction?.type === "void" ? "red" : "blue"}
              onClick={executeConfirmedAction}
              loading={submitting}
            >
              Confirm
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
