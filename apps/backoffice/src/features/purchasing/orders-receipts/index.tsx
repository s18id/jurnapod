// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Alert,
  Badge,
  Button,
  Card,
  Drawer,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconAlertCircle, IconEye, IconPencil, IconPlus, IconRefresh, IconTruckDelivery } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { fromUtcIso } from "@jurnapod/shared";
import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react";

import { ReviewPanel, type ReviewPanelSection } from "@/components/ReviewPanel";
import { ApiError } from "@/lib/api-client";
import { actionGates, resolveEffectivePermissions } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/session";

import {
  PURCHASE_ORDER_STATUSES,
  PURCHASING_ORDERS_DEFAULT_LIMIT,
  PURCHASING_RECEIPTS_DEFAULT_LIMIT,
  fetchPurchaseOrder,
  pageToPurchasingOffset,
  purchasingOrderQueryKeys,
  type GoodsReceipt,
  type GoodsReceiptCreateInput,
  type GoodsReceiptLineInput,
  type GoodsReceiptSummary,
  type PurchaseOrder,
  type PurchaseOrderCreateInput,
  type PurchaseOrderLineInput,
  type PurchaseOrderStatus,
  type PurchaseOrderSummary,
  type PurchaseOrderUpdateInput,
  useCreateGoodsReceiptMutation,
  useCreatePurchaseOrderMutation,
  useGoodsReceiptQuery,
  useGoodsReceiptsQuery,
  usePurchaseOrderQuery,
  usePurchaseOrdersQuery,
  useTransitionPurchaseOrderStatusMutation,
  useUpdatePurchaseOrderMutation,
} from "./api";

interface PurchasingPageProps {
  user: SessionUser;
}

type FormErrors = Record<string, string>;
type PurchaseOrderModalMode = "create" | "edit";

export interface PurchaseOrderLineFormData {
  item_id: string;
  description: string;
  qty: string;
  unit_price: string;
  tax_rate: string;
}

export interface PurchaseOrderFormData {
  supplier_id: string;
  idempotency_key: string;
  order_date: string;
  currency_code: string;
  expected_date: string;
  notes: string;
  lines: PurchaseOrderLineFormData[];
}

export interface GoodsReceiptLineFormData {
  po_line_id: string;
  item_id: string;
  description: string;
  qty: string;
  unit: string;
}

export interface GoodsReceiptFormData {
  supplier_id: string;
  idempotency_key: string;
  reference_number: string;
  receipt_date: string;
  notes: string;
  lines: GoodsReceiptLineFormData[];
}

export const defaultPurchaseOrderLineFormData: PurchaseOrderLineFormData = {
  item_id: "",
  description: "",
  qty: "",
  unit_price: "",
  tax_rate: "0",
};

export const defaultPurchaseOrderFormData: PurchaseOrderFormData = {
  supplier_id: "",
  idempotency_key: "",
  order_date: "",
  currency_code: "IDR",
  expected_date: "",
  notes: "",
  lines: [{ ...defaultPurchaseOrderLineFormData }],
};

export const defaultGoodsReceiptLineFormData: GoodsReceiptLineFormData = {
  po_line_id: "",
  item_id: "",
  description: "",
  qty: "",
  unit: "",
};

export const defaultGoodsReceiptFormData: GoodsReceiptFormData = {
  supplier_id: "",
  idempotency_key: "",
  reference_number: "",
  receipt_date: "",
  notes: "",
  lines: [{ ...defaultGoodsReceiptLineFormData }],
};

function optionalString(value: string): string | null | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalNumber(value: string): number | null | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Number(trimmed) : null;
}

function requiredNumber(value: string): number {
  return Number(value.trim());
}

function optionalDate(value: string): string | null | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function isPositiveDecimal(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) return false;
  return Number(trimmed) > 0;
}

function isOptionalNonNegativeDecimal(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^\d+(\.\d{1,4})?$/.test(trimmed);
}

function isPositiveIntegerText(value: string): boolean {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) && Number(trimmed) > 0;
}

function compactErrors(errors: Array<string | undefined>): string[] {
  return errors.filter(Boolean) as string[];
}

export function isDraftEditable(order: Pick<PurchaseOrderSummary, "status">): boolean {
  return order.status === "DRAFT";
}

export function isReceiptAllowedForOrder(order: Pick<PurchaseOrderSummary, "status">): boolean {
  return order.status === "SENT" || order.status === "PARTIAL_RECEIVED";
}

export function validStatusTargets(status: PurchaseOrderStatus): PurchaseOrderStatus[] {
  switch (status) {
    case "DRAFT": return ["SENT", "CLOSED"];
    case "SENT": return ["PARTIAL_RECEIVED", "RECEIVED", "CLOSED"];
    case "PARTIAL_RECEIVED": return ["RECEIVED", "CLOSED"];
    case "RECEIVED": return ["CLOSED"];
    case "CLOSED": return [];
  }
}

export function isRefetchAfterMutationError(error: unknown): boolean {
  return error instanceof ApiError && (
    (error.status === 400 && error.code === "INVALID_REQUEST") ||
    error.status === 403 ||
    error.status === 404
  );
}

