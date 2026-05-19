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
import { IconAlertCircle, IconCheck, IconEye, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type MouseEvent } from "react";

import { ReviewPanel, type ReviewPanelSection } from "@/components/ReviewPanel";
import { diffValues } from "@/lib/diff-engine";
import { actionGates, resolveEffectivePermissions } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/session";

import {
  PURCHASE_INVOICE_STATUSES,
  PURCHASING_INVOICES_DEFAULT_LIMIT,
  createPurchaseInvoice,
  fetchPurchaseInvoice,
  pageToPurchaseInvoiceOffset,
  postPurchaseInvoiceAndRefetch,
  purchaseInvoiceQueryKeys,
  type PurchaseInvoice,
  type PurchaseInvoiceCreateInput,
  type PurchaseInvoiceLineInput,
  type PurchaseInvoiceStatus,
  type PurchaseInvoiceSummary,
  type PurchaseInvoicePostCompleteResult,
  type PurchaseInvoiceVoidCompleteResult,
  useCreatePurchaseInvoiceMutation,
  usePostPurchaseInvoiceMutation,
  usePurchaseInvoiceQuery,
  usePurchaseInvoicesQuery,
  useVoidPurchaseInvoiceMutation,
  voidPurchaseInvoiceAndRefetch,
} from "./api";

type FormErrors = Record<string, string>;

interface PurchasingInvoicesPageProps {
  user: SessionUser;
}

export interface InvoiceLineFormData {
  item_id: string;
  po_line_id: string;
  description: string;
  qty: string;
  unit_price: string;
  tax_rate_id: string;
  line_type: "ITEM" | "SERVICE" | "FREIGHT" | "TAX" | "DISCOUNT";
}

export interface InvoiceFormData {
  supplier_id: string;
  idempotency_key: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  reference_number: string;
  currency_code: string;
  exchange_rate: string;
  notes: string;
  lines: InvoiceLineFormData[];
}

export interface SubmitLockRef {
  current: boolean;
}

export const defaultInvoiceLineFormData: InvoiceLineFormData = {
  item_id: "",
  po_line_id: "",
  description: "",
  qty: "",
  unit_price: "",
  tax_rate_id: "",
  line_type: "SERVICE",
};

export const defaultInvoiceFormData: InvoiceFormData = {
  supplier_id: "",
  idempotency_key: "",
  invoice_no: "",
  invoice_date: "",
  due_date: "",
  reference_number: "",
  currency_code: "IDR",
  exchange_rate: "1.00000000",
  notes: "",
  lines: [{ ...defaultInvoiceLineFormData }],
};

function optionalString(value: string): string | null | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalNumber(value: string): number | null | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Number(trimmed) : null;
}

