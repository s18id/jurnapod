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
  Box,
  Flex,
  Divider,
  Loader,
  Card,
  Tooltip,
  Collapse,
  List,
  SimpleGrid,
  ScrollArea,
  ThemeIcon,
  SegmentedControl
} from "@mantine/core";
import {
  IconPlus,
  IconTrash,
  IconCheck,
  IconEdit,
  IconDotsVertical,
  IconAlertCircle,
  IconCash,
  IconArrowRight,
  IconReceipt,
  IconCoins
} from "@tabler/icons-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { useAccounts } from "../hooks/use-accounts";
import { useOutletAccountMappings } from "../hooks/use-outlet-account-mappings";
import { useOutletPaymentMethodMappings } from "../hooks/use-outlet-payment-method-mappings";
import { useSalesInvoices } from "../hooks/use-sales-invoices";
import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import { OutboxService } from "../lib/outbox-service";
import type { SessionUser } from "../lib/session";

type PaymentStatus = "DRAFT" | "POSTED" | "VOID";
type PaymentFilterStatus = "ALL" | "DRAFT" | "POSTED" | "VOID";

type PaymentSplit = {
  id: number;
  payment_id: number;
  company_id: number;
  outlet_id: number;
  split_index: number;
  account_id: number;
  account_name?: string;
  amount: number;
};

type Payment = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  payment_no: string;
  client_ref?: string | null;
  payment_at: string;
  account_id: number;
  account_name?: string;
  method?: string;
  status: PaymentStatus;
  amount: number;
  actual_amount_idr?: number | null;
  invoice_amount_idr?: number | null;
  payment_amount_idr?: number | null;
  payment_delta_idr?: number;
  splits?: PaymentSplit[];
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

type PaymentsResponse = { success: true; data: { total: number; payments: Payment[] } };

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatDateTime(dateTimeString: string): string {
  return new Date(dateTimeString).toLocaleString("id-ID");
}

function getStatusBadgeColor(status: PaymentStatus): string {
  switch (status) {
    case "POSTED":
      return "green";
    case "DRAFT":
      return "yellow";
    case "VOID":
      return "gray";
    default:
      return "gray";
  }
}

const MONEY_SCALE = 100;

function toMinorUnits(value: number | string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Math.round(numeric * MONEY_SCALE);
}

function hasMoreThanTwoDecimals(value: number | string): boolean {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return true;
  const fixed = numeric.toFixed(10);
  const decimalPart = fixed.split(".")[1] ?? "";
  return decimalPart.slice(2).split("").some((d) => d !== "0");
}

type SalesPaymentsPageProps = {
  user: SessionUser;
};

type PaymentSplitDraft = {
  account_id: string;
  amount: string;
};

type PaymentDraft = {
  payment_no: string;
  invoice_id: string;
  client_ref: string;
  payment_at: string;
  amount: string;
  splits: PaymentSplitDraft[];
};

type PaymentEditDraft = PaymentDraft & {
  id: number;
};

