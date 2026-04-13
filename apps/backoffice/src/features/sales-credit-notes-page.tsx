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
  Textarea
} from "@mantine/core";
import {
  IconPlus,
  IconTrash,
  IconCheck,
  IconX,
  IconEdit,
  IconDotsVertical,
  IconAlertCircle,
  IconReceipt,
  IconCalendar,
  IconEye
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import type { SessionUser } from "../lib/session";

// ============================================================================
// Types
// ============================================================================

type CreditNoteStatus = "DRAFT" | "POSTED" | "VOID";

type CreditNoteLine = {
  id: number;
  credit_note_id: number;
  line_no: number;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

type CreditNote = {
  id: number;
  company_id: number;
  outlet_id: number;
  customer_id: number | null;
  invoice_id: number;
  credit_note_no: string;
  credit_note_date: string;
  client_ref: string | null;
  status: CreditNoteStatus;
  reason: string | null;
  notes: string | null;
  amount: number;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  posted_by_user_id: number | null;
  posted_at: string | null;
  voided_by_user_id: number | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
  lines: CreditNoteLine[];
};

type CreditNotesListResponse = {
  success: true;
  data: { total: number; creditNotes: CreditNote[] };
};

type CreditNoteDetailResponse = {
  success: true;
  data: CreditNote;
};

type CreditNoteLineDraft = {
  description: string;
  qty: string;
  unit_price: string;
};

type CreditNoteDraft = {
  customer_id?: string;
  invoice_id: string;
  credit_note_date: string;
  amount: string;
  reason: string;
  notes: string;
  lines: CreditNoteLineDraft[];
};

type CreditNoteEditDraft = CreditNoteDraft & {
  id: number;
};

// ============================================================================
// Helpers
// ============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatDateOnly(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID");
}

function getTodayDateOnlyLocal(): string {
  const today = new Date();
  const y = today.getFullYear();
  const mo = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function getStatusBadgeColor(status: CreditNoteStatus): string {
  switch (status) {
    case "POSTED":
      return "green";
    case "DRAFT":
      return "blue";
    case "VOID":
      return "red";
    default:
      return "gray";
  }
}

function calcLineTotal(line: CreditNoteLineDraft): number {
  const qty = Number(line.qty) || 0;
  const price = Number(line.unit_price) || 0;
  return Math.round(qty * price * 100) / 100;
}

function calcDraftTotal(lines: CreditNoteLineDraft[]): number {
  return lines.reduce((sum, line) => sum + calcLineTotal(line), 0);
}

// ============================================================================
// Component Props
// ============================================================================

type SalesCreditNotesPageProps = {
  user: SessionUser;
  accessToken: string;
};

// ============================================================================
// Default draft values
// ============================================================================

const emptyLineDraft: CreditNoteLineDraft = {
  description: "",
  qty: "1",
  unit_price: "0"
};

function makeDefaultDraft(): CreditNoteDraft {
  return {
    customer_id: "",
    invoice_id: "",
    credit_note_date: getTodayDateOnlyLocal(),
    amount: "0",
    reason: "",
    notes: "",
    lines: [{ ...emptyLineDraft }]
  };
}

// ============================================================================
// Main Page Component
// ============================================================================

export function SalesCreditNotesPage(props: SalesCreditNotesPageProps) {
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [creditNotesTotal, setCreditNotesTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ color: "green" | "yellow" | "blue"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [selectedOutletId, setSelectedOutletId] = useState<number>(
    props.user.outlets[0]?.id ?? 0
  );

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFromFilter, setDateFromFilter] = useState<string>("");
  const [dateToFilter, setDateToFilter] = useState<string>("");

  // Modes: list | create | edit | detail
  type ViewMode = "list" | "create" | "edit" | "detail";
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [newCreditNote, setNewCreditNote] = useState<CreditNoteDraft>(makeDefaultDraft);
  const [editingCreditNote, setEditingCreditNote] = useState<CreditNoteEditDraft | null>(null);
  const [detailCreditNote, setDetailCreditNote] = useState<CreditNote | null>(null);

  // Confirmation dialogs
  const [confirmAction, setConfirmAction] = useState<{
    type: "post" | "void";
    creditNoteId: number;
  } | null>(null);

  // Void reason input
  const [voidReason, setVoidReason] = useState<string>("");

  // Online status
  const isOnline = useOnlineStatus();

  // Customers for dropdown
  const [customers, setCustomers] = useState<Array<{ id: number; name: string }>>([]);

  const outletOptions = props.user.outlets.map((outlet) => ({
    value: String(outlet.id),
    label: outlet.name
  }));

  // ============================================================================
  // Data fetching
  // ============================================================================

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

      const response = await apiRequest<CreditNotesListResponse>(
        `/sales/credit-notes?${params.toString()}`,
        {},
        props.accessToken
      );
      setCreditNotes(response.data.creditNotes);
      setCreditNotesTotal(response.data.total);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load credit notes");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedOutletId > 0) {
      refreshData(selectedOutletId).catch(console.error);
    }
  }, [selectedOutletId, statusFilter, dateFromFilter, dateToFilter]);

  // Fetch customers for dropdown
  useEffect(() => {
    if (!isOnline) return;
    apiRequest<{ data: Array<{ id: number; name: string }> }>(
      `/customers?company_id=${props.user.company_id}`,
      {},
      props.accessToken
    ).then((response) => setCustomers(response.data)).catch(() => {
      // Silently fail - customers are optional
    });
  }, [isOnline, props.user.company_id, props.accessToken]);

  // ============================================================================
  // Validation
  // ============================================================================

  function validateDraft(draft: CreditNoteDraft): string | null {
    if (!draft.invoice_id.trim() || isNaN(Number(draft.invoice_id)) || Number(draft.invoice_id) <= 0) {
      return "Invoice ID is required and must be a positive number";
    }
    if (!draft.credit_note_date.trim()) {
      return "Credit note date is required";
    }
    if (draft.lines.length === 0) {
      return "At least one line item is required";
    }
    for (const line of draft.lines) {
      if (!line.description.trim()) {
        return "All lines must have a description";
      }
      if (Number(line.qty) <= 0) {
        return "All lines must have a positive quantity";
      }
      if (Number(line.unit_price) < 0) {
        return "Unit price cannot be negative";
      }
    }
    return null;
  }

  // ============================================================================
  // Create
  // ============================================================================

  async function createCreditNote() {
    const validationError = validateDraft(newCreditNote);
    if (validationError) {
      setError(validationError);
      return;
    }

    const calculatedTotal = calcDraftTotal(newCreditNote.lines);

    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        outlet_id: selectedOutletId,
        invoice_id: Number(newCreditNote.invoice_id),
        customer_id: newCreditNote.customer_id ? Number(newCreditNote.customer_id) : undefined,
        credit_note_date: newCreditNote.credit_note_date,
        amount: calculatedTotal,
        lines: newCreditNote.lines.map((line) => ({
          description: line.description.trim(),
          qty: Number(line.qty),
          unit_price: Number(line.unit_price)
        }))
      };

      if (newCreditNote.reason.trim()) {
        payload.reason = newCreditNote.reason.trim();
      }
      if (newCreditNote.notes.trim()) {
        payload.notes = newCreditNote.notes.trim();
      }

      await apiRequest(
        "/sales/credit-notes",
        { method: "POST", body: JSON.stringify(payload) },
        props.accessToken
      );

      setNewCreditNote(makeDefaultDraft());
      setViewMode("list");
      setNotice({ color: "green", message: "Credit note created successfully." });
      await refreshData(selectedOutletId);
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create credit note");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ============================================================================
  // Load for edit/detail
  // ============================================================================

  async function loadCreditNoteForEdit(creditNoteId: number) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<CreditNoteDetailResponse>(
        `/sales/credit-notes/${creditNoteId}`,
        {},
        props.accessToken
      );
      const cn = response.data;
      setEditingCreditNote({
        id: cn.id,
        customer_id: cn.customer_id ? String(cn.customer_id) : "",
        invoice_id: String(cn.invoice_id),
        credit_note_date: cn.credit_note_date,
        amount: String(cn.amount),
        reason: cn.reason ?? "",
        notes: cn.notes ?? "",
        lines: cn.lines.map((line) => ({
          description: line.description,
          qty: String(line.qty),
          unit_price: String(line.unit_price)
        }))
      });
      setViewMode("edit");
    } catch (loadError) {
      if (loadError instanceof ApiError) {
        setError(loadError.message);
      } else {
        setError("Failed to load credit note");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function loadCreditNoteDetail(creditNoteId: number) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<CreditNoteDetailResponse>(
        `/sales/credit-notes/${creditNoteId}`,
        {},
        props.accessToken
      );
      setDetailCreditNote(response.data);
      setViewMode("detail");
    } catch (loadError) {
      if (loadError instanceof ApiError) {
        setError(loadError.message);
      } else {
        setError("Failed to load credit note");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ============================================================================
  // Update
  // ============================================================================

  async function saveCreditNoteEdit() {
    if (!editingCreditNote) return;

    const validationError = validateDraft(editingCreditNote);
    if (validationError) {
      setError(validationError);
      return;
    }

    const calculatedTotal = calcDraftTotal(editingCreditNote.lines);

    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        customer_id: editingCreditNote.customer_id ? Number(editingCreditNote.customer_id) : undefined,
        credit_note_date: editingCreditNote.credit_note_date,
        amount: calculatedTotal,
        lines: editingCreditNote.lines.map((line) => ({
          description: line.description.trim(),
          qty: Number(line.qty),
          unit_price: Number(line.unit_price)
        }))
      };

      if (editingCreditNote.reason.trim()) {
        payload.reason = editingCreditNote.reason.trim();
      }
      if (editingCreditNote.notes.trim()) {
        payload.notes = editingCreditNote.notes.trim();
      }

      await apiRequest(
        `/sales/credit-notes/${editingCreditNote.id}`,
        { method: "PATCH", body: JSON.stringify(payload) },
        props.accessToken
      );

      setEditingCreditNote(null);
      setViewMode("list");
      setNotice({ color: "green", message: "Credit note updated successfully." });
      await refreshData(selectedOutletId);
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      } else {
        setError("Failed to update credit note");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ============================================================================
  // Post / Void
  // ============================================================================

  async function postCreditNoteById(creditNoteId: number) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(
        `/sales/credit-notes/${creditNoteId}/post`,
        { method: "POST" },
        props.accessToken
      );
      setNotice({ color: "green", message: "Credit note posted to GL successfully." });
      await refreshData(selectedOutletId);
      // If in detail view, reload detail
      if (viewMode === "detail" && detailCreditNote?.id === creditNoteId) {
        await loadCreditNoteDetail(creditNoteId);
      }
    } catch (postError) {
      if (postError instanceof ApiError) {
        setError(postError.message);
      } else {
        setError("Failed to post credit note");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function voidCreditNoteById(creditNoteId: number, reason: string) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(
        `/sales/credit-notes/${creditNoteId}/void`,
        {
          method: "POST",
          body: JSON.stringify({ reason })
        },
        props.accessToken
      );
      setNotice({ color: "yellow", message: "Credit note voided successfully." });
      await refreshData(selectedOutletId);
      // If in detail view, reload detail
      if (viewMode === "detail" && detailCreditNote?.id === creditNoteId) {
        await loadCreditNoteDetail(creditNoteId);
      }
    } catch (voidError) {
      if (voidError instanceof ApiError) {
        setError(voidError.message);
      } else {
        setError("Failed to void credit note");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handlePostClick(creditNoteId: number) {
    setConfirmAction({ type: "post", creditNoteId });
  }

  function handleVoidClick(creditNoteId: number) {
    setVoidReason("");
    setConfirmAction({ type: "void", creditNoteId });
  }

  async function executeConfirmedAction() {
    if (!confirmAction) return;

    if (confirmAction.type === "post") {
      await postCreditNoteById(confirmAction.creditNoteId);
    } else {
      await voidCreditNoteById(confirmAction.creditNoteId, voidReason);
    }
    setConfirmAction(null);
    setVoidReason("");
  }

  // ============================================================================
  // KPIs
  // ============================================================================

  const totalDraftAmount = useMemo(() => {
    return creditNotes
      .filter((cn) => cn.status === "DRAFT")
      .reduce((sum, cn) => sum + cn.amount, 0);
  }, [creditNotes]);

  const totalPostedAmount = useMemo(() => {
    return creditNotes
      .filter((cn) => cn.status === "POSTED")
      .reduce((sum, cn) => sum + cn.amount, 0);
  }, [creditNotes]);

  // ============================================================================
  // Form renderer
  // ============================================================================

  const renderCreditNoteForm = (
    draft: CreditNoteDraft,
    setDraft: React.Dispatch<React.SetStateAction<CreditNoteDraft>>,
    onSubmit: () => void,
    onCancel: () => void,
    isEdit = false,
    editId?: number
  ) => {
    const calculatedTotal = calcDraftTotal(draft.lines);

    return (
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={4}>
              {isEdit ? `Edit Credit Note #${editId}` : "Create New Credit Note"}
            </Title>
            <Button variant="subtle" color="gray" onClick={onCancel} size="sm">
              Cancel
            </Button>
          </Group>

          <Divider />

          <Grid>
            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <NumberInput
                label="Invoice ID"
                placeholder="Enter invoice ID"
                description="The invoice this credit note applies to"
                value={draft.invoice_id ? Number(draft.invoice_id) : undefined}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, invoice_id: value ? String(value) : "" }))
                }
                min={1}
                hideControls
                required
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <Select
                label="Customer"
                placeholder="Select customer"
                data={customers.map((c) => ({ value: String(c.id), label: c.name }))}
                value={draft.customer_id}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, customer_id: value || "" }))
                }
                searchable
                clearable
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <TextInput
                label="Credit Note Date"
                type="date"
                value={draft.credit_note_date}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, credit_note_date: e.target.value }))
                }
                required
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <TextInput
                label="Reason"
                placeholder="Reason for credit note (optional)"
                value={draft.reason}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, reason: e.target.value }))
                }
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <Textarea
                label="Notes"
                placeholder="Additional notes (optional)"
                value={draft.notes}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, notes: e.target.value }))
                }
                rows={2}
              />
            </Grid.Col>
          </Grid>

          <Divider label="Line Items" labelPosition="left" />

          <Stack gap="xs">
            {draft.lines.map((line, index) => (
              <Grid key={`line-${index}`} align="flex-start" gutter="xs">
                <Grid.Col span={{ base: 12, sm: 5 }}>
                  <TextInput
                    label={index === 0 ? "Description" : undefined}
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        lines: prev.lines.map((entry, lineIndex) =>
                          lineIndex === index ? { ...entry, description: e.target.value } : entry
                        )
                      }))
                    }
                    size="sm"
                    required
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 2 }}>
                  <NumberInput
                    label={index === 0 ? "Qty" : undefined}
                    placeholder="Qty"
                    value={Number(line.qty) || 0}
                    onChange={(value) =>
                      setDraft((prev) => ({
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
                <Grid.Col span={{ base: 6, sm: 3 }}>
                  <NumberInput
                    label={index === 0 ? "Unit Price" : undefined}
                    placeholder="Unit Price"
                    value={Number(line.unit_price) || 0}
                    onChange={(value) =>
                      setDraft((prev) => ({
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
                <Grid.Col span={{ base: 6, sm: 1 }}>
                  <Text size="sm" fw={500} mt={index === 0 ? 24 : 0} c="dimmed">
                    {formatCurrency(calcLineTotal(line))}
                  </Text>
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 1 }}>
                  {draft.lines.length > 1 && (
                    <ActionIcon
                      color="red"
                      variant="light"
                      onClick={() =>
                        setDraft((prev) => ({
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
              setDraft((prev) => ({
                ...prev,
                lines: [...prev.lines, { ...emptyLineDraft }]
              }))
            }
            size="sm"
            style={{ alignSelf: "flex-start" }}
          >
            Add Line
          </Button>

          <Divider />

          <Group justify="flex-end" gap="md">
            <Text fw={600}>Total: {formatCurrency(calculatedTotal)}</Text>
          </Group>

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              loading={submitting}
              leftSection={isEdit ? <IconCheck size={16} /> : <IconPlus size={16} />}
            >
              {isEdit ? "Save Changes" : "Create Credit Note"}
            </Button>
          </Group>
        </Stack>
      </Paper>
    );
  };

  // ============================================================================
  // Detail view renderer
  // ============================================================================

  const renderDetailView = (cn: CreditNote) => (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <Title order={4}>Credit Note #{cn.credit_note_no}</Title>
            <Badge color={getStatusBadgeColor(cn.status)} size="lg">
              {cn.status}
            </Badge>
          </Group>
          <Button
            variant="subtle"
            color="gray"
            onClick={() => {
              setViewMode("list");
              setDetailCreditNote(null);
            }}
            size="sm"
          >
            ← Back to list
          </Button>
        </Group>

        <Divider />

        <Grid>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Stack gap={2}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                Credit Note No
              </Text>
              <Text fw={600}>{cn.credit_note_no}</Text>
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Stack gap={2}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                Date
              </Text>
              <Text>{formatDateOnly(cn.credit_note_date)}</Text>
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Stack gap={2}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                Invoice ID
              </Text>
              <Text>{cn.invoice_id}</Text>
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Stack gap={2}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                Total Amount
              </Text>
              <Text fw={700} size="lg">
                {formatCurrency(cn.amount)}
              </Text>
            </Stack>
          </Grid.Col>
          {cn.reason && (
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                  Reason
                </Text>
                <Text>{cn.reason}</Text>
              </Stack>
            </Grid.Col>
          )}
          {cn.notes && (
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                  Notes
                </Text>
                <Text>{cn.notes}</Text>
              </Stack>
            </Grid.Col>
          )}
        </Grid>

        <Divider label="Line Items" labelPosition="left" />

        <ScrollArea>
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>Description</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Unit Price</Table.Th>
                <Table.Th ta="right">Line Total</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {cn.lines.map((line) => (
                <Table.Tr key={line.id}>
                  <Table.Td>{line.line_no}</Table.Td>
                  <Table.Td>{line.description}</Table.Td>
                  <Table.Td ta="right">{line.qty}</Table.Td>
                  <Table.Td ta="right">{formatCurrency(line.unit_price)}</Table.Td>
                  <Table.Td ta="right">
                    <Text fw={500}>{formatCurrency(line.line_total)}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        <Group justify="flex-end">
          <Text fw={700} size="lg">
            Grand Total: {formatCurrency(cn.amount)}
          </Text>
        </Group>

        <Divider label="Audit Trail" labelPosition="left" />

        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Stack gap={2}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                Created By
              </Text>
              <Text size="sm">{cn.created_by_user_id ?? "—"}</Text>
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Stack gap={2}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                Created At
              </Text>
              <Text size="sm">{new Date(cn.created_at).toLocaleString("id-ID")}</Text>
            </Stack>
          </Grid.Col>
          {cn.posted_by_user_id && (
            <>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                    Posted By
                  </Text>
                  <Text size="sm">{cn.posted_by_user_id}</Text>
                </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                    Posted At
                  </Text>
                  <Text size="sm">{cn.posted_at ? new Date(cn.posted_at).toLocaleString("id-ID") : "—"}</Text>
                </Stack>
              </Grid.Col>
            </>
          )}
          {cn.status === "VOID" && (
            <>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                    Voided By
                  </Text>
                  <Text size="sm">{cn.voided_by_user_id ?? "—"}</Text>
                </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                    Voided At
                  </Text>
                  <Text size="sm">{cn.voided_at ? new Date(cn.voided_at).toLocaleString("id-ID") : "—"}</Text>
                </Stack>
              </Grid.Col>
              {cn.void_reason && (
                <Grid.Col span={12}>
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                      Void Reason
                    </Text>
                    <Text size="sm">{cn.void_reason}</Text>
                  </Stack>
                </Grid.Col>
              )}
            </>
          )}
        </Grid>

        <Divider />

        <Group gap="sm" justify="flex-end">
          {cn.status === "DRAFT" && (
            <Button
              leftSection={<IconEdit size={16} />}
              variant="light"
              onClick={() => loadCreditNoteForEdit(cn.id)}
              loading={submitting}
            >
              Edit
            </Button>
          )}
          {cn.status === "DRAFT" && (
            <Button
              leftSection={<IconCheck size={16} />}
              color="green"
              onClick={() => handlePostClick(cn.id)}
              loading={submitting}
            >
              Post to GL
            </Button>
          )}
          {cn.status === "POSTED" && (
            <Button
              leftSection={<IconX size={16} />}
              color="red"
              variant="light"
              onClick={() => handleVoidClick(cn.id)}
              loading={submitting}
            >
              Void
            </Button>
          )}
        </Group>
      </Stack>
    </Paper>
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Stack gap="lg" p="md">
      {/* Header Card */}
      <Card withBorder shadow="sm" padding="lg">
        <Group justify="space-between" align="flex-start">
          <Stack gap="xs">
            <Group gap="xs">
              <ThemeIcon size={40} radius="md" variant="light" color="teal">
                <IconReceipt size={24} />
              </ThemeIcon>
              <div>
                <Title order={2}>Sales Credit Notes</Title>
                <Text size="sm" c="dimmed">
                  Manage credit notes for sales invoices
                </Text>
              </div>
            </Group>
          </Stack>
          <Group gap="md" align="center">
            <Select
              label="Outlet"
              data={outletOptions}
              value={String(selectedOutletId)}
              onChange={(value) => {
                if (value) setSelectedOutletId(Number(value));
              }}
              style={{ minWidth: 180 }}
              disabled={viewMode !== "list"}
            />
            {viewMode === "list" && (
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => {
                  setNewCreditNote(makeDefaultDraft());
                  setViewMode("create");
                }}
                mt={26}
              >
                New Credit Note
              </Button>
            )}
          </Group>
        </Group>
      </Card>

      {/* Alerts */}
      {error && (
        <Alert
          color="red"
          icon={<IconAlertCircle size={16} />}
          onClose={() => setError(null)}
          withCloseButton
        >
          {error}
        </Alert>
      )}

      {notice && (
        <Alert
          color={notice.color}
          icon={<IconAlertCircle size={16} />}
          onClose={() => setNotice(null)}
          withCloseButton
        >
          {notice.message}
        </Alert>
      )}

      {/* KPI Cards - only in list mode */}
      {viewMode === "list" && (
        <Grid>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Card withBorder padding="md">
              <Stack gap={0}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                  Total Credit Notes
                </Text>
                <Text size="xl" fw={700}>
                  {creditNotesTotal}
                </Text>
                <Text size="xs" c="dimmed">
                  Loaded {creditNotes.length}
                </Text>
              </Stack>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Card withBorder padding="md">
              <Stack gap={0}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                  Draft Amount
                </Text>
                <Text size="xl" fw={700} c="blue">
                  {formatCurrency(totalDraftAmount)}
                </Text>
              </Stack>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Card withBorder padding="md">
              <Stack gap={0}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                  Posted Amount
                </Text>
                <Text size="xl" fw={700} c="green">
                  {formatCurrency(totalPostedAmount)}
                </Text>
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      )}

      {/* Create form */}
      {viewMode === "create" &&
        renderCreditNoteForm(
          newCreditNote,
          setNewCreditNote,
          createCreditNote,
          () => setViewMode("list")
        )}

      {/* Edit form */}
      {viewMode === "edit" && editingCreditNote &&
        renderCreditNoteForm(
          editingCreditNote,
          setEditingCreditNote as React.Dispatch<React.SetStateAction<CreditNoteDraft>>,
          saveCreditNoteEdit,
          () => {
            setEditingCreditNote(null);
            setViewMode("list");
          },
          true,
          editingCreditNote.id
        )}

      {/* Detail view */}
      {viewMode === "detail" && detailCreditNote && renderDetailView(detailCreditNote)}

      {/* List view */}
      {viewMode === "list" && (
        <Card withBorder shadow="sm" padding="md">
          <Stack gap="md">
            {/* Filters */}
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
              <Title order={4}>Credit Note History</Title>
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

            {/* Status filter tabs */}
            <SegmentedControl
              value={statusFilter || "ALL"}
              onChange={(value) => setStatusFilter(value === "ALL" ? "" : value)}
              data={[
                { label: "All", value: "ALL" },
                { label: "Draft", value: "DRAFT" },
                { label: "Posted", value: "POSTED" },
                { label: "Void", value: "VOID" }
              ]}
            />

            <Divider />

            {loading ? (
              <Flex justify="center" p="xl">
                <Loader />
              </Flex>
            ) : creditNotes.length === 0 ? (
              <Alert color="blue" variant="light">
                No credit notes found for this outlet.
              </Alert>
            ) : (
              <ScrollArea>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Credit Note No</Table.Th>
                      <Table.Th>Invoice ID</Table.Th>
                      <Table.Th>Date</Table.Th>
                      <Table.Th ta="center">Status</Table.Th>
                      <Table.Th ta="right">Amount</Table.Th>
                      <Table.Th ta="center">Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {creditNotes.map((cn) => (
                      <Table.Tr key={cn.id}>
                        <Table.Td>
                          <Text fw={500}>{cn.credit_note_no}</Text>
                        </Table.Td>
                        <Table.Td>{cn.invoice_id}</Table.Td>
                        <Table.Td>{formatDateOnly(cn.credit_note_date)}</Table.Td>
                        <Table.Td ta="center">
                          <Badge color={getStatusBadgeColor(cn.status)} size="sm">
                            {cn.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text fw={500}>{formatCurrency(cn.amount)}</Text>
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
                                leftSection={<IconEye size={14} />}
                                onClick={() => loadCreditNoteDetail(cn.id)}
                              >
                                View
                              </Menu.Item>
                              {cn.status === "DRAFT" && (
                                <Menu.Item
                                  leftSection={<IconEdit size={14} />}
                                  onClick={() => loadCreditNoteForEdit(cn.id)}
                                >
                                  Edit
                                </Menu.Item>
                              )}
                              {cn.status === "DRAFT" && (
                                <Menu.Item
                                  leftSection={<IconCheck size={14} />}
                                  onClick={() => handlePostClick(cn.id)}
                                >
                                  Post to GL
                                </Menu.Item>
                              )}
                              {cn.status === "POSTED" && (
                                <Menu.Item
                                  leftSection={<IconX size={14} />}
                                  color="red"
                                  onClick={() => handleVoidClick(cn.id)}
                                >
                                  Void
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
      )}

      {/* Confirmation Modal */}
      <Modal
        opened={confirmAction !== null}
        onClose={() => {
          setConfirmAction(null);
          setVoidReason("");
        }}
        title={
          confirmAction?.type === "post"
            ? "Confirm Post Credit Note"
            : "Confirm Void Credit Note"
        }
        centered
      >
        <Stack gap="md">
          <Text>
            {confirmAction?.type === "post"
              ? "Are you sure you want to post this credit note? This will create journal entries in the GL."
              : "Are you sure you want to void this credit note? This action cannot be undone."}
          </Text>
          {confirmAction?.type === "void" && (
            <Textarea
              label="Void Reason"
              placeholder="Enter reason for voiding (optional)"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
            />
          )}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setConfirmAction(null);
                setVoidReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              color={confirmAction?.type === "void" ? "red" : "green"}
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