function isPositiveIntegerText(value: string): boolean {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) && Number(trimmed) > 0;
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function isPositiveDecimal(value: string, scale = 4): boolean {
  const trimmed = value.trim();
  if (!new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`).test(trimmed)) return false;
  return Number(trimmed) > 0;
}

function isOptionalPositiveIntegerText(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || isPositiveIntegerText(trimmed);
}

function compactErrors(errors: Array<string | undefined>): string[] {
  return errors.filter(Boolean) as string[];
}

export function isBackendErrorWithCode(error: unknown, status: number, code: string): boolean {
  return typeof error === "object" && error !== null &&
    "status" in error && "code" in error &&
    (error as { status?: unknown }).status === status &&
    (error as { code?: unknown }).code === code;
}

export function formatInvoiceApiError(error: unknown): string {
  if (isBackendErrorWithCode(error, 409, "PERIOD_CLOSED")) return "PERIOD_CLOSED: Closed accounting period. This backend error is non-retryable without an approved override.";
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    const err = error as { code?: unknown; message?: unknown };
    return `${String(err.code)}: ${String(err.message)}`;
  }
  if (error instanceof Error) return error.message;
  return "UNKNOWN_ERROR: Purchase invoice request failed";
}

export async function runWithInvoiceSubmitLock<T>(lock: SubmitLockRef, task: () => Promise<T>): Promise<T | undefined> {
  if (lock.current) return undefined;
  lock.current = true;
  try {
    return await task();
  } finally {
    lock.current = false;
  }
}

export function validateInvoiceForm(data: InvoiceFormData): FormErrors {
  const errors: FormErrors = {};
  if (!isPositiveIntegerText(data.supplier_id)) errors.supplier_id = "Supplier ID is required.";
  if (!data.invoice_no.trim()) errors.invoice_no = "Invoice number is required.";
  if (!isDateOnly(data.invoice_date)) errors.invoice_date = "Invoice date must be YYYY-MM-DD.";
  if (data.due_date.trim() && !isDateOnly(data.due_date)) errors.due_date = "Due date must be YYYY-MM-DD.";
  if (!/^[A-Z]{3}$/.test(data.currency_code.trim().toUpperCase())) errors.currency_code = "Currency must be a 3-letter ISO code.";
  if (!isPositiveDecimal(data.exchange_rate, 8)) errors.exchange_rate = "Exchange rate must be greater than zero.";
  if (data.lines.length === 0) errors.lines = "At least one invoice line is required.";

  data.lines.forEach((line, index) => {
    const row = index + 1;
    if (!isOptionalPositiveIntegerText(line.item_id)) errors[`lines.${index}.item_id`] = `Line ${row}: item ID must be a positive integer.`;
    if (!isOptionalPositiveIntegerText(line.po_line_id)) errors[`lines.${index}.po_line_id`] = `Line ${row}: PO line ID must be a positive integer.`;
    if (!isOptionalPositiveIntegerText(line.tax_rate_id)) errors[`lines.${index}.tax_rate_id`] = `Line ${row}: tax rate ID must be a positive integer.`;
    if (!line.description.trim()) errors[`lines.${index}.description`] = `Line ${row}: description is required.`;
    if (!isPositiveDecimal(line.qty)) errors[`lines.${index}.qty`] = `Line ${row}: quantity must be greater than zero.`;
    if (!isPositiveDecimal(line.unit_price)) errors[`lines.${index}.unit_price`] = `Line ${row}: unit price must be greater than zero.`;
  });
  return errors;
}

function invoiceLineFormToInput(line: InvoiceLineFormData): PurchaseInvoiceLineInput {
  return {
    item_id: optionalNumber(line.item_id),
    po_line_id: optionalNumber(line.po_line_id),
    description: line.description.trim(),
    qty: line.qty.trim(),
    unit_price: line.unit_price.trim(),
    tax_rate_id: optionalNumber(line.tax_rate_id),
    line_type: line.line_type,
  };
}

export function invoiceFormToCreateInput(data: InvoiceFormData): PurchaseInvoiceCreateInput {
  return {
    supplier_id: Number(data.supplier_id.trim()),
    idempotency_key: optionalUndefined(data.idempotency_key),
    invoice_no: data.invoice_no.trim(),
    invoice_date: data.invoice_date.trim(),
    due_date: optionalString(data.due_date),
    reference_number: optionalString(data.reference_number),
    currency_code: data.currency_code.trim().toUpperCase() || "IDR",
    exchange_rate: data.exchange_rate.trim() || "1.00000000",
    notes: optionalString(data.notes),
    lines: data.lines.map(invoiceLineFormToInput),
  };
}

function statusBadgeColor(status: PurchaseInvoiceStatus | string): string {
  switch (status) {
    case "DRAFT": return "gray";
    case "POSTED": return "green";
    case "VOID": return "red";
    default: return "gray";
  }
}

function DetailField(props: { label: string; value: string | number | null | undefined }) {
  return <Stack gap={2}><Text size="xs" c="dimmed" tt="uppercase">{props.label}</Text><Text size="sm">{props.value == null || props.value === "" ? "—" : props.value}</Text></Stack>;
}

function InvoiceFields(props: { data: InvoiceFormData; errors: FormErrors; onChange: (patch: Partial<InvoiceFormData>) => void; disabled?: boolean }) {
  const updateLine = (index: number, patch: Partial<InvoiceLineFormData>) => props.onChange({ lines: props.data.lines.map((line, currentIndex) => currentIndex === index ? { ...line, ...patch } : line) });
  const addLine = () => props.onChange({ lines: [...props.data.lines, { ...defaultInvoiceLineFormData }] });
  const removeLine = (index: number) => props.onChange({ lines: props.data.lines.filter((_, currentIndex) => currentIndex !== index) });

  return <Stack gap="md">
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      <TextInput label="Supplier ID" value={props.data.supplier_id} onChange={(event) => props.onChange({ supplier_id: event.currentTarget.value })} error={props.errors.supplier_id} disabled={props.disabled} required />
      <TextInput label="Invoice number" value={props.data.invoice_no} onChange={(event) => props.onChange({ invoice_no: event.currentTarget.value })} error={props.errors.invoice_no} disabled={props.disabled} required />
      <TextInput label="Invoice date" type="date" value={props.data.invoice_date} onChange={(event) => props.onChange({ invoice_date: event.currentTarget.value })} error={props.errors.invoice_date} disabled={props.disabled} required />
      <TextInput label="Due date" type="date" value={props.data.due_date} onChange={(event) => props.onChange({ due_date: event.currentTarget.value })} error={props.errors.due_date} disabled={props.disabled} />
      <TextInput label="Reference number" value={props.data.reference_number} onChange={(event) => props.onChange({ reference_number: event.currentTarget.value })} disabled={props.disabled} />
      <TextInput label="Currency" value={props.data.currency_code} onChange={(event) => props.onChange({ currency_code: event.currentTarget.value.toUpperCase() })} error={props.errors.currency_code} disabled={props.disabled} />
      <TextInput label="Exchange rate" value={props.data.exchange_rate} onChange={(event) => props.onChange({ exchange_rate: event.currentTarget.value })} error={props.errors.exchange_rate} disabled={props.disabled} />
      <TextInput label="Idempotency key" value={props.data.idempotency_key} onChange={(event) => props.onChange({ idempotency_key: event.currentTarget.value })} disabled={props.disabled} />
    </SimpleGrid>
    <Textarea label="Notes" minRows={3} value={props.data.notes} onChange={(event) => props.onChange({ notes: event.currentTarget.value })} disabled={props.disabled} />
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between"><Title order={4}>Invoice lines</Title><Button size="xs" variant="light" onClick={addLine} disabled={props.disabled}>Add line</Button></Group>
        {props.errors.lines ? <Alert color="red">{props.errors.lines}</Alert> : null}
        {props.data.lines.map((line, index) => <Card key={index} withBorder radius="sm" p="sm"><Stack gap="xs">
          <Group justify="space-between"><Text fw={600}>Line {index + 1}</Text>{props.data.lines.length > 1 ? <Button size="xs" variant="subtle" color="red" onClick={() => removeLine(index)} disabled={props.disabled}>Remove</Button> : null}</Group>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput label="Item ID" value={line.item_id} onChange={(event) => updateLine(index, { item_id: event.currentTarget.value })} error={props.errors[`lines.${index}.item_id`]} disabled={props.disabled} />
            <TextInput label="PO line ID" value={line.po_line_id} onChange={(event) => updateLine(index, { po_line_id: event.currentTarget.value })} error={props.errors[`lines.${index}.po_line_id`]} disabled={props.disabled} />
            <TextInput label="Description" value={line.description} onChange={(event) => updateLine(index, { description: event.currentTarget.value })} error={props.errors[`lines.${index}.description`]} disabled={props.disabled} required />
            <TextInput label="Quantity" value={line.qty} onChange={(event) => updateLine(index, { qty: event.currentTarget.value })} error={props.errors[`lines.${index}.qty`]} disabled={props.disabled} required />
            <TextInput label="Unit price" value={line.unit_price} onChange={(event) => updateLine(index, { unit_price: event.currentTarget.value })} error={props.errors[`lines.${index}.unit_price`]} disabled={props.disabled} required />
            <TextInput label="Tax rate ID" value={line.tax_rate_id} onChange={(event) => updateLine(index, { tax_rate_id: event.currentTarget.value })} error={props.errors[`lines.${index}.tax_rate_id`]} disabled={props.disabled} />
            <Select label="Line type" value={line.line_type} data={["ITEM", "SERVICE", "FREIGHT", "TAX", "DISCOUNT"]} onChange={(value) => updateLine(index, { line_type: (value ?? "SERVICE") as InvoiceLineFormData["line_type"] })} allowDeselect={false} disabled={props.disabled} />
          </SimpleGrid>
        </Stack></Card>)}
      </Stack>
    </Card>
  </Stack>;
}

export function InvoiceCreateReviewForm(props: { data: InvoiceFormData; errors: FormErrors; submitError?: string | null; savedInvoice?: PurchaseInvoice | null; submitting: boolean; onChange: (patch: Partial<InvoiceFormData>) => void; onDiscard: () => void; onSubmit: () => Promise<boolean> }) {
  const sections: ReviewPanelSection[] = [{
    id: "invoice-create",
    title: "Draft invoice",
    description: "Review supplier, invoice dates, and positive line quantities/prices before saving.",
    errors: compactErrors(Object.values(props.errors)),
    content: <Stack gap="md">{props.submitError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{props.submitError}</Alert> : null}{props.savedInvoice ? <Alert color="green">Backend saved {props.savedInvoice.status} invoice total {props.savedInvoice.grand_total}.</Alert> : null}<InvoiceFields data={props.data} errors={props.errors} onChange={props.onChange} /></Stack>,
  }];
  return <ReviewPanel title="Create AP invoice" description="AP invoice create uses purchasing.invoices.CREATE. Backend totals and status are authoritative." sections={sections} summaryItems={[{ label: "Supplier ID", value: props.data.supplier_id || "—" }, { label: "Lines", value: props.data.lines.length }]} scopeBadges={[{ label: "Resource", value: "purchasing.invoices" }]} saveLabel="Create draft invoice" submitting={props.submitting} onDiscardDraft={props.onDiscard} onSubmit={() => { void props.onSubmit(); }} />;
}

export function InvoicePostReviewForm(props: { invoice: PurchaseInvoice; overrideReason: string; submitError?: string | null; trace?: PurchaseInvoicePostCompleteResult | null; submitting: boolean; onOverrideReasonChange: (value: string) => void; onDiscard: () => void; onSubmit: () => Promise<boolean> }) {
  const sections: ReviewPanelSection[] = [{
    id: "invoice-post",
    title: "Post AP invoice",
    description: "Final review before the backend creates accounting journal effects.",
    content: <Stack gap="md">{props.submitError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{props.submitError}</Alert> : null}{props.trace ? <Alert color="green">Journal batch {props.trace.partial.journal_batch_id} created. {props.trace.partial.warnings.length ? `Warnings: ${props.trace.partial.warnings.join(" ")}` : "No posting warnings."}</Alert> : null}<SimpleGrid cols={{ base: 1, sm: 2 }}><DetailField label="Invoice" value={props.invoice.invoice_no} /><DetailField label="Backend status" value={props.invoice.status} /><DetailField label="Supplier" value={props.invoice.supplier_name ?? props.invoice.supplier_id} /><DetailField label="Backend total" value={props.invoice.grand_total} /></SimpleGrid><Textarea label="Override reason (only if backend requires it)" value={props.overrideReason} onChange={(event) => props.onOverrideReasonChange(event.currentTarget.value)} minRows={3} /></Stack>,
  }];
  return <ReviewPanel title="Post AP invoice" description="Post uses purchasing.invoices.UPDATE and refetches backend invoice detail before final status/totals display." sections={sections} summaryItems={[{ label: "Invoice", value: props.invoice.invoice_no }, { label: "Total", value: props.invoice.grand_total }]} scopeBadges={[{ label: "Resource", value: "purchasing.invoices" }]} saveLabel="Post invoice" submitting={props.submitting} onDiscardDraft={props.onDiscard} onSubmit={() => { void props.onSubmit(); }} />;
}

export function InvoiceVoidReviewForm(props: { invoice: PurchaseInvoice; overrideReason: string; submitError?: string | null; trace?: PurchaseInvoiceVoidCompleteResult | null; submitting: boolean; onOverrideReasonChange: (value: string) => void; onDiscard: () => void; onSubmit: () => Promise<boolean> }) {
  const diffChanges = diffValues({ status: props.invoice.status, journal_batch_id: props.invoice.journal_batch_id, grand_total: props.invoice.grand_total }, { status: "VOID", journal_batch_id: props.invoice.journal_batch_id, grand_total: props.invoice.grand_total }, { moneyFields: ["grand_total"] });
  const sections: ReviewPanelSection[] = [{
    id: "invoice-void",
    title: "Void AP invoice",
    description: "Review before/after status change. The backend creates reversal accounting effects.",
    content: <Stack gap="md">{props.submitError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{props.submitError}</Alert> : null}{props.trace ? <Alert color="green">Reversal batch {props.trace.partial.reversal_batch_id} created.</Alert> : null}<SimpleGrid cols={{ base: 1, sm: 2 }}><DetailField label="Before status" value={props.invoice.status} /><DetailField label="After status" value="VOID" /><DetailField label="Invoice" value={props.invoice.invoice_no} /><DetailField label="Backend total" value={props.invoice.grand_total} /></SimpleGrid><Textarea label="Override reason (only if backend requires it)" value={props.overrideReason} onChange={(event) => props.onOverrideReasonChange(event.currentTarget.value)} minRows={3} /><Alert color="blue">No distinct void reason is submitted because the current invoice API supports only optional override_reason.</Alert></Stack>,
  }];
  return <ReviewPanel title="Void AP invoice" description="Void uses purchasing.invoices.DELETE and refetches backend invoice detail before final VOID display." sections={sections} diffChanges={diffChanges} summaryItems={[{ label: "Invoice", value: props.invoice.invoice_no }, { label: "Current status", value: props.invoice.status }]} scopeBadges={[{ label: "Resource", value: "purchasing.invoices" }]} saveLabel="Void invoice" submitting={props.submitting} onDiscardDraft={props.onDiscard} onSubmit={() => { void props.onSubmit(); }} />;
}

export function InvoiceDetailDrawer(props: { opened: boolean; invoiceId: number | null; canPost: boolean; canVoid: boolean; onClose: () => void; onPost: (invoice: PurchaseInvoice) => void; onVoid: (invoice: PurchaseInvoice) => void }) {
  const invoiceQuery = usePurchaseInvoiceQuery(props.invoiceId);
  const invoice = invoiceQuery.data;
  return <Drawer opened={props.opened} onClose={props.onClose} title="AP invoice detail" position="right" size="xl" withinPortal={false}><Stack gap="md">
    {invoiceQuery.error ? <Alert color="red">{formatInvoiceApiError(invoiceQuery.error)}</Alert> : null}
    {invoiceQuery.isLoading ? <Text c="dimmed">Loading AP invoice…</Text> : null}
    {invoice ? <>
      <Card withBorder radius="md" p="md"><Stack gap="md"><Group justify="space-between"><Title order={3}>{invoice.invoice_no}</Title><Badge color={statusBadgeColor(invoice.status)}>{invoice.status}</Badge></Group><SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md"><DetailField label="Supplier ID" value={invoice.supplier_id} /><DetailField label="Supplier" value={invoice.supplier_name} /><DetailField label="Invoice date" value={invoice.invoice_date} /><DetailField label="Due date" value={invoice.due_date} /><DetailField label="Currency" value={invoice.currency_code} /><DetailField label="Backend total" value={invoice.grand_total} /><DetailField label="Journal batch" value={invoice.journal_batch_id} /><DetailField label="Posted at" value={invoice.posted_at} /><DetailField label="Voided at" value={invoice.voided_at} /></SimpleGrid><DetailField label="Notes" value={invoice.notes} /><Alert color="blue">Audit deep-links are not shown because current AP invoice APIs expose no verified audit identifier. Use journal batch and reversal batch references as accounting trace IDs.</Alert><Group>{props.canPost && invoice.status === "DRAFT" ? <Button leftSection={<IconCheck size={14} />} onClick={() => props.onPost(invoice)}>Post invoice</Button> : null}{props.canVoid && invoice.status === "POSTED" ? <Button color="red" leftSection={<IconTrash size={14} />} onClick={() => props.onVoid(invoice)}>Void invoice</Button> : null}</Group></Stack></Card>
      <Card withBorder radius="md" p="md"><Stack gap="sm"><Title order={4}>Lines</Title><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>#</Table.Th><Table.Th>Type</Table.Th><Table.Th>Item</Table.Th><Table.Th>PO line</Table.Th><Table.Th>Description</Table.Th><Table.Th>Qty</Table.Th><Table.Th>Unit price</Table.Th><Table.Th>Total</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{invoice.lines.map((line) => <Table.Tr key={line.id}><Table.Td>{line.line_no}</Table.Td><Table.Td>{line.line_type}</Table.Td><Table.Td>{line.item_id ?? "—"}</Table.Td><Table.Td>{line.po_line_id ?? "—"}</Table.Td><Table.Td>{line.description}</Table.Td><Table.Td>{line.qty}</Table.Td><Table.Td>{line.unit_price}</Table.Td><Table.Td>{line.line_total}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Stack></Card>
    </> : null}
  </Stack></Drawer>;
}

export function PurchasingInvoicesPage({ user }: PurchasingInvoicesPageProps) {
  const isMobile = useMediaQuery("(max-width: 48em)");
  const queryClient = useQueryClient();
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseInvoiceStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [selectedActionInvoice, setSelectedActionInvoice] = useState<PurchaseInvoice | null>(null);
  const [detailOpen, { open: openDetail, close: closeDetail }] = useDisclosure(false);
  const [createOpen, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [postOpen, { open: openPost, close: closePost }] = useDisclosure(false);
  const [voidOpen, { open: openVoid, close: closeVoid }] = useDisclosure(false);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceFormData>(defaultInvoiceFormData);
  const [invoiceErrors, setInvoiceErrors] = useState<FormErrors>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [savedInvoice, setSavedInvoice] = useState<PurchaseInvoice | null>(null);
  const [postTrace, setPostTrace] = useState<PurchaseInvoicePostCompleteResult | null>(null);
  const [voidTrace, setVoidTrace] = useState<PurchaseInvoiceVoidCompleteResult | null>(null);
  const createLock = useRef(false);
  const postLock = useRef(false);
  const voidLock = useRef(false);

  const permissions = useMemo(() => actionGates(resolveEffectivePermissions(user) ?? [], "purchasing", "invoices", ["READ", "CREATE", "UPDATE", "DELETE"]), [user]);
  const listParams = useMemo(() => ({ supplier_id: supplierFilter, status: statusFilter, date_from: dateFrom, date_to: dateTo, limit: PURCHASING_INVOICES_DEFAULT_LIMIT, offset: pageToPurchaseInvoiceOffset(page, PURCHASING_INVOICES_DEFAULT_LIMIT) }), [dateFrom, dateTo, page, statusFilter, supplierFilter]);
  const invoicesQuery = usePurchaseInvoicesQuery(listParams, { enabled: permissions.READ });
  const createMutation = useCreatePurchaseInvoiceMutation();
  const postMutation = usePostPurchaseInvoiceMutation();
  const voidMutation = useVoidPurchaseInvoiceMutation();
  const invoices = invoicesQuery.data?.invoices ?? [];
  const total = invoicesQuery.data?.total ?? 0;
  const maxPage = Math.max(1, Math.ceil(total / PURCHASING_INVOICES_DEFAULT_LIMIT));

  const resetCreateForm = () => { setInvoiceForm(defaultInvoiceFormData); setInvoiceErrors({}); setCreateError(null); setSavedInvoice(null); };
  const openCreateInvoice = () => { resetCreateForm(); openCreate(); };
  const openInvoice = (invoice: PurchaseInvoiceSummary) => { setSelectedInvoiceId(invoice.id); openDetail(); };
  const openPostReview = (invoice: PurchaseInvoice) => { setSelectedActionInvoice(invoice); setOverrideReason(""); setPostError(null); setPostTrace(null); openPost(); };
  const openVoidReview = (invoice: PurchaseInvoice) => { setSelectedActionInvoice(invoice); setOverrideReason(""); setVoidError(null); setVoidTrace(null); openVoid(); };
  const stopRowAction = (event: MouseEvent<HTMLButtonElement>) => event.stopPropagation();

  const handleCreateSubmit = async (): Promise<boolean> => (await runWithInvoiceSubmitLock(createLock, async () => {
    if (createMutation.isPending) return false;
    const errors = validateInvoiceForm(invoiceForm);
    setInvoiceErrors(errors);
    if (Object.keys(errors).length > 0) return false;
    setCreateError(null);
    try {
      const created = await createMutation.mutateAsync(invoiceFormToCreateInput(invoiceForm));
      const detail = await fetchPurchaseInvoice(created.id);
      queryClient.setQueryData(purchaseInvoiceQueryKeys.detail(detail.id), detail);
      await queryClient.invalidateQueries({ queryKey: purchaseInvoiceQueryKeys.all });
      setSelectedInvoiceId(detail.id);
      setSavedInvoice(detail);
      closeCreate();
      resetCreateForm();
      openDetail();
      return true;
    } catch (error) {
      setCreateError(formatInvoiceApiError(error));
      return false;
    }
  })) ?? false;

  const handlePostSubmit = async (): Promise<boolean> => (await runWithInvoiceSubmitLock(postLock, async () => {
    if (!selectedActionInvoice || postMutation.isPending) return false;
    setPostError(null);
    try {
      const result = await postMutation.mutateAsync({ invoiceId: selectedActionInvoice.id, overrideReason });
      setPostTrace(result);
      setSelectedInvoiceId(result.invoice.id);
      setSelectedActionInvoice(result.invoice);
      await queryClient.invalidateQueries({ queryKey: purchaseInvoiceQueryKeys.all });
      return true;
    } catch (error) {
      setPostError(formatInvoiceApiError(error));
      return false;
    }
  })) ?? false;

  const handleVoidSubmit = async (): Promise<boolean> => (await runWithInvoiceSubmitLock(voidLock, async () => {
    if (!selectedActionInvoice || voidMutation.isPending) return false;
    setVoidError(null);
    try {
      const result = await voidMutation.mutateAsync({ invoiceId: selectedActionInvoice.id, overrideReason });
      setVoidTrace(result);
      setSelectedInvoiceId(result.invoice.id);
      setSelectedActionInvoice(result.invoice);
      await queryClient.invalidateQueries({ queryKey: purchaseInvoiceQueryKeys.all });
      return true;
    } catch (error) {
      setVoidError(formatInvoiceApiError(error));
      return false;
    }
  })) ?? false;

  if (!permissions.READ) return <Stack gap="md" p="md"><Title order={2}>AP Invoices</Title><Alert color="red" icon={<IconAlertCircle size={16} />}>Access denied: purchasing.invoices.READ is required.</Alert></Stack>;

  return <Stack gap="md" p="md">
    {postTrace ? <Alert color="green" onClose={() => setPostTrace(null)} withCloseButton>Journal batch {postTrace.partial.journal_batch_id} created. {postTrace.partial.warnings.length ? `Warnings: ${postTrace.partial.warnings.join(" ")}` : "No posting warnings."}</Alert> : null}
    {voidTrace ? <Alert color="green" onClose={() => setVoidTrace(null)} withCloseButton>Reversal batch {voidTrace.partial.reversal_batch_id} created.</Alert> : null}
    <Group justify="space-between" align="center"><div><Title order={2}>AP Invoices</Title><Text size="sm" c="dimmed">Create draft AP invoices, post journal-backed obligations, and void via reversal flow.</Text></div>{permissions.CREATE ? <Button leftSection={<IconPlus size={16} />} onClick={openCreateInvoice}>New AP invoice</Button> : null}</Group>
    <Alert color="blue">Audit deep-links are unavailable until invoice APIs expose a verified audit identifier. Journal batch and reversal batch IDs are shown as accounting trace references.</Alert>
    {postError && !postOpen ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{postError}</Alert> : null}
    {voidError && !voidOpen ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{voidError}</Alert> : null}
    <Card withBorder radius="md" p="md"><Group align="flex-end"><TextInput label="Supplier ID" value={supplierFilter} onChange={(event) => { setSupplierFilter(event.currentTarget.value); setPage(1); }} style={{ minWidth: isMobile ? "100%" : 180 }} /><Select label="Status" value={statusFilter} data={[{ value: "", label: "All statuses" }, ...PURCHASE_INVOICE_STATUSES.map((status) => ({ value: status, label: status }))]} onChange={(value) => { setStatusFilter((value ?? "") as PurchaseInvoiceStatus | ""); setPage(1); }} allowDeselect={false} /><TextInput label="Date from" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.currentTarget.value); setPage(1); }} /><TextInput label="Date to" type="date" value={dateTo} onChange={(event) => { setDateTo(event.currentTarget.value); setPage(1); }} /><Button variant="light" leftSection={<IconRefresh size={14} />} onClick={() => void invoicesQuery.refetch()}>Refresh</Button></Group></Card>
    {invoicesQuery.error ? <Alert color="red">{formatInvoiceApiError(invoicesQuery.error)}</Alert> : null}
    <Card withBorder radius="md" p="md" data-testid="purchasing-invoices-table"><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Supplier</Table.Th><Table.Th>Date</Table.Th><Table.Th>Status</Table.Th><Table.Th>Total</Table.Th><Table.Th>Trace</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{invoices.map((invoice) => <Table.Tr key={invoice.id} onClick={() => openInvoice(invoice)} style={{ cursor: "pointer" }}><Table.Td>{invoice.invoice_no}</Table.Td><Table.Td>{invoice.supplier_name ?? invoice.supplier_id}</Table.Td><Table.Td>{invoice.invoice_date}</Table.Td><Table.Td><Badge color={statusBadgeColor(invoice.status)}>{invoice.status}</Badge></Table.Td><Table.Td>{invoice.grand_total}</Table.Td><Table.Td>{invoice.journal_batch_id ? `Journal ${invoice.journal_batch_id}` : "—"}</Table.Td><Table.Td><Group gap="xs" wrap="nowrap"><Button size="xs" variant="subtle" leftSection={<IconEye size={14} />} onClick={(event) => { stopRowAction(event); openInvoice(invoice); }}>View</Button>{permissions.UPDATE && invoice.status === "DRAFT" ? <Button size="xs" variant="light" onClick={async (event) => { stopRowAction(event); setPostError(null); try { openPostReview(await fetchPurchaseInvoice(invoice.id)); } catch (error) { setPostError(formatInvoiceApiError(error)); } }}>Post</Button> : null}{permissions.DELETE && invoice.status === "POSTED" ? <Button size="xs" variant="light" color="red" onClick={async (event) => { stopRowAction(event); setVoidError(null); try { openVoidReview(await fetchPurchaseInvoice(invoice.id)); } catch (error) { setVoidError(formatInvoiceApiError(error)); } }}>Void</Button> : null}</Group></Table.Td></Table.Tr>)}</Table.Tbody></Table>{invoices.length === 0 ? <Text c="dimmed" p="md">No AP invoices found.</Text> : null}<Group justify="space-between" mt="md"><Text size="sm">Page {page} of {maxPage} · Total {total}</Text><Group><Button variant="light" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><Button variant="light" disabled={page >= maxPage} onClick={() => setPage((current) => current + 1)}>Next</Button></Group></Group></Card>
    <InvoiceDetailDrawer opened={detailOpen} invoiceId={selectedInvoiceId} canPost={permissions.UPDATE} canVoid={permissions.DELETE} onClose={closeDetail} onPost={openPostReview} onVoid={openVoidReview} />
    <Modal opened={createOpen} onClose={closeCreate} size="xl" title="New AP invoice" withinPortal={false}><InvoiceCreateReviewForm data={invoiceForm} errors={invoiceErrors} submitError={createError} savedInvoice={savedInvoice} submitting={createMutation.isPending} onChange={(patch) => setInvoiceForm((current) => ({ ...current, ...patch }))} onDiscard={() => { resetCreateForm(); closeCreate(); }} onSubmit={handleCreateSubmit} /></Modal>
    <Modal opened={postOpen} onClose={closePost} size="xl" title="Post AP invoice" withinPortal={false}>{selectedActionInvoice ? <InvoicePostReviewForm invoice={selectedActionInvoice} overrideReason={overrideReason} submitError={postError} trace={postTrace} submitting={postMutation.isPending} onOverrideReasonChange={setOverrideReason} onDiscard={() => { setPostError(null); closePost(); }} onSubmit={handlePostSubmit} /> : null}</Modal>
    <Modal opened={voidOpen} onClose={closeVoid} size="xl" title="Void AP invoice" withinPortal={false}>{selectedActionInvoice ? <InvoiceVoidReviewForm invoice={selectedActionInvoice} overrideReason={overrideReason} submitError={voidError} trace={voidTrace} submitting={voidMutation.isPending} onOverrideReasonChange={setOverrideReason} onDiscard={() => { setVoidError(null); closeVoid(); }} onSubmit={handleVoidSubmit} /> : null}</Modal>
  </Stack>;
}

export { createPurchaseInvoice, postPurchaseInvoiceAndRefetch, voidPurchaseInvoiceAndRefetch };
export type { PurchaseInvoice, PurchaseInvoiceSummary };