function toLocalDateTimeInput(value: Date): string {
  const offsetMs = value.getTimezoneOffset() * 60 * 1000;
  const local = new Date(value.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

function generateClientRef(): string {
  return crypto.randomUUID();
}

type PaymentStats = {
  totalCount: number;
  draftAmount: number;
  postedAmount: number;
};

function buildPaymentsQueryKey(
  outletId: number,
  statusFilter: PaymentFilterStatus,
  dateFromFilter: string,
  dateToFilter: string
): string {
  return `outlet=${outletId}|status=${statusFilter}|from=${dateFromFilter}|to=${dateToFilter}`;
}

function calculatePaymentStats(payments: Payment[]): PaymentStats {
  return payments.reduce(
    (acc, payment) => ({
      totalCount: acc.totalCount + 1,
      draftAmount: acc.draftAmount + (payment.status === "DRAFT" ? payment.amount : 0),
      postedAmount: acc.postedAmount + (payment.status === "POSTED" ? payment.amount : 0)
    }),
    { totalCount: 0, draftAmount: 0, postedAmount: 0 }
  );
}

export function SalesPaymentsPage(props: SalesPaymentsPageProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState<number>(0);
  const [lastSuccessQueryKey, setLastSuccessQueryKey] = useState<string | null>(null);
  const [isShowingStaleData, setIsShowingStaleData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedOutletId, setSelectedOutletId] = useState<number>(
    props.user.outlets[0]?.id ?? 0
  );
  const [expandedPaymentId, setExpandedPaymentId] = useState<number | null>(null);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<PaymentFilterStatus>("ALL");
  const [dateFromFilter, setDateFromFilter] = useState<string>("");
  const [dateToFilter, setDateToFilter] = useState<string>("");
  const requestSeqRef = useRef(0);

  const activeQueryKey = useMemo(
    () => buildPaymentsQueryKey(selectedOutletId, statusFilter, dateFromFilter, dateToFilter),
    [selectedOutletId, statusFilter, dateFromFilter, dateToFilter]
  );

  const [newPayment, setNewPayment] = useState<PaymentDraft>(() => ({
    payment_no: "",
    invoice_id: "",
    client_ref: generateClientRef(),
    payment_at: toLocalDateTimeInput(new Date()),
    amount: "0",
    splits: []
  }));
  const [editingPayment, setEditingPayment] = useState<PaymentEditDraft | null>(null);
  const isOnline = useOnlineStatus();

  // Fetch payable accounts for payment destination dropdown
  const accountFilter = useMemo(() => ({ is_payable: true }), []);
  const { data: payableAccounts, loading: accountsLoading } = useAccounts(
    props.user.company_id,
    accountFilter
  );

  // Fetch payment method mappings (legacy fallback for is_invoice_default)
  const { mappings: paymentMappings, loading: mappingsLoading } = useOutletPaymentMethodMappings(
    selectedOutletId
  );

  // Fetch account mappings to get INVOICE_PAYMENT_BANK
  const { data: accountMappings, loading: accountMappingsLoading } = useOutletAccountMappings(
    selectedOutletId > 0 ? selectedOutletId : null,
    selectedOutletId > 0 ? "outlet" : "company"
  );

  // Fetch invoices for the dropdown (only POSTED, unpaid/partial)
  const invoiceFilters = useMemo(
    () => ({
      outlet_id: selectedOutletId,
      status: "POSTED" as const,
      limit: 100
    }),
    [selectedOutletId]
  );
  const { data: allInvoices, loading: invoicesLoading } = useSalesInvoices(
    invoiceFilters
  );
  // Filter out fully paid invoices
  const invoices = useMemo(
    () => allInvoices.filter((inv) => inv.payment_status !== "PAID"),
    [allInvoices]
  );

  const accountOptions = useMemo(
    () =>
      payableAccounts.map((account) => ({
        value: String(account.id),
        label: `${account.code} - ${account.name}`
      })),
    [payableAccounts]
  );

  const outletOptions = useMemo(
    () =>
      props.user.outlets.map((outlet) => ({
        value: String(outlet.id),
        label: outlet.name
      })),
    [props.user.outlets]
  );

  const invoiceOptions = useMemo(
    () =>
      invoices.map((invoice) => {
        const outstanding = invoice.grand_total - invoice.paid_total;
        return {
          value: String(invoice.id),
          label: `${invoice.invoice_no} - Outstanding: ${formatCurrency(outstanding)}`
        };
      }),
    [invoices]
  );

  async function refreshData(outletId: number, queryKey: string) {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setLoading(true);
    setError(null);
    setIsShowingStaleData(false);
    try {
      const params = new URLSearchParams();
      params.set("outlet_id", String(outletId));
      params.set("limit", "100");
      if (statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }
      if (dateFromFilter) {
        params.set("date_from", dateFromFilter);
      }
      if (dateToFilter) {
        params.set("date_to", dateToFilter);
      }

      const response = await apiRequest<PaymentsResponse>(
        `/sales/payments?${params.toString()}`,
        {}
      );
      if (requestSeq !== requestSeqRef.current) {
        return;
      }
      setPayments(response.data.payments);
      setPaymentsTotal(response.data.total);
      setLastSuccessQueryKey(queryKey);
      setIsShowingStaleData(false);
    } catch (fetchError) {
      if (requestSeq !== requestSeqRef.current) {
        return;
      }
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load payments");
      }
      setIsShowingStaleData(
        lastSuccessQueryKey !== null &&
          lastSuccessQueryKey !== queryKey &&
          (payments.length > 0 || paymentsTotal > 0)
      );
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (selectedOutletId > 0) {
      refreshData(selectedOutletId, activeQueryKey).catch(console.error);
    }
  }, [selectedOutletId, statusFilter, dateFromFilter, dateToFilter, activeQueryKey]);

  // Set default account_id from INVOICE_PAYMENT_BANK mapping (with legacy fallback)
  useEffect(() => {
    if (newPayment.splits.length > 0) return;
    
    const dataLoading = mappingsLoading || accountMappingsLoading;
    if (dataLoading) return;

    // First priority: INVOICE_PAYMENT_BANK from account mappings
    const invoiceBankMapping = accountMappings?.find((m) => m.mapping_key === "INVOICE_PAYMENT_BANK" && m.account_id);
    
    if (invoiceBankMapping && typeof invoiceBankMapping.account_id === "number") {
      setNewPayment((prev) => ({
        ...prev,
        splits: [
          {
            account_id: String(invoiceBankMapping.account_id),
            amount: prev.amount
          }
        ]
      }));
      return;
    }

    // Legacy fallback: is_invoice_default from payment method mappings
    const legacyInvoiceDefault = paymentMappings.find((m) => m.is_invoice_default === true);
    if (legacyInvoiceDefault) {
      setNewPayment((prev) => ({
        ...prev,
        splits: [
          {
            account_id: String(legacyInvoiceDefault.account_id),
            amount: prev.amount
          }
        ]
      }));
    }
  }, [mappingsLoading, accountMappingsLoading, paymentMappings, accountMappings, newPayment.splits.length]);

  // Backfill split account when invoice was selected before mappings finished loading.
  // This closes the race where buildPaymentFromInvoiceSelection creates a placeholder
  // split with empty account_id while mappings are still loading.
  useEffect(() => {
    if (mappingsLoading || paymentMappings.length === 0) {
      return;
    }

    const invoiceDefault = paymentMappings.find((m) => m.is_invoice_default === true);
    if (!invoiceDefault) {
      return;
    }

    setNewPayment((prev) => {
      if (!prev.invoice_id.trim()) {
        return prev;
      }

      if (prev.splits.length !== 1) {
        return prev;
      }

      const [firstSplit] = prev.splits;
      if (firstSplit.account_id.trim()) {
        return prev;
      }

      return {
        ...prev,
        splits: [
          {
            ...firstSplit,
            account_id: String(invoiceDefault.account_id)
          }
        ]
      };
    });
  }, [mappingsLoading, paymentMappings]);

  // Mirror late-mapping backfill for edit form invoice reselection.
  useEffect(() => {
    if (mappingsLoading || paymentMappings.length === 0) {
      return;
    }

    const invoiceDefault = paymentMappings.find((m) => m.is_invoice_default === true);
    if (!invoiceDefault) {
      return;
    }

    setEditingPayment((prev) => {
      if (!prev) {
        return prev;
      }

      if (!prev.invoice_id.trim()) {
        return prev;
      }

      if (prev.splits.length !== 1) {
        return prev;
      }

      const [firstSplit] = prev.splits;
      if (firstSplit.account_id.trim()) {
        return prev;
      }

      return {
        ...prev,
        splits: [
          {
            ...firstSplit,
            account_id: String(invoiceDefault.account_id)
          }
        ]
      };
    });
  }, [mappingsLoading, paymentMappings]);

  function handleOutletChange(value: string | null) {
    if (!value) return;
    const nextOutletId = Number(value);
    if (!nextOutletId || nextOutletId === selectedOutletId) return;

    setSelectedOutletId(nextOutletId);
    setExpandedPaymentId(null);
    setError(null);
    resetNewPayment();
    setEditingPayment(null);
  }

  function resetNewPayment() {
    setNewPayment({
      payment_no: "",
      invoice_id: "",
      client_ref: generateClientRef(),
      payment_at: toLocalDateTimeInput(new Date()),
      amount: "0",
      splits: []
    });
  }

  function toIsoString(localValue: string): string {
    const date = new Date(localValue);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toISOString();
  }

  function calculateSplitTotal(splits: PaymentSplitDraft[]): number {
    return splits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
  }

  function addSplit() {
    setNewPayment((prev) => ({
      ...prev,
      splits: [...prev.splits, { account_id: "", amount: "0" }]
    }));
  }

  function removeSplit(index: number) {
    setNewPayment((prev) => ({
      ...prev,
      splits: prev.splits.filter((_, i) => i !== index)
    }));
  }

  function updateSplit(index: number, field: keyof PaymentSplitDraft, value: string) {
    setNewPayment((prev) => ({
      ...prev,
      splits: prev.splits.map((split, i) => (i === index ? { ...split, [field]: value } : split))
    }));
  }

  function addEditingSplit() {
    if (!editingPayment) return;
    setEditingPayment((prev) =>
      prev
        ? {
            ...prev,
            splits: [...prev.splits, { account_id: "", amount: "0" }]
          }
        : prev
    );
  }

  function removeEditingSplit(index: number) {
    if (!editingPayment) return;
    setEditingPayment((prev) =>
      prev
        ? {
            ...prev,
            splits: prev.splits.filter((_, i) => i !== index)
          }
        : prev
    );
  }

  function updateEditingSplit(index: number, field: keyof PaymentSplitDraft, value: string) {
    if (!editingPayment) return;
    setEditingPayment((prev) =>
      prev
        ? {
            ...prev,
            splits: prev.splits.map((split, i) => (i === index ? { ...split, [field]: value } : split))
          }
        : prev
    );
  }

  async function createPayment() {
    if (!newPayment.invoice_id.trim()) {
      setError("Invoice ID is required");
      return;
    }

    if (newPayment.splits.length === 0) {
      setError("At least one payment split is required");
      return;
    }

    // Validate splits
    for (let i = 0; i < newPayment.splits.length; i++) {
      const split = newPayment.splits[i];
      if (!split.account_id.trim()) {
        setError(`Split #${i + 1}: Account is required`);
        return;
      }
      if (!split.amount.trim() || Number(split.amount) <= 0) {
        setError(`Split #${i + 1}: Valid amount is required`);
        return;
      }
      if (hasMoreThanTwoDecimals(split.amount)) {
        setError(`Split #${i + 1}: Amount must have at most 2 decimal places`);
        return;
      }
    }

    // Validate total amount precision
    if (hasMoreThanTwoDecimals(newPayment.amount)) {
      setError("Payment amount must have at most 2 decimal places");
      return;
    }

    const splitTotal = calculateSplitTotal(newPayment.splits);
    const totalAmount = Number(newPayment.amount);

    // Cent-exact validation using minor units to avoid floating point errors
    if (toMinorUnits(splitTotal) !== toMinorUnits(totalAmount)) {
      setError(
        `Split total (${formatCurrency(splitTotal)}) must equal payment amount (${formatCurrency(totalAmount)})`
      );
      return;
    }

    // Check for duplicate accounts
    const accountIds = newPayment.splits.map((s) => s.account_id);
    if (new Set(accountIds).size !== accountIds.length) {
      setError("Duplicate accounts are not allowed in splits");
      return;
    }

    const paymentAtIso = toIsoString(newPayment.payment_at);
    if (!paymentAtIso) {
      setError("Payment date is invalid");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        outlet_id: selectedOutletId,
        invoice_id: Number(newPayment.invoice_id),
        client_ref: newPayment.client_ref.trim() || undefined,
        payment_at: paymentAtIso,
        amount: totalAmount,
        splits: newPayment.splits.map((split) => ({
          account_id: Number(split.account_id),
          amount: Number(split.amount)
        }))
      };

      if (newPayment.payment_no.trim()) {
        payload.payment_no = newPayment.payment_no.trim();
      }

      if (isOnline) {
        await apiRequest(
          "/sales/payments",
          {
            method: "POST",
            body: JSON.stringify(payload)
          }
        );
        resetNewPayment();
        await refreshData(selectedOutletId, activeQueryKey);
      } else {
        await OutboxService.queueTransaction("payment", payload, props.user.id);
        resetNewPayment();
        setError("Payment queued for sync (offline)");
      }
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create payment");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function loadPaymentForEdit(payment: Payment) {
    setEditingPayment({
      id: payment.id,
      payment_no: payment.payment_no,
      invoice_id: String(payment.invoice_id),
      client_ref: payment.client_ref ?? "",
      payment_at: toLocalDateTimeInput(new Date(payment.payment_at)),
      amount: String(payment.amount),
      splits:
        payment.splits && payment.splits.length > 0
          ? payment.splits.map((split) => ({
              account_id: String(split.account_id),
              amount: String(split.amount)
            }))
          : [{ account_id: String(payment.account_id), amount: String(payment.amount) }]
    });
  }

  async function savePaymentEdit() {
    if (!editingPayment) {
      return;
    }

    if (!editingPayment.invoice_id.trim()) {
      setError("Invoice ID is required");
      return;
    }

    if (editingPayment.splits.length === 0) {
      setError("At least one payment split is required");
      return;
    }

    // Validate splits
    for (let i = 0; i < editingPayment.splits.length; i++) {
      const split = editingPayment.splits[i];
      if (!split.account_id.trim()) {
        setError(`Split #${i + 1}: Account is required`);
        return;
      }
      if (!split.amount.trim() || Number(split.amount) <= 0) {
        setError(`Split #${i + 1}: Valid amount is required`);
        return;
      }
      if (hasMoreThanTwoDecimals(split.amount)) {
        setError(`Split #${i + 1}: Amount must have at most 2 decimal places`);
        return;
      }
    }

    // Validate total amount precision
    if (hasMoreThanTwoDecimals(editingPayment.amount)) {
      setError("Payment amount must have at most 2 decimal places");
      return;
    }

    const splitTotal = calculateSplitTotal(editingPayment.splits);
    const totalAmount = Number(editingPayment.amount);

    // Cent-exact validation using minor units to avoid floating point errors
    if (toMinorUnits(splitTotal) !== toMinorUnits(totalAmount)) {
      setError(
        `Split total (${formatCurrency(splitTotal)}) must equal payment amount (${formatCurrency(totalAmount)})`
      );
      return;
    }

    // Check for duplicate accounts
    const accountIds = editingPayment.splits.map((s) => s.account_id);
    if (new Set(accountIds).size !== accountIds.length) {
      setError("Duplicate accounts are not allowed in splits");
      return;
    }

    const paymentAtIso = toIsoString(editingPayment.payment_at);
    if (!paymentAtIso) {
      setError("Payment date is invalid");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const patchPayload: Record<string, unknown> = {
        invoice_id: Number(editingPayment.invoice_id),
        payment_at: paymentAtIso,
        amount: totalAmount,
        splits: editingPayment.splits.map((split) => ({
          account_id: Number(split.account_id),
          amount: Number(split.amount)
        }))
      };

      if (editingPayment.payment_no.trim()) {
        patchPayload.payment_no = editingPayment.payment_no.trim();
      }

      await apiRequest(
        `/sales/payments/${editingPayment.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(patchPayload)
        }
      );
      setEditingPayment(null);
      await refreshData(selectedOutletId, activeQueryKey);
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      } else {
        setError("Failed to update payment");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function postPaymentById(paymentId: number) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/sales/payments/${paymentId}/post`, { method: "POST" });
      await refreshData(selectedOutletId, activeQueryKey);
    } catch (postError) {
      if (postError instanceof ApiError) {
        setError(postError.message);
      } else {
        setError("Failed to post payment");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function buildPaymentFromInvoiceSelection<T extends PaymentDraft>(
    value: string | null,
    prev: T,
    availableInvoices: typeof invoices,
    mappings: typeof paymentMappings,
    accMappings?: typeof accountMappings
  ): T {
    if (!value) {
      return { ...prev, invoice_id: "", amount: "0", splits: [] };
    }

    const selectedInvoice = availableInvoices.find((inv) => inv.id === Number(value));
    const outstanding = selectedInvoice ? selectedInvoice.grand_total - selectedInvoice.paid_total : 0;

    // First priority: INVOICE_PAYMENT_BANK from account mappings
    const invoiceBankMapping = accMappings?.find((m) => m.mapping_key === "INVOICE_PAYMENT_BANK" && m.account_id);
    const invoiceBankAccountId = typeof invoiceBankMapping?.account_id === "number" ? invoiceBankMapping.account_id : null;

    // Legacy fallback: is_invoice_default from payment method mappings
    const legacyInvoiceDefault = mappings.find((m) => m.is_invoice_default === true);
    const legacyAccountId = legacyInvoiceDefault ? legacyInvoiceDefault.account_id : null;

    const defaultAccountId = invoiceBankAccountId ?? legacyAccountId;

    const defaultSplits: PaymentSplitDraft[] = defaultAccountId
      ? [{ account_id: String(defaultAccountId), amount: String(outstanding) }]
      : outstanding > 0
        ? [{ account_id: "", amount: String(outstanding) }]
        : [];

    return {
      ...prev,
      invoice_id: value,
      amount: String(outstanding),
      splits: defaultSplits
    };
  }

  type CreatePaymentFormHandlers = {
    onChangeField: (updater: (prev: PaymentDraft) => PaymentDraft) => void;
    onSplitAdd: () => void;
    onSplitRemove: (index: number) => void;
    onSplitChange: (index: number, field: keyof PaymentSplitDraft, value: string) => void;
  };

  type EditPaymentFormHandlers = {
    onChangeField: (updater: (prev: PaymentEditDraft) => PaymentEditDraft) => void;
    onSplitAdd: () => void;
    onSplitRemove: (index: number) => void;
    onSplitChange: (index: number, field: keyof PaymentSplitDraft, value: string) => void;
  };

  type GenericPaymentFormHandlers<T extends PaymentDraft> = {
    onChangeField: (updater: (prev: T) => T) => void;
    onSplitAdd: () => void;
    onSplitRemove: (index: number) => void;
    onSplitChange: (index: number, field: keyof PaymentSplitDraft, value: string) => void;
  };

  function renderPaymentSplitsSection<T extends PaymentDraft>(
    payment: T,
    handlers: GenericPaymentFormHandlers<T>,
    currentSplitTotal: number,
    currentDifference: number
  ) {
    return (
      <>
        <Divider label="Payment Splits" labelPosition="left" />

        <Text size="xs" c="dimmed">
          Max 10 splits. Duplicate accounts not allowed. Total must equal payment amount.
        </Text>

        {payment.splits.length === 0 ? (
          <Alert color="blue" variant="light">
            <Group gap="xs">
              <IconAlertCircle size={16} />
              <Text size="sm">No splits configured. Click &quot;Add Split&quot; to allocate payment across accounts.</Text>
            </Group>
          </Alert>
        ) : (
          <Stack gap="xs">
            {payment.splits.map((split, index) => (
              <Card key={`split-${index}`} withBorder p="sm" shadow="xs">
                <Group gap="md" align="flex-start">
                  <ThemeIcon size="sm" variant="light" color="blue" radius="xl">
                    <Text size="xs" fw={700}>{index + 1}</Text>
                  </ThemeIcon>
                  <Box style={{ flex: 2 }}>
                    <Select
                      placeholder="Select account"
                      data={accountOptions}
                      value={split.account_id}
                      onChange={(value) =>
                        handlers.onSplitChange(index, "account_id", value || "")
                      }
                      disabled={accountsLoading}
                      searchable
                      required
                      label={index === 0 ? "Account" : undefined}
                    />
                  </Box>
                  <Box style={{ flex: 1 }}>
                    <NumberInput
                      placeholder="Amount"
                      value={Number(split.amount) || 0}
                      onChange={(value) =>
                        handlers.onSplitChange(index, "amount", String(value ?? 0))
                      }
                      min={0}
                      prefix="Rp "
                      thousandSeparator="."
                      decimalSeparator=","
                      hideControls
                      required
                      label={index === 0 ? "Amount" : undefined}
                    />
                  </Box>
                  {payment.splits.length > 1 && (
                    <Tooltip label="Remove split">
                      <ActionIcon
                        color="red"
                        variant="light"
                        onClick={() => handlers.onSplitRemove(index)}
                        mt={index === 0 ? 24 : 0}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Card>
            ))}
          </Stack>
        )}

        <Group justify="space-between" align="center">
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            onClick={handlers.onSplitAdd}
            size="sm"
            disabled={payment.splits.length >= 10}
          >
            Add Split ({payment.splits.length}/10)
          </Button>

          {payment.splits.length > 0 && (
            <Card withBorder padding="xs" radius="md">
              <Group gap="md">
                <Stack gap={0} align="flex-end">
                  <Text size="xs" c="dimmed">
                    Split Total
                  </Text>
                  <Text size="sm" fw={500} c={currentDifference === 0 ? "green" : "red"}>
                    {formatCurrency(currentSplitTotal)}
                  </Text>
                </Stack>
                <Divider orientation="vertical" />
                <Stack gap={0}>
                  <Text size="xs" c="dimmed">
                    Payment Total
                  </Text>
                  <Text size="sm" fw={500}>
                    {formatCurrency(Number(payment.amount))}
                  </Text>
                </Stack>
                {currentDifference !== 0 && (
                  <>
                    <Divider orientation="vertical" />
                    <Badge
                      color={currentDifference > 0 ? "red" : "orange"}
                      size="lg"
                      variant="filled"
                    >
                      {currentDifference > 0 ? "+" : ""}
                      {formatCurrency(currentDifference)}
                    </Badge>
                  </>
                )}
                {currentDifference === 0 && (
                  <>
                    <Divider orientation="vertical" />
                    <Badge color="green" size="sm" leftSection={<IconCheck size={12} />}>
                      Balanced
                    </Badge>
                  </>
                )}
              </Group>
            </Card>
          )}
        </Group>
      </>
    );
  }

  const renderCreatePaymentForm = (
    payment: PaymentDraft,
    handlers: CreatePaymentFormHandlers,
    onSubmit: () => void
  ) => {
    const currentSplitTotal = calculateSplitTotal(payment.splits);
    const currentDifferenceMinor = toMinorUnits(payment.amount) - toMinorUnits(currentSplitTotal);
    const currentDifference = currentDifferenceMinor / 100;

    return (
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={4}>
              <Group gap="xs">
                <IconCash size={24} />
                Create New Payment
              </Group>
            </Title>
          </Group>

          <Divider />

          <Grid>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <TextInput
                label="Payment Number"
                placeholder="PAY-001"
                value={payment.payment_no}
                onChange={(e) => handlers.onChangeField((prev) => ({ ...prev, payment_no: e.target.value }))}
                description="Optional. Leave blank to auto-generate from numbering template."
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Select
                label="Invoice"
                placeholder={invoicesLoading ? "Loading..." : "Select invoice"}
                data={invoiceOptions}
                value={payment.invoice_id}
                onChange={(value) =>
                  handlers.onChangeField((prev) => buildPaymentFromInvoiceSelection(value, prev, invoices, paymentMappings, accountMappings))
                }
                disabled={invoicesLoading}
                searchable
                required
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Stack gap="xs">
                <TextInput
                  label="Client Ref (UUID)"
                  value={payment.client_ref}
                  disabled
                  readOnly
                  description={
                    payment.client_ref
                      ? "Auto-generated for idempotency"
                      : "Idempotency disabled (duplicate protection off)"
                  }
                />
                <Group gap="xs">
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() =>
                      handlers.onChangeField((prev) => ({
                        ...prev,
                        client_ref: generateClientRef()
                      }))
                    }
                  >
                    Regenerate
                  </Button>
                  <Button
                    variant="subtle"
                    color="gray"
                    size="xs"
                    onClick={() =>
                      handlers.onChangeField((prev) => ({
                        ...prev,
                        client_ref: ""
                      }))
                    }
                    disabled={!payment.client_ref}
                  >
                    Clear
                  </Button>
                </Group>
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <TextInput
                label="Payment Date/Time"
                type="datetime-local"
                value={payment.payment_at}
                onChange={(e) => handlers.onChangeField((prev) => ({ ...prev, payment_at: e.target.value }))}
                required
              />
            </Grid.Col>
          </Grid>

          <NumberInput
            label="Total Amount"
            value={Number(payment.amount) || 0}
            onChange={(value) => handlers.onChangeField((prev) => ({ ...prev, amount: String(value ?? 0) }))}
            min={0}
            prefix="Rp "
            thousandSeparator="."
            decimalSeparator=","
            hideControls
            required
            description={
              (() => {
                const selectedInvoice = invoices.find((inv) => inv.id === Number(payment.invoice_id));
                return selectedInvoice
                  ? `Invoice Outstanding: ${formatCurrency(selectedInvoice.grand_total - selectedInvoice.paid_total)}`
                  : undefined;
              })()
            }
          />

          {payment.invoice_id && Number(payment.amount) > 0 && (
            (() => {
              const selectedInvoice = invoices.find((inv) => inv.id === Number(payment.invoice_id));
              if (!selectedInvoice) return null;
              
              const invoiceOutstanding = selectedInvoice.grand_total - selectedInvoice.paid_total;
              const paymentAmount = Number(payment.amount);
              const variance = paymentAmount - invoiceOutstanding;
              
              return (
                <Card withBorder padding="sm" bg="gray.0">
                  <Stack gap="xs">
                    <Text size="xs" fw={500} c="dimmed">Payment Variance Preview</Text>
                    <Group justify="space-between">
                      <Text size="sm">Invoice Outstanding:</Text>
                      <Text size="sm" fw={500}>{formatCurrency(invoiceOutstanding)}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm">Payment Amount:</Text>
                      <Text size="sm" fw={500}>{formatCurrency(paymentAmount)}</Text>
                    </Group>
                    <Divider />
                    <Group justify="space-between">
                      <Text size="sm" fw={500}>Variance:</Text>
                      <Text size="sm" fw={700} c={variance > 0 ? "green" : variance < 0 ? "blue" : "gray"}>
                        {variance > 0 ? "+" : ""}{formatCurrency(variance)}
                        {variance > 0 ? " (Gain)" : variance < 0 ? " (Partial)" : " (Exact)"}
                      </Text>
                    </Group>
                    {variance !== 0 && (
                      <Alert color={variance > 0 ? "green" : "blue"} variant="light">
                        {variance > 0 
                          ? "Payment exceeds outstanding. Variance will be posted as gain on final settlement."
                          : "Payment less than outstanding. This is a partial payment - remaining AR stays open."}
                      </Alert>
                    )}
                  </Stack>
                </Card>
              );
            })()
          )}

          {renderPaymentSplitsSection(payment, handlers, currentSplitTotal, currentDifference)}

          <Group justify="flex-end" gap="sm">
             <Button
              onClick={onSubmit}
              loading={submitting}
              leftSection={<IconCash size={16} />}
              disabled={payment.splits.length === 0 || currentDifference !== 0}
            >
              Create Payment
            </Button>
          </Group>
        </Stack>
      </Paper>
    );
  };

  const renderEditPaymentForm = (
    payment: PaymentEditDraft,
    handlers: EditPaymentFormHandlers,
    onSubmit: () => void,
    onCancel: () => void
  ) => {
    const currentSplitTotal = calculateSplitTotal(payment.splits);
    const currentDifferenceMinor = toMinorUnits(payment.amount) - toMinorUnits(currentSplitTotal);
    const currentDifference = currentDifferenceMinor / 100;

    return (
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={4}>
              <Group gap="xs">
                <IconCash size={24} />
                Edit Draft Payment #{payment.id}
              </Group>
            </Title>
            <Button variant="subtle" color="gray" onClick={onCancel} size="sm">
              Cancel
            </Button>
          </Group>

          <Divider />

          <Grid>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <TextInput
                label="Payment Number"
                placeholder="PAY-001"
                value={payment.payment_no}
                onChange={(e) => handlers.onChangeField((prev) => ({ ...prev, payment_no: e.target.value }))}
                description="Optional. Leave blank to auto-generate from numbering template."
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Select
                label="Invoice"
                placeholder={invoicesLoading ? "Loading..." : "Select invoice"}
                data={invoiceOptions}
                value={payment.invoice_id}
                onChange={(value) =>
                  handlers.onChangeField((prev) => buildPaymentFromInvoiceSelection(value, prev, invoices, paymentMappings, accountMappings))
                }
                disabled={invoicesLoading}
                searchable
                required
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Stack gap="xs">
                <TextInput
                  label="Client Ref (UUID)"
                  value={payment.client_ref}
                  disabled
                  readOnly
                  description="Create-time idempotency key; not editable after creation"
                />
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <TextInput
                label="Payment Date/Time"
                type="datetime-local"
                value={payment.payment_at}
                onChange={(e) => handlers.onChangeField((prev) => ({ ...prev, payment_at: e.target.value }))}
                required
              />
            </Grid.Col>
          </Grid>

          <NumberInput
            label="Total Amount"
            value={Number(payment.amount) || 0}
            onChange={(value) => handlers.onChangeField((prev) => ({ ...prev, amount: String(value ?? 0) }))}
            min={0}
            prefix="Rp "
            thousandSeparator="."
            decimalSeparator=","
            hideControls
            required
            description={
              (() => {
                const selectedInvoice = invoices.find((inv) => inv.id === Number(payment.invoice_id));
                return selectedInvoice
                  ? `Invoice Outstanding: ${formatCurrency(selectedInvoice.grand_total - selectedInvoice.paid_total)}`
                  : undefined;
              })()
            }
          />

          {renderPaymentSplitsSection(payment, handlers, currentSplitTotal, currentDifference)}

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              loading={submitting}
              leftSection={<IconCheck size={16} />}
              disabled={payment.splits.length === 0 || currentDifference !== 0}
            >
              Save Changes
            </Button>
          </Group>
        </Stack>
      </Paper>
    );
  };

  // Calculate stats for KPI strip
  const loadedStats = calculatePaymentStats(payments);

  return (
    <Stack gap="lg" p="md">
      {/* Header Card */}
      <Card withBorder shadow="sm" padding="lg">
        <Group justify="space-between" align="flex-start">
          <Stack gap="xs">
            <Group gap="xs">
              <ThemeIcon size={40} radius="md" variant="light" color="blue">
                <IconCoins size={24} />
              </ThemeIcon>
              <div>
                <Title order={2}>Sales Payments</Title>
                <Text size="sm" c="dimmed">
                  Record and manage invoice payments with split allocation support
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
              {paymentsTotal > payments.length
                ? `Loaded ${payments.length} of ${paymentsTotal}`
                : `${paymentsTotal} payment${paymentsTotal !== 1 ? "s" : ""}`}
            </Badge>
          </Group>
        </Group>
      </Card>

      {/* KPI Strip */}
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Card withBorder padding="md">
          <Stack gap={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
              Total Payments
            </Text>
            <Text size="xl" fw={700}>
              {paymentsTotal}
            </Text>
            <Text size="xs" c="dimmed">
              Loaded {payments.length}
            </Text>
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Stack gap={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
              Loaded Draft Amount
            </Text>
            <Text size="xl" fw={700} c="yellow">
              {formatCurrency(loadedStats.draftAmount)}
            </Text>
            <Text size="xs" c="dimmed">
              Based on loaded rows
            </Text>
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Stack gap={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
              Loaded Posted Amount
            </Text>
            <Text size="xl" fw={700} c="green">
              {formatCurrency(loadedStats.postedAmount)}
            </Text>
            <Text size="xs" c="dimmed">
              Based on loaded rows
            </Text>
          </Stack>
        </Card>
      </SimpleGrid>

      {!isOnline && (
        <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
          You are offline. Payments will be queued for sync when connection is restored.
        </Alert>
      )}

      {!mappingsLoading && paymentMappings.length > 0 && !paymentMappings.some((m) => m.is_invoice_default) && (
        <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
          No invoice default payment method configured. Please set a default in Settings → Payment Methods.
        </Alert>
      )}

      {error && (
        <Alert color="red" icon={<IconAlertCircle size={16} />} onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      {isShowingStaleData && (
        <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
          Showing last loaded data from previous filters because refresh failed.
        </Alert>
      )}

      {!editingPayment &&
        renderCreatePaymentForm(
          newPayment,
          {
            onChangeField: (updater) => setNewPayment((prev) => updater(prev)),
            onSplitAdd: addSplit,
            onSplitRemove: removeSplit,
            onSplitChange: updateSplit
          },
          createPayment
        )}

      {editingPayment &&
        renderEditPaymentForm(
          editingPayment,
          {
            onChangeField: (updater) =>
              setEditingPayment((prev) => (prev ? updater(prev) : prev)),
            onSplitAdd: addEditingSplit,
            onSplitRemove: removeEditingSplit,
            onSplitChange: updateEditingSplit
          },
          savePaymentEdit,
          () => setEditingPayment(null)
        )}

      <Card withBorder shadow="sm" padding="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
            <Title order={4}>Payment History</Title>
            <Group gap="sm" wrap="wrap">
              <SegmentedControl
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as PaymentFilterStatus)}
                data={[
                  { label: "All", value: "ALL" },
                  { label: "Draft", value: "DRAFT" },
                  { label: "Posted", value: "POSTED" },
                  { label: "Void", value: "VOID" }
                ]}
              />
              <TextInput
                type="date"
                label="From"
                value={dateFromFilter}
                onChange={(e) => setDateFromFilter(e.target.value)}
                style={{ minWidth: 140 }}
              />
              <TextInput
                type="date"
                label="To"
                value={dateToFilter}
                onChange={(e) => setDateToFilter(e.target.value)}
                style={{ minWidth: 140 }}
              />
              <Button
                variant="subtle"
                size="sm"
                onClick={() => {
                  setStatusFilter("ALL");
                  setDateFromFilter("");
                  setDateToFilter("");
                }}
                disabled={statusFilter === "ALL" && !dateFromFilter && !dateToFilter}
              >
                Reset
              </Button>
            </Group>
          </Group>

          {loading ? (
            <Flex justify="center" p="xl">
              <Loader />
            </Flex>
          ) : payments.length === 0 ? (
            <Alert color="blue" variant="light">
              No payments found for this outlet.
            </Alert>
          ) : (
            <ScrollArea>
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Payment No</Table.Th>
                    <Table.Th>Date & Time</Table.Th>
                    <Table.Th style={{ textAlign: "center" }}>Status</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Amount</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Variance</Table.Th>
                    <Table.Th style={{ textAlign: "center" }}>Invoice</Table.Th>
                    <Table.Th>Splits</Table.Th>
                    <Table.Th style={{ textAlign: "center" }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {payments.map((payment) => (
                    <Fragment key={payment.id}>
                      <Table.Tr>
                        <Table.Td>
                          <Text fw={500}>{payment.payment_no}</Text>
                          {payment.client_ref && (
                            <Text size="xs" c="dimmed">
                              Ref: {payment.client_ref.slice(0, 8)}...
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>{formatDateTime(payment.payment_at)}</Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>
                          <Badge color={getStatusBadgeColor(payment.status)} size="sm">
                            {payment.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text fw={500}>{formatCurrency(payment.amount)}</Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          {payment.payment_delta_idr !== undefined && payment.payment_delta_idr !== null && payment.payment_delta_idr !== 0 ? (
                            <Badge 
                              color={payment.payment_delta_idr > 0 ? "green" : "blue"} 
                              variant="light"
                              size="sm"
                            >
                              {payment.payment_delta_idr > 0 ? "+" : ""}{formatCurrency(payment.payment_delta_idr)}
                            </Badge>
                          ) : payment.status === "POSTED" ? (
                            <Text size="sm" c="dimmed">-</Text>
                          ) : (
                            <Text size="sm" c="dimmed">Pending</Text>
                          )}
                        </Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>
                          <Tooltip label="View Invoice">
                            <Badge
                              variant="light"
                              size="sm"
                              leftSection={<IconReceipt size={12} />}
                            >
                              #{payment.invoice_id}
                            </Badge>
                          </Tooltip>
                        </Table.Td>
                        <Table.Td>
                          {payment.splits && payment.splits.length > 1 ? (
                            <Button
                              variant="light"
                              size="xs"
                              leftSection={<IconCoins size={14} />}
                              onClick={() =>
                                setExpandedPaymentId(
                                  expandedPaymentId === payment.id ? null : payment.id
                                )
                              }
                            >
                              {payment.splits.length} splits
                            </Button>
                          ) : payment.splits && payment.splits.length === 1 ? (
                            <Text size="sm">
                              {payment.splits[0].account_name ?? `Account #${payment.splits[0].account_id}`}
                            </Text>
                          ) : (
                            <Text size="sm" c="dimmed">
                              {payment.account_name ?? `Account #${payment.account_id}`}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>
                          <Menu position="bottom-end" withArrow>
                            <Menu.Target>
                              <ActionIcon variant="subtle">
                                <IconDotsVertical size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              {payment.status === "DRAFT" && (
                                <Menu.Item
                                  leftSection={<IconEdit size={14} />}
                                  onClick={() => loadPaymentForEdit(payment)}
                                >
                                  Edit
                                </Menu.Item>
                              )}
                              {payment.status === "DRAFT" && (
                                <Menu.Item
                                  leftSection={<IconCheck size={14} />}
                                  onClick={() => postPaymentById(payment.id)}
                                >
                                  Post
                                </Menu.Item>
                              )}
                            </Menu.Dropdown>
                          </Menu>
                        </Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td colSpan={8} style={{ padding: 0, border: 0 }}>
                          <Collapse in={expandedPaymentId === payment.id}>
                            <Box p="md" bg="gray.0">
                              <Text fw={500} size="sm" mb="xs">
                                Payment Splits:
                              </Text>
                              <List size="sm" spacing="xs">
                                {payment.splits?.map((split, idx) => (
                                  <List.Item key={split.id}>
                                    <Group gap="sm">
                                      <Badge variant="light" size="xs">
                                        {idx + 1}
                                      </Badge>
                                      <Text>
                                        {split.account_name ?? `Account #${split.account_id}`}
                                      </Text>
                                      <IconArrowRight size={14} style={{ color: "gray" }} />
                                      <Text fw={500}>{formatCurrency(split.amount)}</Text>
                                    </Group>
                                  </List.Item>
                                ))}
                              </List>
                            </Box>
                          </Collapse>
                        </Table.Td>
                      </Table.Tr>
                    </Fragment>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