export function formatPurchasingApiError(error: unknown): string {
  if (error instanceof ApiError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "UNKNOWN_ERROR: Purchasing request failed";
}

export interface SubmitLockRef {
  current: boolean;
}

export async function runWithSubmitLock<T>(lock: SubmitLockRef, task: () => Promise<T>): Promise<T | undefined> {
  if (lock.current) return undefined;
  lock.current = true;
  try {
    return await task();
  } finally {
    lock.current = false;
  }
}

export interface StaleEditRecoveryResult {
  message: string;
  refreshed: PurchaseOrder | null;
  saveDisabled: boolean;
}

export async function recoverRejectedDraftEdit(input: {
  error: unknown;
  orderId: number;
  refetchOrder: (orderId: number) => Promise<PurchaseOrder>;
  invalidateOrderList: () => Promise<unknown>;
  invalidateOrderDetail: (orderId: number) => Promise<unknown>;
}): Promise<StaleEditRecoveryResult> {
  const refreshed = await input.refetchOrder(input.orderId).catch(() => null);
  await input.invalidateOrderList();
  await input.invalidateOrderDetail(input.orderId);
  const statusText = refreshed ? ` Refreshed backend status: ${refreshed.status}.` : " Refreshed backend state could not be loaded.";
  return {
    refreshed,
    saveDisabled: refreshed ? !isDraftEditable(refreshed) : true,
    message: `Current backend state was refreshed after rejected edit.${statusText} ${formatPurchasingApiError(input.error)}`,
  };
}

export async function applyReceiptSuccessEffects(input: {
  warnings: readonly string[];
  sourceOrderId: number | null;
  selectedOrderId: number | null;
  setWarnings: (warnings: string[]) => void;
  invalidateOrderList: () => Promise<unknown>;
  invalidateOrderDetail: (orderId: number) => Promise<unknown>;
  refetchSelectedOrder: () => Promise<unknown>;
}): Promise<void> {
  input.setWarnings([...input.warnings]);
  await input.invalidateOrderList();
  if (input.sourceOrderId != null) {
    await input.invalidateOrderDetail(input.sourceOrderId);
    if (input.selectedOrderId === input.sourceOrderId) await input.refetchSelectedOrder();
  }
}

export function validatePurchaseOrderForm(data: PurchaseOrderFormData, mode: PurchaseOrderModalMode): FormErrors {
  const errors: FormErrors = {};
  if (mode === "create" && !isPositiveIntegerText(data.supplier_id)) errors.supplier_id = "Supplier ID is required.";
  if (mode === "create" && !isDateOnly(data.order_date)) errors.order_date = "Order date must be YYYY-MM-DD.";
  if (data.expected_date.trim() && !isDateOnly(data.expected_date)) errors.expected_date = "Expected date must be YYYY-MM-DD.";
  if (!/^[A-Z]{3}$/.test(data.currency_code.trim().toUpperCase())) errors.currency_code = "Currency must be a 3-letter ISO code.";
  if (data.lines.length === 0) errors.lines = "At least one purchase order line is required.";

  data.lines.forEach((line, index) => {
    const row = index + 1;
    if (line.item_id.trim() && !isPositiveIntegerText(line.item_id)) errors[`lines.${index}.item_id`] = `Line ${row}: item ID must be a positive integer.`;
    if (!isPositiveDecimal(line.qty)) errors[`lines.${index}.qty`] = `Line ${row}: quantity must be greater than zero.`;
    if (!isPositiveDecimal(line.unit_price)) errors[`lines.${index}.unit_price`] = `Line ${row}: unit price must be greater than zero.`;
    if (!isOptionalNonNegativeDecimal(line.tax_rate)) errors[`lines.${index}.tax_rate`] = `Line ${row}: tax rate must be a decimal.`;
  });

  return errors;
}

export function validateGoodsReceiptForm(data: GoodsReceiptFormData): FormErrors {
  const errors: FormErrors = {};
  if (!isPositiveIntegerText(data.supplier_id)) errors.supplier_id = "Supplier ID is required.";
  if (!data.reference_number.trim()) errors.reference_number = "Reference number is required.";
  if (!isDateOnly(data.receipt_date)) errors.receipt_date = "Receipt date must be YYYY-MM-DD.";
  if (data.lines.length === 0) errors.lines = "At least one receipt line is required.";

  data.lines.forEach((line, index) => {
    const row = index + 1;
    const hasPoLine = line.po_line_id.trim().length > 0;
    const hasItem = line.item_id.trim().length > 0;
    if (!hasPoLine && !hasItem) errors[`lines.${index}.source`] = `Line ${row}: po_line_id or item_id is required.`;
    if (hasPoLine && !isPositiveIntegerText(line.po_line_id)) errors[`lines.${index}.po_line_id`] = `Line ${row}: PO line ID must be a positive integer.`;
    if (hasItem && !isPositiveIntegerText(line.item_id)) errors[`lines.${index}.item_id`] = `Line ${row}: item ID must be a positive integer.`;
    if (!isPositiveDecimal(line.qty)) errors[`lines.${index}.qty`] = `Line ${row}: receipt quantity must be greater than zero.`;
  });

  return errors;
}

export function purchaseOrderFormToCreateInput(data: PurchaseOrderFormData): PurchaseOrderCreateInput {
  return {
    supplier_id: requiredNumber(data.supplier_id),
    idempotency_key: optionalUndefined(data.idempotency_key),
    order_date: data.order_date.trim(),
    currency_code: data.currency_code.trim().toUpperCase() || "IDR",
    expected_date: optionalDate(data.expected_date),
    notes: optionalString(data.notes),
    lines: data.lines.map(purchaseOrderLineFormToInput),
  };
}

export function purchaseOrderFormToUpdateInput(data: PurchaseOrderFormData): PurchaseOrderUpdateInput {
  return {
    expected_date: optionalDate(data.expected_date),
    notes: optionalString(data.notes),
    lines: data.lines.map(purchaseOrderLineFormToInput),
  };
}

function purchaseOrderLineFormToInput(line: PurchaseOrderLineFormData): PurchaseOrderLineInput {
  return {
    item_id: optionalNumber(line.item_id),
    description: optionalString(line.description),
    qty: line.qty.trim(),
    unit_price: line.unit_price.trim(),
    tax_rate: line.tax_rate.trim() || "0",
  };
}

export function purchaseOrderToFormData(order: PurchaseOrder): PurchaseOrderFormData {
  return {
    supplier_id: String(order.supplier_id),
    idempotency_key: "",
    order_date: fromUtcIso.dateOnly(order.order_date),
    currency_code: order.currency_code,
    expected_date: order.expected_date ? fromUtcIso.dateOnly(order.expected_date) : "",
    notes: order.notes ?? "",
    lines: order.lines.map((line) => ({
      item_id: line.item_id == null ? "" : String(line.item_id),
      description: line.description ?? "",
      qty: line.qty,
      unit_price: line.unit_price,
      tax_rate: line.tax_rate || "0",
    })),
  };
}

export function purchaseOrderToReceiptFormData(order: PurchaseOrder): GoodsReceiptFormData {
  return {
    supplier_id: String(order.supplier_id),
    idempotency_key: "",
    reference_number: "",
    receipt_date: "",
    notes: "",
    lines: order.lines.map((line) => ({
      po_line_id: String(line.id),
      item_id: line.item_id == null ? "" : String(line.item_id),
      description: line.description ?? "",
      qty: "",
      unit: "",
    })),
  };
}

export function goodsReceiptFormToCreateInput(data: GoodsReceiptFormData): GoodsReceiptCreateInput {
  return {
    supplier_id: requiredNumber(data.supplier_id),
    idempotency_key: optionalUndefined(data.idempotency_key),
    reference_number: data.reference_number.trim(),
    receipt_date: data.receipt_date.trim(),
    notes: optionalString(data.notes),
    lines: data.lines.map((line): GoodsReceiptLineInput => ({
      po_line_id: optionalNumber(line.po_line_id),
      item_id: optionalNumber(line.item_id),
      description: optionalString(line.description),
      qty: line.qty.trim(),
      unit: optionalString(line.unit),
    })),
  };
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case "DRAFT": return "gray";
    case "SENT": return "blue";
    case "PARTIAL_RECEIVED": return "yellow";
    case "RECEIVED": return "green";
    case "CLOSED": return "dark";
    default: return "gray";
  }
}

