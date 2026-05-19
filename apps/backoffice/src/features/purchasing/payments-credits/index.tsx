// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Alert, Badge, Button, Card, Group, Modal, Select, SimpleGrid, Stack, Table, Text, TextInput, Textarea, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertCircle, IconCheck, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useMemo, useRef, useState } from "react";

import { ReviewPanel, type ReviewPanelSection } from "@/components/ReviewPanel";
import { diffValues } from "@/lib/diff-engine";
import { actionGates, resolveEffectivePermissions } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/session";

import {
  AP_PAYMENT_STATUSES,
  PURCHASE_CREDIT_STATUSES,
  PURCHASING_PAYMENTS_CREDITS_DEFAULT_LIMIT,
  applyPurchaseCreditAndRefetch,
  createApPayment,
  createPurchaseCredit,
  fetchApPayment,
  fetchPurchaseCredit,
  pageToPaymentCreditOffset,
  postApPaymentAndRefetch,
  type ApPayment,
  type ApPaymentCreateInput,
  type ApPaymentPostCompleteResult,
  type ApPaymentStatus,
  type ApPaymentSummary,
  type ApPaymentVoidCompleteResult,
  type PurchaseCredit,
  type PurchaseCreditApplyCompleteResult,
  type PurchaseCreditCreateInput,
  type PurchaseCreditStatus,
  type PurchaseCreditSummary,
  type PurchaseCreditVoidCompleteResult,
  useApPaymentsQuery,
  useApplyPurchaseCreditMutation,
  useCreateApPaymentMutation,
  useCreatePurchaseCreditMutation,
  usePurchaseCreditsQuery,
  usePostApPaymentMutation,
  useVoidApPaymentMutation,
  useVoidPurchaseCreditMutation,
  voidApPaymentAndRefetch,
  voidPurchaseCreditAndRefetch,
} from "./api";

type FormErrors = Record<string, string>;

export interface PaymentLineFormData { purchase_invoice_id: string; allocation_amount: string; description: string; full_settlement: boolean }
export interface PaymentFormData { idempotency_key: string; payment_date: string; bank_account_id: string; supplier_id: string; description: string; lines: PaymentLineFormData[] }
export interface CreditLineFormData { purchase_invoice_id: string; purchase_invoice_line_id: string; item_id: string; description: string; qty: string; unit_price: string; reason: string }
export interface CreditFormData { supplier_id: string; idempotency_key: string; credit_no: string; credit_date: string; description: string; lines: CreditLineFormData[] }
export interface SubmitLockRef { current: boolean }

export const defaultPaymentLineFormData: PaymentLineFormData = { purchase_invoice_id: "", allocation_amount: "", description: "", full_settlement: false };
export const defaultPaymentFormData: PaymentFormData = { idempotency_key: "", payment_date: "", bank_account_id: "", supplier_id: "", description: "", lines: [{ ...defaultPaymentLineFormData }] };
export const defaultCreditLineFormData: CreditLineFormData = { purchase_invoice_id: "", purchase_invoice_line_id: "", item_id: "", description: "", qty: "", unit_price: "", reason: "" };
export const defaultCreditFormData: CreditFormData = { supplier_id: "", idempotency_key: "", credit_no: "", credit_date: "", description: "", lines: [{ ...defaultCreditLineFormData }] };

function isPositiveIntegerText(value: string): boolean {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) && Number(trimmed) > 0;
}