function DetailField(props: { label: string; value: string | number | null | undefined }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" tt="uppercase">{props.label}</Text>
      <Text size="sm">{props.value == null || props.value === "" ? "—" : props.value}</Text>
    </Stack>
  );
}

function PurchaseOrderFields(props: {
  data: PurchaseOrderFormData;
  errors: FormErrors;
  mode: PurchaseOrderModalMode;
  disabled?: boolean;
  onChange: (patch: Partial<PurchaseOrderFormData>) => void;
}) {
  const updateLine = (index: number, patch: Partial<PurchaseOrderLineFormData>) => {
    props.onChange({
      lines: props.data.lines.map((line, currentIndex) => currentIndex === index ? { ...line, ...patch } : line),
    });
  };
  const addLine = () => props.onChange({ lines: [...props.data.lines, { ...defaultPurchaseOrderLineFormData }] });
  const removeLine = (index: number) => props.onChange({ lines: props.data.lines.filter((_, currentIndex) => currentIndex !== index) });

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput label="Supplier ID" value={props.data.supplier_id} onChange={(event) => props.onChange({ supplier_id: event.currentTarget.value })} error={props.errors.supplier_id} disabled={props.disabled || props.mode === "edit"} required />
        <TextInput label="Order date" type="date" value={props.data.order_date} onChange={(event) => props.onChange({ order_date: event.currentTarget.value })} error={props.errors.order_date} disabled={props.disabled || props.mode === "edit"} required />
        <TextInput label="Currency" value={props.data.currency_code} onChange={(event) => props.onChange({ currency_code: event.currentTarget.value.toUpperCase() })} error={props.errors.currency_code} disabled={props.disabled} />
        <TextInput label="Expected date" type="date" value={props.data.expected_date} onChange={(event) => props.onChange({ expected_date: event.currentTarget.value })} error={props.errors.expected_date} disabled={props.disabled} />
        <TextInput label="Idempotency key" value={props.data.idempotency_key} onChange={(event) => props.onChange({ idempotency_key: event.currentTarget.value })} disabled={props.disabled || props.mode === "edit"} />
      </SimpleGrid>
      <Textarea label="Notes" minRows={3} value={props.data.notes} onChange={(event) => props.onChange({ notes: event.currentTarget.value })} disabled={props.disabled} />
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={4}>Purchase order lines</Title>
            <Button size="xs" variant="light" onClick={addLine} disabled={props.disabled}>Add line</Button>
          </Group>
          {props.errors.lines ? <Alert color="red">{props.errors.lines}</Alert> : null}
          {props.data.lines.map((line, index) => (
            <Card key={index} withBorder radius="sm" p="sm">
              <Stack gap="xs">
                <Group justify="space-between"><Text fw={600}>Line {index + 1}</Text>{props.data.lines.length > 1 ? <Button size="xs" variant="subtle" color="red" onClick={() => removeLine(index)} disabled={props.disabled}>Remove</Button> : null}</Group>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <TextInput label="Item ID" value={line.item_id} onChange={(event) => updateLine(index, { item_id: event.currentTarget.value })} error={props.errors[`lines.${index}.item_id`]} disabled={props.disabled} />
                  <TextInput label="Description" value={line.description} onChange={(event) => updateLine(index, { description: event.currentTarget.value })} disabled={props.disabled} />
                  <TextInput label="Quantity" value={line.qty} onChange={(event) => updateLine(index, { qty: event.currentTarget.value })} error={props.errors[`lines.${index}.qty`]} disabled={props.disabled} required />
                  <TextInput label="Unit price" value={line.unit_price} onChange={(event) => updateLine(index, { unit_price: event.currentTarget.value })} error={props.errors[`lines.${index}.unit_price`]} disabled={props.disabled} required />
                  <TextInput label="Tax rate" value={line.tax_rate} onChange={(event) => updateLine(index, { tax_rate: event.currentTarget.value })} error={props.errors[`lines.${index}.tax_rate`]} disabled={props.disabled} />
                </SimpleGrid>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

function GoodsReceiptFields(props: {
  data: GoodsReceiptFormData;
  errors: FormErrors;
  sourceOrder: PurchaseOrder | null;
  onChange: (patch: Partial<GoodsReceiptFormData>) => void;
}) {
  const updateLine = (index: number, patch: Partial<GoodsReceiptLineFormData>) => {
    props.onChange({
      lines: props.data.lines.map((line, currentIndex) => currentIndex === index ? { ...line, ...patch } : line),
    });
  };
  const addLine = () => props.onChange({ lines: [...props.data.lines, { ...defaultGoodsReceiptLineFormData }] });
  const removeLine = (index: number) => props.onChange({ lines: props.data.lines.filter((_, currentIndex) => currentIndex !== index) });

  return (
    <Stack gap="md">
      {props.sourceOrder ? <Alert color="blue">Receipt draft was pre-filled from backend PO detail {props.sourceOrder.order_no}.</Alert> : null}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput label="Supplier ID" value={props.data.supplier_id} onChange={(event) => props.onChange({ supplier_id: event.currentTarget.value })} error={props.errors.supplier_id} required />
        <TextInput label="Reference number" value={props.data.reference_number} onChange={(event) => props.onChange({ reference_number: event.currentTarget.value })} error={props.errors.reference_number} required />
        <TextInput label="Receipt date" type="date" value={props.data.receipt_date} onChange={(event) => props.onChange({ receipt_date: event.currentTarget.value })} error={props.errors.receipt_date} required />
        <TextInput label="Idempotency key" value={props.data.idempotency_key} onChange={(event) => props.onChange({ idempotency_key: event.currentTarget.value })} />
      </SimpleGrid>
      <Textarea label="Notes" minRows={3} value={props.data.notes} onChange={(event) => props.onChange({ notes: event.currentTarget.value })} />
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={4}>Goods receipt lines</Title>
            <Button size="xs" variant="light" onClick={addLine}>Add line</Button>
          </Group>
          {props.errors.lines ? <Alert color="red">{props.errors.lines}</Alert> : null}
          {props.data.lines.map((line, index) => (
            <Card key={index} withBorder radius="sm" p="sm">
              <Stack gap="xs">
                <Group justify="space-between"><Text fw={600}>Line {index + 1}</Text>{props.data.lines.length > 1 ? <Button size="xs" variant="subtle" color="red" onClick={() => removeLine(index)}>Remove</Button> : null}</Group>
                {props.errors[`lines.${index}.source`] ? <Alert color="red">{props.errors[`lines.${index}.source`]}</Alert> : null}
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <TextInput label="PO line ID" value={line.po_line_id} onChange={(event) => updateLine(index, { po_line_id: event.currentTarget.value })} error={props.errors[`lines.${index}.po_line_id`]} />
                  <TextInput label="Item ID" value={line.item_id} onChange={(event) => updateLine(index, { item_id: event.currentTarget.value })} error={props.errors[`lines.${index}.item_id`]} />
                  <TextInput label="Description" value={line.description} onChange={(event) => updateLine(index, { description: event.currentTarget.value })} />
                  <TextInput label="Receipt quantity" value={line.qty} onChange={(event) => updateLine(index, { qty: event.currentTarget.value })} error={props.errors[`lines.${index}.qty`]} required />
                  <TextInput label="Unit" value={line.unit} onChange={(event) => updateLine(index, { unit: event.currentTarget.value })} />
                </SimpleGrid>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

export function PurchaseOrderReviewForm(props: {
  mode: PurchaseOrderModalMode;
  data: PurchaseOrderFormData;
  errors: FormErrors;
  submitError?: string | null;
  currentStatus?: PurchaseOrderStatus | null;
  saveDisabled?: boolean;
  submitting: boolean;
  onChange: (patch: Partial<PurchaseOrderFormData>) => void;
  onDiscard: () => void;
  onSubmit: () => Promise<boolean>;
}) {
  const sections: ReviewPanelSection[] = [{
    id: "purchase-order",
    title: "Purchase order",
    description: "Review supplier, dates, and positive line quantities/prices before saving.",
    errors: compactErrors(Object.values(props.errors)),
    content: <Stack gap="md">
      {props.submitError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{props.submitError}</Alert> : null}
      {props.currentStatus ? <Alert color={isDraftEditable({ status: props.currentStatus }) ? "blue" : "yellow"}>Current backend PO status: {props.currentStatus}{props.saveDisabled ? ". Editing is disabled because only DRAFT purchase orders can be saved." : ""}</Alert> : null}
      <PurchaseOrderFields data={props.data} errors={props.errors} mode={props.mode} disabled={props.saveDisabled} onChange={props.onChange} />
    </Stack>,
  }];
  return (
    <ReviewPanel
      title={props.mode === "create" ? "Create purchase order" : "Edit draft purchase order"}
      description="Purchase orders use purchasing.orders permissions and backend status authority."
      sections={sections}
      summaryItems={[{ label: "Supplier ID", value: props.data.supplier_id || "—" }, { label: "Lines", value: props.data.lines.length }]}
      scopeBadges={[{ label: "Resource", value: "purchasing.orders" }]}
      saveLabel={props.mode === "create" ? "Create purchase order" : "Save draft purchase order"}
      saveDisabled={props.saveDisabled}
      submitting={props.submitting}
      onDiscardDraft={props.onDiscard}
      onSubmit={() => { void props.onSubmit(); }}
    />
  );
}

export function GoodsReceiptReviewForm(props: {
  data: GoodsReceiptFormData;
  errors: FormErrors;
  submitError?: string | null;
  sourceOrder: PurchaseOrder | null;
  submitting: boolean;
  onChange: (patch: Partial<GoodsReceiptFormData>) => void;
  onDiscard: () => void;
  onSubmit: () => Promise<boolean>;
}) {
  const sections: ReviewPanelSection[] = [{
    id: "goods-receipt",
    title: "Goods receipt",
    description: "Review receipt reference and positive received quantities before saving.",
    errors: compactErrors(Object.values(props.errors)),
    content: <Stack gap="md">
      {props.submitError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{props.submitError}</Alert> : null}
      <GoodsReceiptFields data={props.data} errors={props.errors} sourceOrder={props.sourceOrder} onChange={props.onChange} />
    </Stack>,
  }];
  return (
    <ReviewPanel
      title="Create goods receipt"
      description="Goods receipt submission uses purchasing.receipts.CREATE. Backend receipt response is authoritative."
      sections={sections}
      summaryItems={[{ label: "Supplier ID", value: props.data.supplier_id || "—" }, { label: "Lines", value: props.data.lines.length }]}
      scopeBadges={[{ label: "Resource", value: "purchasing.receipts" }]}
      saveLabel="Create goods receipt"
      submitting={props.submitting}
      onDiscardDraft={props.onDiscard}
      onSubmit={() => { void props.onSubmit(); }}
    />
  );
}

function PurchaseOrderDetailDrawer(props: {
  opened: boolean;
  orderId: number | null;
  canUpdate: boolean;
  canCreateReceipt: boolean;
  onClose: () => void;
  onEdit: (order: PurchaseOrder) => void;
  onCreateReceipt: (order: PurchaseOrder) => void;
}) {
  const orderQuery = usePurchaseOrderQuery(props.orderId);
  const order = orderQuery.data;
  return (
    <Drawer opened={props.opened} onClose={props.onClose} title="Purchase order detail" position="right" size="xl" withinPortal={false}>
      <Stack gap="md">
        {orderQuery.error ? <Alert color="red">{formatPurchasingApiError(orderQuery.error)}</Alert> : null}
        {orderQuery.isLoading ? <Text c="dimmed">Loading purchase order…</Text> : null}
        {order ? (
          <>
            <Card withBorder radius="md" p="md">
              <Stack gap="md">
                <Group justify="space-between"><Title order={3}>{order.order_no}</Title><Badge color={statusBadgeColor(order.status)}>{order.status}</Badge></Group>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <DetailField label="Supplier ID" value={order.supplier_id} />
                  <DetailField label="Supplier" value={order.supplier_name} />
                  <DetailField label="Order date" value={order.order_date} />
                  <DetailField label="Expected date" value={order.expected_date} />
                  <DetailField label="Currency" value={order.currency_code} />
                  <DetailField label="Backend total" value={order.total_amount} />
                </SimpleGrid>
                <DetailField label="Notes" value={order.notes} />
                <Group>
                  {props.canUpdate && isDraftEditable(order) ? <Button leftSection={<IconPencil size={14} />} onClick={() => props.onEdit(order)}>Edit draft</Button> : null}
                  {props.canCreateReceipt && isReceiptAllowedForOrder(order) ? <Button leftSection={<IconTruckDelivery size={14} />} onClick={() => props.onCreateReceipt(order)}>Create receipt from backend PO detail</Button> : null}
                </Group>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md">
              <Stack gap="sm">
                <Title order={4}>Lines</Title>
                <Table striped highlightOnHover>
                  <Table.Thead><Table.Tr><Table.Th>#</Table.Th><Table.Th>Item</Table.Th><Table.Th>Description</Table.Th><Table.Th>Ordered</Table.Th><Table.Th>Received</Table.Th><Table.Th>Unit price</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>{order.lines.map((line) => <Table.Tr key={line.id}><Table.Td>{line.line_no}</Table.Td><Table.Td>{line.item_id ?? "—"}</Table.Td><Table.Td>{line.description ?? "—"}</Table.Td><Table.Td>{line.qty}</Table.Td><Table.Td>{line.received_qty}</Table.Td><Table.Td>{line.unit_price}</Table.Td></Table.Tr>)}</Table.Tbody>
                </Table>
              </Stack>
            </Card>
          </>
        ) : null}
      </Stack>
    </Drawer>
  );
}

function GoodsReceiptDetailDrawer(props: { opened: boolean; receiptId: number | null; onClose: () => void }) {
  const receiptQuery = useGoodsReceiptQuery(props.receiptId);
  const receipt = receiptQuery.data;
  return (
    <Drawer opened={props.opened} onClose={props.onClose} title="Goods receipt detail" position="right" size="xl" withinPortal={false}>
      <Stack gap="md">
        {receiptQuery.error ? <Alert color="red">{formatPurchasingApiError(receiptQuery.error)}</Alert> : null}
        {receiptQuery.isLoading ? <Text c="dimmed">Loading goods receipt…</Text> : null}
        {receipt ? (
          <Card withBorder radius="md" p="md">
            <Stack gap="md">
              <Group justify="space-between"><Title order={3}>{receipt.reference_number}</Title><Badge color="green">{receipt.status}</Badge></Group>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <DetailField label="Supplier ID" value={receipt.supplier_id} />
                <DetailField label="Supplier" value={receipt.supplier_name} />
                <DetailField label="Receipt date" value={receipt.receipt_date} />
                <DetailField label="PO reference" value={receipt.po_reference} />
              </SimpleGrid>
              <DetailField label="Notes" value={receipt.notes} />
              <Table striped highlightOnHover>
                <Table.Thead><Table.Tr><Table.Th>#</Table.Th><Table.Th>PO line</Table.Th><Table.Th>Item</Table.Th><Table.Th>Description</Table.Th><Table.Th>Qty</Table.Th><Table.Th>Over receipt</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>{receipt.lines.map((line) => <Table.Tr key={line.id}><Table.Td>{line.line_no}</Table.Td><Table.Td>{line.po_line_id ?? "—"}</Table.Td><Table.Td>{line.item_id ?? "—"}</Table.Td><Table.Td>{line.description ?? "—"}</Table.Td><Table.Td>{line.qty}</Table.Td><Table.Td>{line.over_receipt_allowed ? "Allowed" : "No"}</Table.Td></Table.Tr>)}</Table.Tbody>
              </Table>
            </Stack>
          </Card>
        ) : null}
      </Stack>
    </Drawer>
  );
}

export function GoodsReceiptWarningsAlert(props: { warnings: readonly string[]; onClose?: () => void }) {
  if (props.warnings.length === 0) return null;
  return <Alert color="yellow" icon={<IconAlertCircle size={16} />} title="Receipt warnings" onClose={props.onClose} withCloseButton>{props.warnings.join(" ")}</Alert>;
}

export function PurchasingOrdersPage({ user }: PurchasingPageProps) {
  const isMobile = useMediaQuery("(max-width: 48em)");
  const queryClient = useQueryClient();
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [orderDetailOpen, { open: openOrderDetail, close: closeOrderDetail }] = useDisclosure(false);
  const [orderModalOpen, { open: openOrderModal, close: closeOrderModal }] = useDisclosure(false);
  const [receiptModalOpen, { open: openReceiptModal, close: closeReceiptModal }] = useDisclosure(false);
  const [orderMode, setOrderMode] = useState<PurchaseOrderModalMode>("create");
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [orderForm, setOrderForm] = useState<PurchaseOrderFormData>(defaultPurchaseOrderFormData);
  const [orderErrors, setOrderErrors] = useState<FormErrors>({});
  const [orderSubmitError, setOrderSubmitError] = useState<string | null>(null);
  const [orderSaveDisabled, setOrderSaveDisabled] = useState(false);
  const [receiptForm, setReceiptForm] = useState<GoodsReceiptFormData>(defaultGoodsReceiptFormData);
  const [receiptErrors, setReceiptErrors] = useState<FormErrors>({});
  const [receiptSubmitError, setReceiptSubmitError] = useState<string | null>(null);
  const [receiptSourceOrder, setReceiptSourceOrder] = useState<PurchaseOrder | null>(null);
  const [receiptWarnings, setReceiptWarnings] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const orderSubmitLock = useRef(false);
  const receiptSubmitLock = useRef(false);

  const orderPermissions = useMemo(() => actionGates(resolveEffectivePermissions(user) ?? [], "purchasing", "orders", ["READ", "CREATE", "UPDATE"]), [user]);
  const receiptPermissions = useMemo(() => actionGates(resolveEffectivePermissions(user) ?? [], "purchasing", "receipts", ["READ", "CREATE"]), [user]);

  const listParams = useMemo(() => ({
    supplier_id: supplierFilter,
    status: statusFilter,
    date_from: dateFrom,
    date_to: dateTo,
    limit: PURCHASING_ORDERS_DEFAULT_LIMIT,
    offset: pageToPurchasingOffset(page, PURCHASING_ORDERS_DEFAULT_LIMIT),
  }), [dateFrom, dateTo, page, statusFilter, supplierFilter]);
  const ordersQuery = usePurchaseOrdersQuery(listParams, { enabled: orderPermissions.READ });
  const selectedOrderQuery = usePurchaseOrderQuery(selectedOrderId);
  const createOrderMutation = useCreatePurchaseOrderMutation();
  const updateOrderMutation = useUpdatePurchaseOrderMutation();
  const transitionMutation = useTransitionPurchaseOrderStatusMutation();
  const createReceiptMutation = useCreateGoodsReceiptMutation();

  const orders = ordersQuery.data?.orders ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const maxPage = Math.max(1, Math.ceil(total / PURCHASING_ORDERS_DEFAULT_LIMIT));

  const resetOrderForm = useCallback(() => {
    setOrderForm(defaultPurchaseOrderFormData);
    setOrderErrors({});
    setOrderSubmitError(null);
    setOrderSaveDisabled(false);
    setEditingOrder(null);
  }, []);

  const openCreateOrder = () => {
    setOrderMode("create");
    setActionError(null);
    setOrderSubmitError(null);
    setOrderSaveDisabled(false);
    setOrderForm(defaultPurchaseOrderFormData);
    setOrderErrors({});
    setEditingOrder(null);
    openOrderModal();
  };

  const openEditOrder = (order: PurchaseOrder) => {
    if (!isDraftEditable(order)) return;
    setOrderMode("edit");
    setActionError(null);
    setOrderSubmitError(null);
    setOrderSaveDisabled(false);
    setEditingOrder(order);
    setOrderForm(purchaseOrderToFormData(order));
    setOrderErrors({});
    openOrderModal();
  };

  const openOrder = (order: PurchaseOrderSummary) => {
    setSelectedOrderId(order.id);
    openOrderDetail();
  };

  const openReceiptFromOrder = (order: PurchaseOrder) => {
    if (!isReceiptAllowedForOrder(order)) return;
    setActionError(null);
    setReceiptSubmitError(null);
    setReceiptWarnings([]);
    setReceiptSourceOrder(order);
    setReceiptForm(purchaseOrderToReceiptFormData(order));
    setReceiptErrors({});
    openReceiptModal();
  };

  const handleOrderSubmit = async (): Promise<boolean> => {
    const result = await runWithSubmitLock(orderSubmitLock, async () => {
      if (createOrderMutation.isPending || updateOrderMutation.isPending || orderSaveDisabled) return false;
      const errors = validatePurchaseOrderForm(orderForm, orderMode);
      setOrderErrors(errors);
      if (Object.keys(errors).length > 0) return false;
      setActionError(null);
      setOrderSubmitError(null);
      try {
        if (orderMode === "create") {
          const created = await createOrderMutation.mutateAsync(purchaseOrderFormToCreateInput(orderForm));
          setSelectedOrderId(created.id);
        } else if (editingOrder) {
          const updated = await updateOrderMutation.mutateAsync({ orderId: editingOrder.id, patch: purchaseOrderFormToUpdateInput(orderForm) });
          setSelectedOrderId(updated.id);
        }
        closeOrderModal();
        resetOrderForm();
        return true;
      } catch (error) {
        if (orderMode === "edit" && editingOrder && isRefetchAfterMutationError(error)) {
          const recovery = await recoverRejectedDraftEdit({
            error,
            orderId: editingOrder.id,
            refetchOrder: fetchPurchaseOrder,
            invalidateOrderList: () => queryClient.invalidateQueries({ queryKey: purchasingOrderQueryKeys.all }),
            invalidateOrderDetail: (orderId) => queryClient.invalidateQueries({ queryKey: purchasingOrderQueryKeys.detail(orderId) }),
          });
          if (recovery.refreshed) {
            setEditingOrder(recovery.refreshed);
            setOrderForm(purchaseOrderToFormData(recovery.refreshed));
            queryClient.setQueryData(purchasingOrderQueryKeys.detail(recovery.refreshed.id), recovery.refreshed);
          }
          setOrderSaveDisabled(recovery.saveDisabled);
          setOrderSubmitError(recovery.message);
        } else {
          setOrderSubmitError(formatPurchasingApiError(error));
        }
        return false;
      }
    });
    return result ?? false;
  };

  const handleStatusTransition = async (order: PurchaseOrderSummary, status: PurchaseOrderStatus) => {
    if (transitionMutation.isPending) return;
    setActionError(null);
    try {
      const updated = await transitionMutation.mutateAsync({ orderId: order.id, status });
      setSelectedOrderId(updated.id);
    } catch (error) {
      if (isRefetchAfterMutationError(error)) {
        await queryClient.invalidateQueries({ queryKey: purchasingOrderQueryKeys.detail(order.id) });
      }
      setActionError(formatPurchasingApiError(error));
    }
  };

  const handleReceiptSubmit = async (): Promise<boolean> => {
    const result = await runWithSubmitLock(receiptSubmitLock, async () => {
      if (createReceiptMutation.isPending) return false;
      const errors = validateGoodsReceiptForm(receiptForm);
      setReceiptErrors(errors);
      if (Object.keys(errors).length > 0) return false;
      setActionError(null);
      setReceiptSubmitError(null);
      try {
        const sourceOrderId = receiptSourceOrder?.id ?? selectedOrderId;
        const result = await createReceiptMutation.mutateAsync(goodsReceiptFormToCreateInput(receiptForm));
        await applyReceiptSuccessEffects({
          warnings: result.warnings,
          sourceOrderId,
          selectedOrderId,
          setWarnings: setReceiptWarnings,
          invalidateOrderList: () => queryClient.invalidateQueries({ queryKey: purchasingOrderQueryKeys.all }),
          invalidateOrderDetail: (orderId) => queryClient.invalidateQueries({ queryKey: purchasingOrderQueryKeys.detail(orderId) }),
          refetchSelectedOrder: () => selectedOrderQuery.refetch(),
        });
        closeReceiptModal();
        setReceiptForm(defaultGoodsReceiptFormData);
        setReceiptSourceOrder(null);
        return true;
      } catch (error) {
        setReceiptSubmitError(formatPurchasingApiError(error));
        return false;
      }
    });
    return result ?? false;
  };

  const stopRowAction = (event: MouseEvent<HTMLButtonElement>) => event.stopPropagation();

  if (!orderPermissions.READ) {
    return <Stack gap="md" p="md"><Title order={2}>Purchase Orders</Title><Alert color="red" icon={<IconAlertCircle size={16} />}>Access denied: purchasing.orders.READ is required.</Alert></Stack>;
  }

  return (
    <Stack gap="md" p="md">
      {actionError ? <Alert color="red" icon={<IconAlertCircle size={16} />} onClose={() => setActionError(null)} withCloseButton>{actionError}</Alert> : null}
      <GoodsReceiptWarningsAlert warnings={receiptWarnings} onClose={() => setReceiptWarnings([])} />
      <Group justify="space-between" align="center">
        <div><Title order={2}>Purchase Orders</Title><Text size="sm" c="dimmed">Track purchase orders from draft through receipt.</Text></div>
        {orderPermissions.CREATE ? <Button leftSection={<IconPlus size={16} />} onClick={openCreateOrder}>New purchase order</Button> : null}
      </Group>

      <Card withBorder radius="md" p="md">
        <Group align="flex-end">
          <TextInput label="Supplier ID" value={supplierFilter} onChange={(event) => { setSupplierFilter(event.currentTarget.value); setPage(1); }} style={{ minWidth: isMobile ? "100%" : 180 }} />
          <Select label="Status" value={statusFilter} data={[{ value: "", label: "All statuses" }, ...PURCHASE_ORDER_STATUSES.map((status) => ({ value: status, label: status }))]} onChange={(value) => { setStatusFilter((value ?? "") as PurchaseOrderStatus | ""); setPage(1); }} allowDeselect={false} />
          <TextInput label="Date from" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.currentTarget.value); setPage(1); }} />
          <TextInput label="Date to" type="date" value={dateTo} onChange={(event) => { setDateTo(event.currentTarget.value); setPage(1); }} />
          <Button variant="light" leftSection={<IconRefresh size={14} />} onClick={() => void ordersQuery.refetch()}>Refresh</Button>
        </Group>
      </Card>

      {ordersQuery.error ? <Alert color="red">{formatPurchasingApiError(ordersQuery.error)}</Alert> : null}
      <Card withBorder radius="md" p="md" data-testid="purchasing-orders-table">
        <Table striped highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Order</Table.Th><Table.Th>Supplier</Table.Th><Table.Th>Date</Table.Th><Table.Th>Status</Table.Th><Table.Th>Total</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {orders.map((order) => (
              <Table.Tr key={order.id} onClick={() => openOrder(order)} style={{ cursor: "pointer" }}>
                <Table.Td>{order.order_no}</Table.Td><Table.Td>{order.supplier_name ?? order.supplier_id}</Table.Td><Table.Td>{order.order_date}</Table.Td><Table.Td><Badge color={statusBadgeColor(order.status)}>{order.status}</Badge></Table.Td><Table.Td>{order.total_amount}</Table.Td>
                <Table.Td><Group gap="xs" wrap="nowrap">
                  <Button size="xs" variant="subtle" leftSection={<IconEye size={14} />} onClick={(event) => { stopRowAction(event); openOrder(order); }}>View</Button>
                  {orderPermissions.UPDATE && isDraftEditable(order) ? <Button size="xs" variant="subtle" leftSection={<IconPencil size={14} />} onClick={async (event) => { stopRowAction(event); setActionError(null); try { const detail = await fetchPurchaseOrder(order.id); openEditOrder(detail); } catch (error) { setActionError(formatPurchasingApiError(error)); } }}>Edit draft</Button> : null}
                  {orderPermissions.UPDATE ? validStatusTargets(order.status).map((target) => <Button key={target} size="xs" variant="light" onClick={(event) => { stopRowAction(event); void handleStatusTransition(order, target); }}>{target}</Button>) : null}
                </Group></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {orders.length === 0 ? <Text c="dimmed" p="md">No purchase orders found.</Text> : null}
        <Group justify="space-between" mt="md"><Text size="sm">Page {page} of {maxPage} · Total {total}</Text><Group><Button variant="light" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><Button variant="light" disabled={page >= maxPage} onClick={() => setPage((current) => current + 1)}>Next</Button></Group></Group>
      </Card>

      <PurchaseOrderDetailDrawer opened={orderDetailOpen} orderId={selectedOrderId} canUpdate={orderPermissions.UPDATE} canCreateReceipt={receiptPermissions.CREATE} onClose={closeOrderDetail} onEdit={openEditOrder} onCreateReceipt={openReceiptFromOrder} />

      <Modal opened={orderModalOpen} onClose={closeOrderModal} size="xl" title={orderMode === "create" ? "New purchase order" : "Edit draft purchase order"} withinPortal={false}>
        <PurchaseOrderReviewForm mode={orderMode} data={orderForm} errors={orderErrors} submitError={orderSubmitError} currentStatus={orderMode === "edit" ? editingOrder?.status ?? null : null} saveDisabled={orderSaveDisabled} submitting={createOrderMutation.isPending || updateOrderMutation.isPending} onChange={(patch) => setOrderForm((current) => ({ ...current, ...patch }))} onDiscard={() => { resetOrderForm(); closeOrderModal(); }} onSubmit={handleOrderSubmit} />
      </Modal>

      <Modal opened={receiptModalOpen} onClose={closeReceiptModal} size="xl" title="Create goods receipt" withinPortal={false}>
        <GoodsReceiptReviewForm data={receiptForm} errors={receiptErrors} submitError={receiptSubmitError} sourceOrder={receiptSourceOrder} submitting={createReceiptMutation.isPending} onChange={(patch) => setReceiptForm((current) => ({ ...current, ...patch }))} onDiscard={() => { setReceiptForm(defaultGoodsReceiptFormData); setReceiptErrors({}); setReceiptSubmitError(null); setReceiptSourceOrder(null); closeReceiptModal(); }} onSubmit={handleReceiptSubmit} />
      </Modal>
    </Stack>
  );
}

export function PurchasingReceiptsPage({ user }: PurchasingPageProps) {
  const isMobile = useMediaQuery("(max-width: 48em)");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedReceiptId, setSelectedReceiptId] = useState<number | null>(null);
  const [detailOpen, { open: openDetail, close: closeDetail }] = useDisclosure(false);
  const permissions = useMemo(() => actionGates(resolveEffectivePermissions(user) ?? [], "purchasing", "receipts", ["READ", "CREATE"]), [user]);
  const listParams = useMemo(() => ({ supplier_id: supplierFilter, limit: PURCHASING_RECEIPTS_DEFAULT_LIMIT, offset: pageToPurchasingOffset(page, PURCHASING_RECEIPTS_DEFAULT_LIMIT) }), [page, supplierFilter]);
  const receiptsQuery = useGoodsReceiptsQuery(listParams, { enabled: permissions.READ });
  const receipts = receiptsQuery.data?.receipts ?? [];
  const total = receiptsQuery.data?.total ?? 0;
  const maxPage = Math.max(1, Math.ceil(total / PURCHASING_RECEIPTS_DEFAULT_LIMIT));

  const openReceipt = (receipt: GoodsReceiptSummary) => {
    setSelectedReceiptId(receipt.id);
    openDetail();
  };

  if (!permissions.READ) {
    return <Stack gap="md" p="md"><Title order={2}>Goods Receipts</Title><Alert color="red" icon={<IconAlertCircle size={16} />}>Access denied: purchasing.receipts.READ is required.</Alert></Stack>;
  }

  return (
    <Stack gap="md" p="md">
      <Group justify="space-between" align="center"><div><Title order={2}>Goods Receipts</Title><Text size="sm" c="dimmed">View supplier receipts. Date filters are intentionally not exposed for this API contract slice.</Text></div>{permissions.CREATE ? <Badge color="blue">Create from Purchase Orders detail</Badge> : null}</Group>
      <Card withBorder radius="md" p="md"><Group align="flex-end"><TextInput label="Supplier ID" value={supplierFilter} onChange={(event) => { setSupplierFilter(event.currentTarget.value); setPage(1); }} style={{ minWidth: isMobile ? "100%" : 180 }} /><Button variant="light" leftSection={<IconRefresh size={14} />} onClick={() => void receiptsQuery.refetch()}>Refresh</Button></Group></Card>
      {receiptsQuery.error ? <Alert color="red">{formatPurchasingApiError(receiptsQuery.error)}</Alert> : null}
      <Card withBorder radius="md" p="md" data-testid="purchasing-receipts-table">
        <Table striped highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Reference</Table.Th><Table.Th>Supplier</Table.Th><Table.Th>Receipt date</Table.Th><Table.Th>Status</Table.Th><Table.Th>PO reference</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{receipts.map((receipt) => <Table.Tr key={receipt.id} onClick={() => openReceipt(receipt)} style={{ cursor: "pointer" }}><Table.Td>{receipt.reference_number}</Table.Td><Table.Td>{receipt.supplier_name ?? receipt.supplier_id}</Table.Td><Table.Td>{receipt.receipt_date}</Table.Td><Table.Td><Badge color="green">{receipt.status}</Badge></Table.Td><Table.Td>{receipt.po_reference ?? "—"}</Table.Td><Table.Td><Button size="xs" variant="subtle" leftSection={<IconEye size={14} />} onClick={(event) => { event.stopPropagation(); openReceipt(receipt); }}>View</Button></Table.Td></Table.Tr>)}</Table.Tbody>
        </Table>
        {receipts.length === 0 ? <Text c="dimmed" p="md">No goods receipts found.</Text> : null}
        <Group justify="space-between" mt="md"><Text size="sm">Page {page} of {maxPage} · Total {total}</Text><Group><Button variant="light" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><Button variant="light" disabled={page >= maxPage} onClick={() => setPage((current) => current + 1)}>Next</Button></Group></Group>
      </Card>
      <GoodsReceiptDetailDrawer opened={detailOpen} receiptId={selectedReceiptId} onClose={closeDetail} />
    </Stack>
  );
}

export type { GoodsReceipt, PurchaseOrder };