function isOptionalPositiveIntegerText(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || isPositiveIntegerText(trimmed);
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function isPositiveDecimal(value: string, scale = 4): boolean {
  const trimmed = value.trim();
  if (!new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`).test(trimmed)) return false;
  return Number(trimmed) > 0;
}

function optionalString(value: string): string | null | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function optionalNumber(value: string): number | null | undefined {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function compactErrors(errors: Array<string | undefined>): string[] {
  return errors.filter(Boolean) as string[];
}

export function isBackendErrorWithCode(error: unknown, status: number, code: string): boolean {
  return typeof error === "object" && error !== null && "status" in error && "code" in error && (error as { status?: unknown }).status === status && (error as { code?: unknown }).code === code;
}

export function formatPaymentCreditApiError(error: unknown): string {
  if (isBackendErrorWithCode(error, 409, "PERIOD_CLOSED")) return "PERIOD_CLOSED: Closed accounting period. This backend error is non-retryable without an approved override.";
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    const err = error as { code?: unknown; message?: unknown };
    return `${String(err.code)}: ${String(err.message)}`;
  }
  if (error instanceof Error) return error.message;
  return "UNKNOWN_ERROR: Purchasing payment/credit request failed";
}

export async function runWithPaymentCreditSubmitLock<T>(lock: SubmitLockRef, task: () => Promise<T>): Promise<T | undefined> {
  if (lock.current) return undefined;
  lock.current = true;
  try {
    return await task();
  } finally {
    lock.current = false;
  }
}

export function validatePaymentForm(data: PaymentFormData): FormErrors {
  const errors: FormErrors = {};
  if (!isDateOnly(data.payment_date)) errors.payment_date = "Payment date must be YYYY-MM-DD.";
  if (!isPositiveIntegerText(data.bank_account_id)) errors.bank_account_id = "Bank account ID is required.";
  if (!isPositiveIntegerText(data.supplier_id)) errors.supplier_id = "Supplier ID is required.";
  if (data.lines.length === 0) errors.lines = "At least one allocation line is required.";
  data.lines.forEach((line, index) => {
    const row = index + 1;
    if (!isPositiveIntegerText(line.purchase_invoice_id)) errors[`lines.${index}.purchase_invoice_id`] = `Line ${row}: purchase invoice ID is required.`;
    if (!isPositiveDecimal(line.allocation_amount)) errors[`lines.${index}.allocation_amount`] = `Line ${row}: allocation amount must be greater than zero.`;
  });
  return errors;
}

export function validateCreditForm(data: CreditFormData): FormErrors {
  const errors: FormErrors = {};
  if (!isPositiveIntegerText(data.supplier_id)) errors.supplier_id = "Supplier ID is required.";
  if (!data.credit_no.trim()) errors.credit_no = "Credit number is required.";
  if (!isDateOnly(data.credit_date)) errors.credit_date = "Credit date must be YYYY-MM-DD.";
  if (data.lines.length === 0) errors.lines = "At least one credit line is required.";
  data.lines.forEach((line, index) => {
    const row = index + 1;
    if (!isOptionalPositiveIntegerText(line.purchase_invoice_id)) errors[`credit_lines.${index}.purchase_invoice_id`] = `Line ${row}: invoice ID must be a positive integer.`;
    if (!isOptionalPositiveIntegerText(line.purchase_invoice_line_id)) errors[`credit_lines.${index}.purchase_invoice_line_id`] = `Line ${row}: invoice line ID must be a positive integer.`;
    if (!isOptionalPositiveIntegerText(line.item_id)) errors[`credit_lines.${index}.item_id`] = `Line ${row}: item ID must be a positive integer.`;
    if (!isPositiveDecimal(line.qty)) errors[`credit_lines.${index}.qty`] = `Line ${row}: quantity must be greater than zero.`;
    if (!isPositiveDecimal(line.unit_price)) errors[`credit_lines.${index}.unit_price`] = `Line ${row}: unit price must be greater than zero.`;
  });
  return errors;
}

function paymentLineToInput(line: PaymentLineFormData) {
  return { purchase_invoice_id: Number(line.purchase_invoice_id.trim()), allocation_amount: line.allocation_amount.trim(), description: optionalString(line.description), full_settlement: line.full_settlement };
}

export function paymentFormToCreateInput(data: PaymentFormData): ApPaymentCreateInput {
  return { idempotency_key: optionalUndefined(data.idempotency_key), payment_date: data.payment_date.trim(), bank_account_id: Number(data.bank_account_id.trim()), supplier_id: Number(data.supplier_id.trim()), description: optionalString(data.description), lines: data.lines.map(paymentLineToInput) };
}

function creditLineToInput(line: CreditLineFormData) {
  return { purchase_invoice_id: optionalNumber(line.purchase_invoice_id), purchase_invoice_line_id: optionalNumber(line.purchase_invoice_line_id), item_id: optionalNumber(line.item_id), description: optionalString(line.description), qty: line.qty.trim(), unit_price: line.unit_price.trim(), reason: optionalString(line.reason) };
}

export function creditFormToCreateInput(data: CreditFormData): PurchaseCreditCreateInput {
  return { supplier_id: Number(data.supplier_id.trim()), idempotency_key: optionalUndefined(data.idempotency_key), credit_no: data.credit_no.trim(), credit_date: data.credit_date.trim(), description: optionalString(data.description), lines: data.lines.map(creditLineToInput) };
}

function statusBadgeColor(status: string): string {
  if (["POSTED", "APPLIED"].includes(status)) return "green";
  if (status === "PARTIAL") return "yellow";
  if (status === "VOID") return "red";
  return "gray";
}

function DetailField(props: { label: string; value: string | number | null | undefined }) {
  return <Stack gap={2}><Text size="xs" c="dimmed" tt="uppercase">{props.label}</Text><Text size="sm">{props.value == null || props.value === "" ? "—" : props.value}</Text></Stack>;
}

function PaymentFields(props: { data: PaymentFormData; errors: FormErrors; onChange: (patch: Partial<PaymentFormData>) => void; disabled?: boolean }) {
  const updateLine = (index: number, patch: Partial<PaymentLineFormData>) => props.onChange({ lines: props.data.lines.map((line, current) => current === index ? { ...line, ...patch } : line) });
  const addLine = () => props.onChange({ lines: [...props.data.lines, { ...defaultPaymentLineFormData }] });
  return <Stack gap="md"><SimpleGrid cols={{ base: 1, sm: 2 }}><TextInput label="Payment date" type="date" value={props.data.payment_date} onChange={(event) => props.onChange({ payment_date: event.currentTarget.value })} error={props.errors.payment_date} disabled={props.disabled} required /><TextInput label="Bank account ID" value={props.data.bank_account_id} onChange={(event) => props.onChange({ bank_account_id: event.currentTarget.value })} error={props.errors.bank_account_id} disabled={props.disabled} required /><TextInput label="Supplier ID" value={props.data.supplier_id} onChange={(event) => props.onChange({ supplier_id: event.currentTarget.value })} error={props.errors.supplier_id} disabled={props.disabled} required /><TextInput label="Idempotency key" value={props.data.idempotency_key} onChange={(event) => props.onChange({ idempotency_key: event.currentTarget.value })} disabled={props.disabled} /></SimpleGrid><Textarea label="Description" value={props.data.description} onChange={(event) => props.onChange({ description: event.currentTarget.value })} disabled={props.disabled} />{props.errors.lines ? <Alert color="red">{props.errors.lines}</Alert> : null}<Group justify="space-between"><Title order={4}>Allocations</Title><Button size="xs" variant="light" onClick={addLine} disabled={props.disabled}>Add allocation</Button></Group>{props.data.lines.map((line, index) => <Card key={index} withBorder radius="sm" p="sm"><SimpleGrid cols={{ base: 1, sm: 2 }}><TextInput label="Purchase invoice ID" value={line.purchase_invoice_id} onChange={(event) => updateLine(index, { purchase_invoice_id: event.currentTarget.value })} error={props.errors[`lines.${index}.purchase_invoice_id`]} disabled={props.disabled} required /><TextInput label="Allocation amount" value={line.allocation_amount} onChange={(event) => updateLine(index, { allocation_amount: event.currentTarget.value })} error={props.errors[`lines.${index}.allocation_amount`]} disabled={props.disabled} required /><TextInput label="Line description" value={line.description} onChange={(event) => updateLine(index, { description: event.currentTarget.value })} disabled={props.disabled} /></SimpleGrid></Card>)}</Stack>;
}

function CreditFields(props: { data: CreditFormData; errors: FormErrors; onChange: (patch: Partial<CreditFormData>) => void; disabled?: boolean }) {
  const updateLine = (index: number, patch: Partial<CreditLineFormData>) => props.onChange({ lines: props.data.lines.map((line, current) => current === index ? { ...line, ...patch } : line) });
  const addLine = () => props.onChange({ lines: [...props.data.lines, { ...defaultCreditLineFormData }] });
  return <Stack gap="md"><SimpleGrid cols={{ base: 1, sm: 2 }}><TextInput label="Supplier ID" value={props.data.supplier_id} onChange={(event) => props.onChange({ supplier_id: event.currentTarget.value })} error={props.errors.supplier_id} disabled={props.disabled} required /><TextInput label="Credit number" value={props.data.credit_no} onChange={(event) => props.onChange({ credit_no: event.currentTarget.value })} error={props.errors.credit_no} disabled={props.disabled} required /><TextInput label="Credit date" type="date" value={props.data.credit_date} onChange={(event) => props.onChange({ credit_date: event.currentTarget.value })} error={props.errors.credit_date} disabled={props.disabled} required /><TextInput label="Idempotency key" value={props.data.idempotency_key} onChange={(event) => props.onChange({ idempotency_key: event.currentTarget.value })} disabled={props.disabled} /></SimpleGrid><Textarea label="Description" value={props.data.description} onChange={(event) => props.onChange({ description: event.currentTarget.value })} disabled={props.disabled} />{props.errors.lines ? <Alert color="red">{props.errors.lines}</Alert> : null}<Group justify="space-between"><Title order={4}>Credit lines</Title><Button size="xs" variant="light" onClick={addLine} disabled={props.disabled}>Add credit line</Button></Group>{props.data.lines.map((line, index) => <Card key={index} withBorder radius="sm" p="sm"><SimpleGrid cols={{ base: 1, sm: 2 }}><TextInput label="Purchase invoice ID" value={line.purchase_invoice_id} onChange={(event) => updateLine(index, { purchase_invoice_id: event.currentTarget.value })} error={props.errors[`credit_lines.${index}.purchase_invoice_id`]} disabled={props.disabled} /><TextInput label="Invoice line ID" value={line.purchase_invoice_line_id} onChange={(event) => updateLine(index, { purchase_invoice_line_id: event.currentTarget.value })} error={props.errors[`credit_lines.${index}.purchase_invoice_line_id`]} disabled={props.disabled} /><TextInput label="Item ID" value={line.item_id} onChange={(event) => updateLine(index, { item_id: event.currentTarget.value })} error={props.errors[`credit_lines.${index}.item_id`]} disabled={props.disabled} /><TextInput label="Quantity" value={line.qty} onChange={(event) => updateLine(index, { qty: event.currentTarget.value })} error={props.errors[`credit_lines.${index}.qty`]} disabled={props.disabled} required /><TextInput label="Unit price" value={line.unit_price} onChange={(event) => updateLine(index, { unit_price: event.currentTarget.value })} error={props.errors[`credit_lines.${index}.unit_price`]} disabled={props.disabled} required /><TextInput label="Reason" value={line.reason} onChange={(event) => updateLine(index, { reason: event.currentTarget.value })} disabled={props.disabled} /></SimpleGrid></Card>)}</Stack>;
}

export function PaymentCreateReviewForm(props: { data: PaymentFormData; errors: FormErrors; submitError?: string | null; savedPayment?: ApPayment | null; submitting: boolean; onChange: (patch: Partial<PaymentFormData>) => void; onDiscard: () => void; onSubmit: () => Promise<boolean> }) {
  const sections: ReviewPanelSection[] = [{ id: "payment-create", title: "Draft AP payment", description: "Review bank account, supplier, and positive invoice allocations before saving.", errors: compactErrors(Object.values(props.errors)), content: <Stack>{props.submitError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{props.submitError}</Alert> : null}{props.savedPayment ? <Alert color="green">Backend saved {props.savedPayment.status} payment {props.savedPayment.payment_no}.</Alert> : null}<PaymentFields data={props.data} errors={props.errors} onChange={props.onChange} /></Stack> }];
  return <ReviewPanel title="Create AP payment" description="AP payment create uses purchasing.payments.CREATE. Backend open amounts and allocation validation are authoritative." sections={sections} summaryItems={[{ label: "Supplier ID", value: props.data.supplier_id || "—" }, { label: "Allocations", value: props.data.lines.length }]} scopeBadges={[{ label: "Resource", value: "purchasing.payments" }]} saveLabel="Create draft payment" submitting={props.submitting} onDiscardDraft={props.onDiscard} onSubmit={() => { void props.onSubmit(); }} />;
}

export function CreditCreateReviewForm(props: { data: CreditFormData; errors: FormErrors; submitError?: string | null; savedCredit?: PurchaseCredit | null; submitting: boolean; onChange: (patch: Partial<CreditFormData>) => void; onDiscard: () => void; onSubmit: () => Promise<boolean> }) {
  const sections: ReviewPanelSection[] = [{ id: "credit-create", title: "Draft supplier credit", description: "Review supplier, credit date, and positive line amounts before saving.", errors: compactErrors(Object.values(props.errors)), content: <Stack>{props.submitError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{props.submitError}</Alert> : null}{props.savedCredit ? <Alert color="green">Backend saved {props.savedCredit.status} credit remaining {props.savedCredit.remaining_amount}.</Alert> : null}<CreditFields data={props.data} errors={props.errors} onChange={props.onChange} /></Stack> }];
  return <ReviewPanel title="Create supplier credit" description="Supplier credit create uses purchasing.credits.CREATE. Backend totals and applicability are authoritative." sections={sections} summaryItems={[{ label: "Supplier ID", value: props.data.supplier_id || "—" }, { label: "Lines", value: props.data.lines.length }]} scopeBadges={[{ label: "Resource", value: "purchasing.credits" }]} saveLabel="Create draft credit" submitting={props.submitting} onDiscardDraft={props.onDiscard} onSubmit={() => { void props.onSubmit(); }} />;
}

export function PaymentPostReviewForm(props: { payment: ApPayment; overrideReason: string; submitError?: string | null; trace?: ApPaymentPostCompleteResult | null; submitting: boolean; onOverrideReasonChange: (value: string) => void; onDiscard: () => void; onSubmit: () => Promise<boolean> }) {
  const sections: ReviewPanelSection[] = [{ id: "payment-post", title: "Post AP payment", description: "Final review before backend creates accounting journal effects.", content: <Stack>{props.submitError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{props.submitError}</Alert> : null}{props.trace ? <Alert color="green">Journal batch {props.trace.partial.journal_batch_id} created. Payment detail was refetched.</Alert> : null}<SimpleGrid cols={{ base: 1, sm: 2 }}><DetailField label="Payment" value={props.payment.payment_no} /><DetailField label="Status" value={props.payment.status} /><DetailField label="Supplier" value={props.payment.supplier_name ?? props.payment.supplier_id} /><DetailField label="Allocations" value={props.payment.lines.length} /></SimpleGrid><Textarea label="Override reason (only if backend requires it)" value={props.overrideReason} onChange={(event) => props.onOverrideReasonChange(event.currentTarget.value)} /></Stack> }];
  return <ReviewPanel title="Post AP payment" description="Post uses purchasing.payments.UPDATE and refetches backend payment detail plus affected invoice/open-amount sources before final display." sections={sections} summaryItems={[{ label: "Payment", value: props.payment.payment_no }]} scopeBadges={[{ label: "Resource", value: "purchasing.payments" }]} saveLabel="Post payment" submitting={props.submitting} onDiscardDraft={props.onDiscard} onSubmit={() => { void props.onSubmit(); }} />;
}

export function PaymentVoidReviewForm(props: { payment: ApPayment; overrideReason: string; submitError?: string | null; trace?: ApPaymentVoidCompleteResult | null; submitting: boolean; onOverrideReasonChange: (value: string) => void; onDiscard: () => void; onSubmit: () => Promise<boolean> }) {
  const diffChanges = diffValues({ status: props.payment.status, journal_batch_id: props.payment.journal_batch_id }, { status: "VOID", journal_batch_id: props.payment.journal_batch_id });
  const sections: ReviewPanelSection[] = [{ id: "payment-void", title: "Void AP payment", description: "Review before/after status change. Backend creates reversal accounting effects.", content: <Stack>{props.submitError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{props.submitError}</Alert> : null}{props.trace ? <Alert color="green">Reversal batch {props.trace.partial.reversal_batch_id} created. Payment detail was refetched.</Alert> : null}<Textarea label="Override reason (only if backend requires it)" value={props.overrideReason} onChange={(event) => props.onOverrideReasonChange(event.currentTarget.value)} /><Alert color="blue">No distinct void_reason is submitted because current AP payment APIs support only optional override_reason.</Alert></Stack> }];
  return <ReviewPanel title="Void AP payment" description="Void uses purchasing.payments.DELETE and refetches backend payment detail plus affected invoice/open-amount sources before final display." sections={sections} diffChanges={diffChanges} summaryItems={[{ label: "Payment", value: props.payment.payment_no }, { label: "Current status", value: props.payment.status }]} scopeBadges={[{ label: "Resource", value: "purchasing.payments" }]} saveLabel="Void payment" submitting={props.submitting} onDiscardDraft={props.onDiscard} onSubmit={() => { void props.onSubmit(); }} />;
}

export function CreditApplyReviewForm(props: { credit: PurchaseCredit; overrideReason: string; submitError?: string | null; trace?: PurchaseCreditApplyCompleteResult | null; submitting: boolean; onOverrideReasonChange: (value: string) => void; onDiscard: () => void; onSubmit: () => Promise<boolean> }) {
  const sections: ReviewPanelSection[] = [{ id: "credit-apply", title: "Apply supplier credit", description: "Final review before backend applies credit and creates journal effects.", content: <Stack>{props.submitError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{props.submitError}</Alert> : null}{props.trace ? <Alert color="green">Journal batch {props.trace.partial.journal_batch_id} created. Remaining credit {props.trace.partial.remaining_amount}.</Alert> : null}<SimpleGrid cols={{ base: 1, sm: 2 }}><DetailField label="Credit" value={props.credit.credit_no} /><DetailField label="Status" value={props.credit.status} /><DetailField label="Remaining" value={props.credit.remaining_amount} /><DetailField label="Applications" value={props.credit.applications.length} /></SimpleGrid><Textarea label="Override reason (only if backend requires it)" value={props.overrideReason} onChange={(event) => props.onOverrideReasonChange(event.currentTarget.value)} /></Stack> }];
  return <ReviewPanel title="Apply supplier credit" description="Apply uses purchasing.credits.UPDATE and refetches backend credit detail plus affected invoice/open-amount sources before final display." sections={sections} summaryItems={[{ label: "Credit", value: props.credit.credit_no }]} scopeBadges={[{ label: "Resource", value: "purchasing.credits" }]} saveLabel="Apply credit" submitting={props.submitting} onDiscardDraft={props.onDiscard} onSubmit={() => { void props.onSubmit(); }} />;
}

export function CreditVoidReviewForm(props: { credit: PurchaseCredit; overrideReason: string; submitError?: string | null; trace?: PurchaseCreditVoidCompleteResult | null; submitting: boolean; onOverrideReasonChange: (value: string) => void; onDiscard: () => void; onSubmit: () => Promise<boolean> }) {
  const diffChanges = diffValues({ status: props.credit.status, journal_batch_id: props.credit.journal_batch_id }, { status: "VOID", journal_batch_id: props.credit.journal_batch_id });
  const sections: ReviewPanelSection[] = [{ id: "credit-void", title: "Void supplier credit", description: "Review before/after status change. Backend creates reversal accounting effects when applicable.", content: <Stack>{props.submitError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{props.submitError}</Alert> : null}{props.trace ? <Alert color="green">Reversal batch {props.trace.partial.reversal_batch_id ?? "not required"} returned. Credit detail was refetched.</Alert> : null}<Textarea label="Override reason (only if backend requires it)" value={props.overrideReason} onChange={(event) => props.onOverrideReasonChange(event.currentTarget.value)} /><Alert color="blue">No distinct void_reason is submitted because current supplier credit APIs support only optional override_reason.</Alert></Stack> }];
  return <ReviewPanel title="Void supplier credit" description="Void uses purchasing.credits.DELETE and refetches backend credit detail plus affected invoice/open-amount sources before final display." sections={sections} diffChanges={diffChanges} summaryItems={[{ label: "Credit", value: props.credit.credit_no }, { label: "Current status", value: props.credit.status }]} scopeBadges={[{ label: "Resource", value: "purchasing.credits" }]} saveLabel="Void credit" submitting={props.submitting} onDiscardDraft={props.onDiscard} onSubmit={() => { void props.onSubmit(); }} />;
}

export function PurchasingPaymentsCreditsPage({ user }: { user: SessionUser }) {
  const [supplierFilter, setSupplierFilter] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<ApPaymentStatus | "">("");
  const [creditStatus, setCreditStatus] = useState<PurchaseCreditStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page] = useState(1);
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>(defaultPaymentFormData);
  const [creditForm, setCreditForm] = useState<CreditFormData>(defaultCreditFormData);
  const [paymentErrors, setPaymentErrors] = useState<FormErrors>({});
  const [creditErrors, setCreditErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<ApPayment | null>(null);
  const [selectedCredit, setSelectedCredit] = useState<PurchaseCredit | null>(null);
  const [paymentTrace, setPaymentTrace] = useState<ApPaymentPostCompleteResult | ApPaymentVoidCompleteResult | null>(null);
  const [creditTrace, setCreditTrace] = useState<PurchaseCreditApplyCompleteResult | PurchaseCreditVoidCompleteResult | null>(null);
  const [paymentCreateOpen, { open: openPaymentCreate, close: closePaymentCreate }] = useDisclosure(false);
  const [creditCreateOpen, { open: openCreditCreate, close: closeCreditCreate }] = useDisclosure(false);
  const [paymentPostOpen, { open: openPaymentPost, close: closePaymentPost }] = useDisclosure(false);
  const [paymentVoidOpen, { open: openPaymentVoid, close: closePaymentVoid }] = useDisclosure(false);
  const [creditApplyOpen, { open: openCreditApply, close: closeCreditApply }] = useDisclosure(false);
  const [creditVoidOpen, { open: openCreditVoid, close: closeCreditVoid }] = useDisclosure(false);
  const lock = useRef(false);

  const paymentPermissions = useMemo(() => actionGates(resolveEffectivePermissions(user) ?? [], "purchasing", "payments", ["READ", "CREATE", "UPDATE", "DELETE"]), [user]);
  const creditPermissions = useMemo(() => actionGates(resolveEffectivePermissions(user) ?? [], "purchasing", "credits", ["READ", "CREATE", "UPDATE", "DELETE"]), [user]);
  const baseParams = { supplier_id: supplierFilter, date_from: dateFrom, date_to: dateTo, limit: PURCHASING_PAYMENTS_CREDITS_DEFAULT_LIMIT, offset: pageToPaymentCreditOffset(page, PURCHASING_PAYMENTS_CREDITS_DEFAULT_LIMIT) };
  const paymentsQuery = useApPaymentsQuery({ ...baseParams, status: paymentStatus }, { enabled: paymentPermissions.READ });
  const creditsQuery = usePurchaseCreditsQuery({ ...baseParams, status: creditStatus }, { enabled: creditPermissions.READ });
  const createPaymentMutation = useCreateApPaymentMutation();
  const postPaymentMutation = usePostApPaymentMutation();
  const voidPaymentMutation = useVoidApPaymentMutation();
  const createCreditMutation = useCreatePurchaseCreditMutation();
  const applyCreditMutation = useApplyPurchaseCreditMutation();
  const voidCreditMutation = useVoidPurchaseCreditMutation();

  const handlePaymentCreate = async () => (await runWithPaymentCreditSubmitLock(lock, async () => { const errors = validatePaymentForm(paymentForm); setPaymentErrors(errors); if (Object.keys(errors).length) return false; try { setSubmitError(null); await createPaymentMutation.mutateAsync(paymentFormToCreateInput(paymentForm)); closePaymentCreate(); return true; } catch (error) { setSubmitError(formatPaymentCreditApiError(error)); return false; } })) ?? false;
  const handleCreditCreate = async () => (await runWithPaymentCreditSubmitLock(lock, async () => { const errors = validateCreditForm(creditForm); setCreditErrors(errors); if (Object.keys(errors).length) return false; try { setSubmitError(null); await createCreditMutation.mutateAsync(creditFormToCreateInput(creditForm)); closeCreditCreate(); return true; } catch (error) { setSubmitError(formatPaymentCreditApiError(error)); return false; } })) ?? false;
  const handlePaymentPost = async () => (await runWithPaymentCreditSubmitLock(lock, async () => { if (!selectedPayment) return false; try { setSubmitError(null); const result = await postPaymentMutation.mutateAsync({ paymentId: selectedPayment.id, overrideReason }); setPaymentTrace(result); setSelectedPayment(result.payment); return true; } catch (error) { setSubmitError(formatPaymentCreditApiError(error)); return false; } })) ?? false;
  const handlePaymentVoid = async () => (await runWithPaymentCreditSubmitLock(lock, async () => { if (!selectedPayment) return false; try { setSubmitError(null); const result = await voidPaymentMutation.mutateAsync({ paymentId: selectedPayment.id, overrideReason }); setPaymentTrace(result); setSelectedPayment(result.payment); return true; } catch (error) { setSubmitError(formatPaymentCreditApiError(error)); return false; } })) ?? false;
  const handleCreditApply = async () => (await runWithPaymentCreditSubmitLock(lock, async () => { if (!selectedCredit) return false; try { setSubmitError(null); const result = await applyCreditMutation.mutateAsync({ creditId: selectedCredit.id, overrideReason }); setCreditTrace(result); setSelectedCredit(result.credit); return true; } catch (error) { setSubmitError(formatPaymentCreditApiError(error)); return false; } })) ?? false;
  const handleCreditVoid = async () => (await runWithPaymentCreditSubmitLock(lock, async () => { if (!selectedCredit) return false; try { setSubmitError(null); const result = await voidCreditMutation.mutateAsync({ creditId: selectedCredit.id, overrideReason }); setCreditTrace(result); setSelectedCredit(result.credit); return true; } catch (error) { setSubmitError(formatPaymentCreditApiError(error)); return false; } })) ?? false;

  if (!paymentPermissions.READ && !creditPermissions.READ) return <Stack p="md"><Title order={2}>AP Payments & Supplier Credits</Title><Alert color="red" icon={<IconAlertCircle size={16} />}>Access denied: purchasing.payments.READ or purchasing.credits.READ is required.</Alert></Stack>;

  return <Stack gap="md" p="md"><Group justify="space-between"><div><Title order={2}>AP Payments & Supplier Credits</Title><Text size="sm" c="dimmed">Pay supplier invoices, apply credits, and void through review-backed accounting flows.</Text></div><Group>{paymentPermissions.CREATE ? <Button leftSection={<IconPlus size={16} />} onClick={openPaymentCreate}>New AP payment</Button> : null}{creditPermissions.CREATE ? <Button leftSection={<IconPlus size={16} />} onClick={openCreditCreate}>New supplier credit</Button> : null}</Group></Group><Alert color="blue">Audit deep-links are unavailable until payment/credit APIs expose a verified audit identifier. Journal batch and reversal batch IDs are shown as accounting trace references.</Alert>{paymentTrace ? <Alert color="green">Payment trace updated after backend detail and invoice/open-amount source refetch.</Alert> : null}{creditTrace ? <Alert color="green">Credit trace updated after backend detail and invoice/open-amount source refetch.</Alert> : null}<Card withBorder><Group align="flex-end"><TextInput label="Supplier ID" value={supplierFilter} onChange={(event) => setSupplierFilter(event.currentTarget.value)} /><TextInput label="Date from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.currentTarget.value)} /><TextInput label="Date to" type="date" value={dateTo} onChange={(event) => setDateTo(event.currentTarget.value)} /><Button variant="light" leftSection={<IconRefresh size={14} />} onClick={() => { void paymentsQuery.refetch(); void creditsQuery.refetch(); }}>Refresh</Button></Group></Card>{paymentsQuery.error ? <Alert color="red">{formatPaymentCreditApiError(paymentsQuery.error)}</Alert> : null}{creditsQuery.error ? <Alert color="red">{formatPaymentCreditApiError(creditsQuery.error)}</Alert> : null}{paymentPermissions.READ ? <Card withBorder data-testid="ap-payments-table"><Stack><Group justify="space-between"><Title order={3}>AP Payments</Title><Select label="Payment status" value={paymentStatus} data={[{ value: "", label: "All payment statuses" }, ...AP_PAYMENT_STATUSES.map((status) => ({ value: status, label: status }))]} onChange={(value) => setPaymentStatus((value ?? "") as ApPaymentStatus | "")} allowDeselect={false} /></Group><Table><Table.Thead><Table.Tr><Table.Th>Payment</Table.Th><Table.Th>Supplier</Table.Th><Table.Th>Status</Table.Th><Table.Th>Trace</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{(paymentsQuery.data?.payments ?? []).map((payment: ApPaymentSummary) => <Table.Tr key={payment.id}><Table.Td>{payment.payment_no}</Table.Td><Table.Td>{payment.supplier_name ?? payment.supplier_id}</Table.Td><Table.Td><Badge color={statusBadgeColor(payment.status)}>{payment.status}</Badge></Table.Td><Table.Td>{payment.journal_batch_id ? `Journal ${payment.journal_batch_id}` : "—"}</Table.Td><Table.Td><Group gap="xs">{paymentPermissions.UPDATE && payment.status === "DRAFT" ? <Button size="xs" leftSection={<IconCheck size={14} />} onClick={async () => { setSubmitError(null); try { setSelectedPayment(await fetchApPayment(payment.id)); setOverrideReason(""); openPaymentPost(); } catch (error) { setSubmitError(formatPaymentCreditApiError(error)); } }}>Post</Button> : null}{paymentPermissions.DELETE && payment.status === "POSTED" ? <Button size="xs" color="red" leftSection={<IconTrash size={14} />} onClick={async () => { setSubmitError(null); try { setSelectedPayment(await fetchApPayment(payment.id)); setOverrideReason(""); openPaymentVoid(); } catch (error) { setSubmitError(formatPaymentCreditApiError(error)); } }}>Void</Button> : null}</Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></Stack></Card> : null}{creditPermissions.READ ? <Card withBorder data-testid="purchase-credits-table"><Stack><Group justify="space-between"><Title order={3}>Supplier Credits</Title><Select label="Credit status" value={creditStatus} data={[{ value: "", label: "All credit statuses" }, ...PURCHASE_CREDIT_STATUSES.map((status) => ({ value: status, label: status }))]} onChange={(value) => setCreditStatus((value ?? "") as PurchaseCreditStatus | "")} allowDeselect={false} /></Group><Table><Table.Thead><Table.Tr><Table.Th>Credit</Table.Th><Table.Th>Supplier</Table.Th><Table.Th>Status</Table.Th><Table.Th>Remaining</Table.Th><Table.Th>Trace</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{(creditsQuery.data?.credits ?? []).map((credit: PurchaseCreditSummary) => <Table.Tr key={credit.id}><Table.Td>{credit.credit_no}</Table.Td><Table.Td>{credit.supplier_name ?? credit.supplier_id}</Table.Td><Table.Td><Badge color={statusBadgeColor(credit.status)}>{credit.status}</Badge></Table.Td><Table.Td>{credit.remaining_amount}</Table.Td><Table.Td>{credit.journal_batch_id ? `Journal ${credit.journal_batch_id}` : "—"}</Table.Td><Table.Td><Group gap="xs">{creditPermissions.UPDATE && ["DRAFT", "PARTIAL"].includes(credit.status) ? <Button size="xs" leftSection={<IconCheck size={14} />} onClick={async () => { setSubmitError(null); try { setSelectedCredit(await fetchPurchaseCredit(credit.id)); setOverrideReason(""); openCreditApply(); } catch (error) { setSubmitError(formatPaymentCreditApiError(error)); } }}>Apply</Button> : null}{creditPermissions.DELETE && credit.status !== "VOID" ? <Button size="xs" color="red" leftSection={<IconTrash size={14} />} onClick={async () => { setSubmitError(null); try { setSelectedCredit(await fetchPurchaseCredit(credit.id)); setOverrideReason(""); openCreditVoid(); } catch (error) { setSubmitError(formatPaymentCreditApiError(error)); } }}>Void</Button> : null}</Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></Stack></Card> : null}<Modal opened={paymentCreateOpen} onClose={closePaymentCreate} title="New AP payment" size="xl" withinPortal={false}><PaymentCreateReviewForm data={paymentForm} errors={paymentErrors} submitError={submitError} submitting={createPaymentMutation.isPending} onChange={(patch) => setPaymentForm((current) => ({ ...current, ...patch }))} onDiscard={closePaymentCreate} onSubmit={handlePaymentCreate} /></Modal><Modal opened={creditCreateOpen} onClose={closeCreditCreate} title="New supplier credit" size="xl" withinPortal={false}><CreditCreateReviewForm data={creditForm} errors={creditErrors} submitError={submitError} submitting={createCreditMutation.isPending} onChange={(patch) => setCreditForm((current) => ({ ...current, ...patch }))} onDiscard={closeCreditCreate} onSubmit={handleCreditCreate} /></Modal><Modal opened={paymentPostOpen} onClose={closePaymentPost} title="Post AP payment" size="xl" withinPortal={false}>{selectedPayment ? <PaymentPostReviewForm payment={selectedPayment} overrideReason={overrideReason} submitError={submitError} trace={paymentTrace as ApPaymentPostCompleteResult | null} submitting={postPaymentMutation.isPending} onOverrideReasonChange={setOverrideReason} onDiscard={closePaymentPost} onSubmit={handlePaymentPost} /> : null}</Modal><Modal opened={paymentVoidOpen} onClose={closePaymentVoid} title="Void AP payment" size="xl" withinPortal={false}>{selectedPayment ? <PaymentVoidReviewForm payment={selectedPayment} overrideReason={overrideReason} submitError={submitError} trace={paymentTrace as ApPaymentVoidCompleteResult | null} submitting={voidPaymentMutation.isPending} onOverrideReasonChange={setOverrideReason} onDiscard={closePaymentVoid} onSubmit={handlePaymentVoid} /> : null}</Modal><Modal opened={creditApplyOpen} onClose={closeCreditApply} title="Apply supplier credit" size="xl" withinPortal={false}>{selectedCredit ? <CreditApplyReviewForm credit={selectedCredit} overrideReason={overrideReason} submitError={submitError} trace={creditTrace as PurchaseCreditApplyCompleteResult | null} submitting={applyCreditMutation.isPending} onOverrideReasonChange={setOverrideReason} onDiscard={closeCreditApply} onSubmit={handleCreditApply} /> : null}</Modal><Modal opened={creditVoidOpen} onClose={closeCreditVoid} title="Void supplier credit" size="xl" withinPortal={false}>{selectedCredit ? <CreditVoidReviewForm credit={selectedCredit} overrideReason={overrideReason} submitError={submitError} trace={creditTrace as PurchaseCreditVoidCompleteResult | null} submitting={voidCreditMutation.isPending} onOverrideReasonChange={setOverrideReason} onDiscard={closeCreditVoid} onSubmit={handleCreditVoid} /> : null}</Modal></Stack>;
}

export { createApPayment, createPurchaseCredit, postApPaymentAndRefetch, applyPurchaseCreditAndRefetch, voidApPaymentAndRefetch, voidPurchaseCreditAndRefetch };
export type { ApPayment, ApPaymentSummary, PurchaseCredit, PurchaseCreditSummary };
